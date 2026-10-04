import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { renderSvg, type Point, type ThemeName, type WorkspaceSources } from '@trazo/core';
import { Canvas, type Selection, type Tool } from './Canvas.tsx';
import type { CatalogEntry } from './catalog.ts';
import { CommandPalette, type CommandItem } from './CommandPalette.tsx';
import {
  addNode,
  addRelationship,
  containmentFor,
  deleteNode,
  deleteRelationship,
  reverseRelationship,
  setParent,
  updateNode,
  updateRelationship,
} from './edit.ts';
import { EXAMPLE, EXAMPLE_NAME } from './example.ts';
import { Alert, Check, Command, Connect, Download, Logo, Moon, Pointer, Redo, Reset, Shapes, Sun, Undo } from './icons.tsx';
import { ElementInspector, RelationshipInspector } from './Inspector.tsx';
import { entryByKey, Library, Picker } from './Library.tsx';
import { drawioFor, useDiagram } from './useDiagram.ts';

const STORAGE_KEY = 'trazo.workspace.v1';
const THEME_KEY = 'trazo.theme';
const HISTORY_LIMIT = 100;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage: autosave is best effort */
  }
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** True while the user types somewhere, so canvas shortcuts stay out of the way. */
function typing(): boolean {
  const el = document.activeElement;
  return !!el?.closest('input, textarea, select, .cm-editor, [contenteditable="true"]');
}

const sameSources = (a: WorkspaceSources, b: WorkspaceSources) => a.model === b.model && JSON.stringify(a.views) === JSON.stringify(b.views);

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'var(--panel)', color: 'var(--fg)' },
  '.cm-content': { fontFamily: "'JetBrains Mono', ui-monospace, monospace", caretColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--faint)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--hover)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
});

type Tab = 'model' | 'view';

export function App() {
  const [sources, setSources] = useState<WorkspaceSources>(() => load(STORAGE_KEY, EXAMPLE));
  const [theme, setTheme] = useState<ThemeName>(() =>
    load<ThemeName | null>(THEME_KEY, null) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const viewIds = Object.keys(sources.views).sort();
  const [viewId, setViewId] = useState(() => viewIds.find((v) => v === 'infra-aws') ?? viewIds[0] ?? 'default');
  const [tab, setTab] = useState<Tab>('model');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const [tool, setTool] = useState<Tool>('select');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>();
  /** Asks the inspector to focus the name field of one element (bumped to re-trigger). */
  const [focusReq, setFocusReq] = useState<{ id?: string; n: number }>({ n: 0 });
  const focusName = (id: string) => setFocusReq((r) => ({ id, n: r.n + 1 }));
  const [quickAdd, setQuickAdd] = useState<{ source: string; at: Point; group?: string }>();
  const editor = useRef<ReactCodeMirrorRef>(null);
  const stage = useRef<HTMLElement>(null);

  // Undo history of canvas edits; YAML typing uses the editor's own undo.
  const current = useRef(sources);
  current.current = sources;
  const past = useRef<WorkspaceSources[]>([]);
  const future = useRef<WorkspaceSources[]>([]);

  const diagram = useDiagram(sources, viewId, theme);
  const model = diagram.workspace.model;
  const view = diagram.workspace.views.find((v) => v.id === viewId);
  const hierarchy = view?.hierarchy ?? 'deployment';
  const kind = containmentFor(hierarchy);
  const parents = hierarchy === 'composition' ? model.composedOf : model.deployedIn;
  const errors = diagram.diagnostics.filter((d) => d.level === 'error');
  const warnings = diagram.diagnostics.filter((d) => d.level === 'warning');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    setSaved(false);
    const t = setTimeout(() => {
      save(STORAGE_KEY, sources);
      setSaved(true);
    }, 600);
    return () => clearTimeout(t);
  }, [sources]);

  /** Every canvas edit goes through here so it can be undone. */
  const commit = useCallback((next: WorkspaceSources) => {
    if (sameSources(next, current.current)) return;
    past.current = [...past.current, current.current].slice(-HISTORY_LIMIT);
    future.current = [];
    setSources(next);
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(current.current);
    setSources(prev);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    setSources(next);
  }, []);

  // A selection whose element disappeared (deleted, undone) is dropped once the model settles.
  useEffect(() => {
    if (!selection || diagram.busy) return;
    const exists = selection.kind === 'node' ? model.elements.has(selection.id) : model.relationships.some((r) => r.id === selection.id);
    if (exists) return;
    const t = setTimeout(() => setSelection(undefined), 400);
    return () => clearTimeout(t);
  }, [selection, model, diagram.busy]);

  const editorText = tab === 'model' ? sources.model : (sources.views[viewId] ?? '');
  const onEdit = useCallback(
    (text: string) =>
      setSources((s) => (tab === 'model' ? { ...s, model: text } : { ...s, views: { ...s.views, [viewId]: text } })),
    [tab, viewId],
  );

  /** Scrolls the YAML to an element's definition; `focus` moves the caret there too. */
  const reveal = useCallback((id: string, focus = false) => {
    setTab('model');
    requestAnimationFrame(() => {
      const cm = editor.current?.view;
      if (!cm) return;
      const text = cm.state.doc.toString();
      const match = new RegExp(`unique-id:\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').exec(text);
      if (!match) return;
      cm.dispatch({
        selection: { anchor: match.index, head: match.index + match[0].length },
        effects: EditorView.scrollIntoView(match.index, { y: 'center' }),
      });
      if (focus) cm.focus();
    });
  }, []);

  const select = useCallback(
    (sel: Selection | undefined) => {
      setSelection(sel);
      setQuickAdd(undefined);
      if (sel) reveal(sel.id);
    },
    [reveal],
  );

  // ---- Editing actions ---------------------------------------------------------------------
  const groupIds = new Set((diagram.layout?.nodes ?? []).filter((n) => n.isGroup).map((n) => n.id));
  /** Where a new element goes: inside the selected group, or next to the selected element. */
  const insertionParent = (): string | undefined => {
    if (!kind || selection?.kind !== 'node') return undefined;
    return groupIds.has(selection.id) ? selection.id : parents.get(selection.id);
  };

  const addEntry = (entry: CatalogEntry, parent: string | undefined, connectFrom?: string) => {
    const added = addNode(
      sources,
      viewId,
      { name: entry.label, 'node-type': entry.nodeType, icon: entry.icon, technology: entry.technology, 'group-style': entry.groupStyle },
      kind ? parent : undefined,
      kind,
    );
    const next = connectFrom ? addRelationship(added.sources, connectFrom, added.id).sources : added.sources;
    commit(next);
    setSelection({ kind: 'node', id: added.id });
    focusName(added.id);
    setQuickAdd(undefined);
  };

  const deleteSelection = () => {
    if (!selection) return;
    commit(selection.kind === 'node' ? deleteNode(sources, selection.id) : deleteRelationship(sources, selection.id));
    setSelection(undefined);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing() || paletteOpen) return;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod || e.altKey) {
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        if (quickAdd) setQuickAdd(undefined);
        else if (libraryOpen) setLibraryOpen(false);
        else setSelection(undefined);
        setTool('select');
      } else if (key === 'v' || key === 'c' || key === 'a') {
        // preventDefault keeps the letter out of the search box the library focuses.
        e.preventDefault();
        if (key === 'v') setTool('select');
        else if (key === 'c') setTool('connect');
        else setLibraryOpen((o) => !o);
      } else if (e.key === 'Enter' && selection?.kind === 'node') {
        e.preventDefault();
        focusName(selection.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exports = useMemo(
    () => [
      { id: 'svg-light', label: 'SVG claro', run: () => diagram.layout && download(`${viewId}.light.svg`, renderSvg(diagram.layout, diagram.workspace.model, { theme: 'light' }), 'image/svg+xml') },
      { id: 'svg-dark', label: 'SVG oscuro', run: () => diagram.layout && download(`${viewId}.dark.svg`, renderSvg(diagram.layout, diagram.workspace.model, { theme: 'dark' }), 'image/svg+xml') },
      { id: 'drawio', label: 'draw.io (.drawio)', run: () => { const x = drawioFor(diagram, view?.title ?? viewId); if (x) download(`${viewId}.drawio`, x, 'application/xml'); } },
      { id: 'calm', label: 'Modelo CALM (.yaml)', run: () => download('architecture.calm.yaml', sources.model, 'application/yaml') },
    ],
    [diagram, viewId, view, sources.model],
  );

  const commands: CommandItem[] = [
    { id: 'add', group: 'Dibujar', label: 'Añadir elemento o grupo', run: () => setLibraryOpen(true) },
    { id: 'connect', group: 'Dibujar', label: 'Herramienta conectar', run: () => setTool('connect') },
    { id: 'undo', group: 'Dibujar', label: 'Deshacer', run: undo },
    { id: 'redo', group: 'Dibujar', label: 'Rehacer', run: redo },
    ...viewIds.map((id) => ({ id: `view-${id}`, group: 'Vistas', label: `Ir a ${titleOf(sources.views[id]) ?? id}`, run: () => setViewId(id) })),
    { id: 'theme', group: 'Apariencia', label: theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'tab-model', group: 'Editor', label: 'Editar el modelo CALM', run: () => setTab('model') },
    { id: 'tab-view', group: 'Editor', label: 'Editar la vista actual', run: () => setTab('view') },
    ...exports.map((x) => ({ id: `export-${x.id}`, group: 'Exportar', label: `Exportar ${x.label}`, run: x.run })),
    { id: 'reset', group: 'Workspace', label: 'Restablecer el ejemplo', run: () => commit(EXAMPLE) },
  ];

  // ---- Inspector data ------------------------------------------------------------------------
  const selectedElement = selection?.kind === 'node' ? model.elements.get(selection.id) : undefined;
  const selectedRel = selection?.kind === 'edge' ? model.relationships.find((r) => r.id === selection.id) : undefined;
  const containers = useMemo(() => {
    if (!selectedElement) return [];
    const isBelow = (id: string) => {
      for (let p: string | undefined = id; p; p = parents.get(p)) if (p === selectedElement.id) return true;
      return false;
    };
    const containerIds = new Set(parents.values());
    return [...model.elements.values()]
      .filter((e) => !isBelow(e.id) && (e.groupStyle || containerIds.has(e.id)))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [selectedElement, model, parents]);
  const libraryTarget = insertionParent();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="brand-name">Trazo</span>
          <span className="crumb">/</span>
          <span className="crumb-ws">{EXAMPLE_NAME}</span>
          <span className={`save-state${saved ? '' : ' pending'}`} title="Se guarda automáticamente en este navegador">
            {saved ? <><Check size={13} /> Guardado</> : 'Guardando…'}
          </span>
        </div>

        <nav className="views" aria-label="Vistas">
          {viewIds.map((id) => (
            <button key={id} className={`view-tab${id === viewId ? ' active' : ''}`} onClick={() => setViewId(id)}>
              {titleOf(sources.views[id]) ?? id}
            </button>
          ))}
        </nav>

        <div className="actions">
          <button className="ghost-btn" onClick={() => setPaletteOpen(true)} title="Paleta de comandos">
            <Command size={14} /> <span className="kbd">⌘K</span>
          </button>
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Cambiar tema">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
          <div className="menu-wrap">
            <button className="primary-btn" onClick={() => setExportOpen((o) => !o)} disabled={!diagram.layout}>
              <Download size={15} /> Exportar
            </button>
            {exportOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setExportOpen(false)} />
                <div className="menu" role="menu">
                  {exports.map((x) => (
                    <button key={x.id} role="menuitem" onClick={() => { x.run(); setExportOpen(false); }}>{x.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="workspace">
        <section className="panel">
          <div className="panel-tabs">
            <button className={tab === 'model' ? 'active' : ''} onClick={() => setTab('model')}>
              architecture.calm.yaml
            </button>
            <button className={tab === 'view' ? 'active' : ''} onClick={() => setTab('view')}>
              {viewId}.view.yaml
            </button>
            <span className="grow" />
            <button className="icon-btn small" title="Restablecer el ejemplo (se puede deshacer)" onClick={() => commit(EXAMPLE)}>
              <Reset size={14} />
            </button>
          </div>
          <div className="editor">
            <CodeMirror
              ref={editor}
              value={editorText}
              onChange={onEdit}
              extensions={[yaml(), editorTheme, EditorView.lineWrapping]}
              theme={theme}
              height="100%"
              basicSetup={{ foldGutter: true, highlightActiveLine: true }}
            />
          </div>
          <footer className="status">
            {diagram.metrics && (
              <div className="metrics" title="Calidad del layout">
                <Metric label="cruces" value={diagram.metrics.crossings} />
                <Metric label="quiebros" value={diagram.metrics.bends} warnAt={Infinity} />
                <Metric label="solapes" value={diagram.metrics.labelOverlaps} />
                <Metric label="flechas sobre iconos" value={diagram.metrics.edgesThroughNodes} />
              </div>
            )}
            {errors.length + warnings.length === 0 ? (
              <div className="ok"><Check size={14} /> CALM 1.2 válido · {model.elements.size} elementos · {model.relationships.length} relaciones</div>
            ) : (
              <ul className="problems">
                {[...errors, ...warnings].slice(0, 6).map((d, i) => (
                  <li key={i} className={d.level}><Alert size={13} /> {d.message}</li>
                ))}
              </ul>
            )}
          </footer>
        </section>

        <section className="stage" ref={stage}>
          <Canvas
            svg={diagram.svg}
            layout={diagram.layout}
            fitKey={diagram.layoutView ?? ''}
            busy={diagram.busy}
            tool={tool}
            selection={selection}
            canNest={!!kind}
            onSelect={select}
            onOpen={(id) => { select({ kind: 'node', id }); focusName(id); }}
            onConnect={(source, target) => {
              const r = addRelationship(sources, source, target);
              commit(r.sources);
              setSelection({ kind: 'edge', id: r.id });
              setTool('select');
            }}
            onConnectToEmpty={(source, at, group) => { setSelection(undefined); setQuickAdd({ source, at, group }); }}
            onReparent={(id, group) => kind && commit(setParent(sources, id, group, kind))}
            onDropEntry={(key, group) => {
              const entry = entryByKey(key);
              if (entry) addEntry(entry, group);
            }}
          />

          <div className="toolbar" role="toolbar" aria-label="Herramientas" onPointerDown={(e) => e.stopPropagation()}>
            <ToolButton active={tool === 'select'} title="Seleccionar y mover" shortcut="V" onClick={() => setTool('select')}><Pointer size={17} /></ToolButton>
            <ToolButton active={tool === 'connect'} title="Conectar" shortcut="C" onClick={() => setTool('connect')}><Connect size={17} /></ToolButton>
            <ToolButton active={libraryOpen} title="Añadir elemento o grupo" shortcut="A" onClick={() => setLibraryOpen((o) => !o)}><Shapes size={17} /></ToolButton>
            <span className="tb-sep" />
            <ToolButton title="Deshacer" shortcut="⌘Z" disabled={!past.current.length} onClick={undo}><Undo size={17} /></ToolButton>
            <ToolButton title="Rehacer" shortcut="⇧⌘Z" disabled={!future.current.length} onClick={redo}><Redo size={17} /></ToolButton>
          </div>

          {libraryOpen && (
            <Library
              target={libraryTarget ? model.elements.get(libraryTarget)?.name : undefined}
              onPick={(entry) => addEntry(entry, libraryTarget)}
              onClose={() => setLibraryOpen(false)}
            />
          )}

          {quickAdd && (
            <>
              <div className="popover-backdrop" onPointerDown={() => setQuickAdd(undefined)} />
              <div
                className="quick-add"
                style={{
                  left: Math.max(12, Math.min(quickAdd.at.x - 20, (stage.current?.clientWidth ?? 0) - 312)),
                  top: Math.max(12, Math.min(quickAdd.at.y - 20, (stage.current?.clientHeight ?? 0) - 372)),
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <p>Conectar <b>{model.elements.get(quickAdd.source)?.name}</b> con un elemento nuevo</p>
                <Picker
                  sections={['basic', 'aws', 'ai', 'data']}
                  placeholder="¿Qué quieres añadir?"
                  onPick={(entry) => addEntry(entry, quickAdd.group, quickAdd.source)}
                  onEscape={() => setQuickAdd(undefined)}
                />
              </div>
            </>
          )}

          {selectedElement && (
            <ElementInspector
              element={selectedElement}
              model={model}
              parent={parents.get(selectedElement.id)}
              containers={containers}
              canNest={!!kind}
              focusName={focusReq.id === selectedElement.id ? focusReq.n : 0}
              onChange={(fields) => commit(updateNode(sources, selectedElement.id, fields))}
              onParent={(p) => kind && commit(setParent(sources, selectedElement.id, p, kind))}
              onDelete={deleteSelection}
              onReveal={() => reveal(selectedElement.id, true)}
              onClose={() => setSelection(undefined)}
            />
          )}
          {selectedRel && (
            <RelationshipInspector
              rel={selectedRel}
              model={model}
              onChange={(f) => commit(updateRelationship(sources, selectedRel.id, f))}
              onReverse={() => commit(reverseRelationship(sources, selectedRel.id))}
              onDelete={deleteSelection}
              onClose={() => setSelection(undefined)}
            />
          )}

          <div className="hint">
            {tool === 'connect'
              ? 'Arrastra de un elemento a otro para conectarlos, o a un hueco para crear uno nuevo'
              : 'Arrastra un elemento sobre un grupo para meterlo dentro · tira del ⊕ para conectar · doble clic para renombrar'}
          </div>
        </section>
      </main>

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

function ToolButton({ active, title, shortcut, disabled, onClick, children }: {
  active?: boolean; title: string; shortcut: string; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button className={`tool${active ? ' active' : ''}`} title={`${title} (${shortcut})`} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function Metric({ label, value, warnAt = 1 }: { label: string; value: number; warnAt?: number }) {
  return (
    <span className={`metric${value >= warnAt ? ' warn' : ''}`}>
      <b>{value}</b> {label}
    </span>
  );
}

function titleOf(viewYaml: string | undefined): string | undefined {
  return viewYaml ? /^title:\s*(.+)$/m.exec(viewYaml)?.[1]?.trim() : undefined;
}
