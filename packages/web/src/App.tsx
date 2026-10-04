import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { renderSvg, type ThemeName, type WorkspaceSources } from '@trazo/core';
import { Canvas } from './Canvas.tsx';
import { CommandPalette, type CommandItem } from './CommandPalette.tsx';
import { EXAMPLE, EXAMPLE_NAME } from './example.ts';
import { Alert, Check, Command, Download, Logo, Moon, Reset, Sun } from './icons.tsx';
import { drawioFor, useDiagram } from './useDiagram.ts';

const STORAGE_KEY = 'trazo.workspace.v1';
const THEME_KEY = 'trazo.theme';

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
  const editor = useRef<ReactCodeMirrorRef>(null);

  const diagram = useDiagram(sources, viewId, theme);
  const view = diagram.workspace.views.find((v) => v.id === viewId);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const editorText = tab === 'model' ? sources.model : (sources.views[viewId] ?? '');
  const onEdit = useCallback(
    (text: string) =>
      setSources((s) => (tab === 'model' ? { ...s, model: text } : { ...s, views: { ...s.views, [viewId]: text } })),
    [tab, viewId],
  );

  /** Clicking a box in the diagram jumps to its definition in the CALM model. */
  const [selected, setSelected] = useState<string>();
  const reveal = useCallback(
    (id: string | undefined) => {
      setSelected(id);
      if (!id) return;
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
        cm.focus();
      });
    },
    [],
  );

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
    ...viewIds.map((id) => ({ id: `view-${id}`, group: 'Vistas', label: `Ir a ${titleOf(sources.views[id]) ?? id}`, run: () => setViewId(id) })),
    { id: 'theme', group: 'Apariencia', label: theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'tab-model', group: 'Editor', label: 'Editar el modelo CALM', run: () => setTab('model') },
    { id: 'tab-view', group: 'Editor', label: 'Editar la vista actual', run: () => setTab('view') },
    ...exports.map((x) => ({ id: `export-${x.id}`, group: 'Exportar', label: `Exportar ${x.label}`, run: x.run })),
    { id: 'reset', group: 'Workspace', label: 'Restablecer el ejemplo', run: () => setSources(EXAMPLE) },
  ];

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
            <button className="icon-btn small" title="Restablecer el ejemplo" onClick={() => confirm('¿Descartar tus cambios y volver al ejemplo?') && setSources(EXAMPLE)}>
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
              <div className="ok"><Check size={14} /> CALM 1.2 válido · {diagram.workspace.model.elements.size} elementos · {diagram.workspace.model.relationships.length} relaciones</div>
            ) : (
              <ul className="problems">
                {[...errors, ...warnings].slice(0, 6).map((d, i) => (
                  <li key={i} className={d.level}><Alert size={13} /> {d.message}</li>
                ))}
              </ul>
            )}
          </footer>
        </section>

        <section className="stage">
          <Canvas svg={diagram.svg} fitKey={diagram.layoutView ?? ''} busy={diagram.busy} selected={selected} onSelect={reveal} />
          <div className="hint">Arrastra para mover · ⌘/Ctrl + rueda para zoom · clic en un elemento para ver su definición</div>
        </section>
      </main>

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </div>
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
