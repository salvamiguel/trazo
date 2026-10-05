import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { renderSvg, type Point, type ThemeName, type WorkspaceSources } from '@trazo/core';
import { Canvas, PIN_LABEL, type Selection, type Tool } from './Canvas.tsx';
import type { CatalogEntry } from './catalog.ts';
import { CommandPalette, type CommandItem } from './CommandPalette.tsx';
import {
  addNode,
  addRelationship,
  containmentFor,
  deleteNode,
  deleteRelationship,
  freshViewId,
  renameView,
  reverseRelationship,
  setInView,
  setPin,
  setParent,
  updateNode,
  updateRelationship,
} from './edit.ts';
import { ConfirmDialog, ErrorDialog, NewViewDialog, NewWorkspaceDialog, RenameDialog } from './Dialogs.tsx';
import {
  canLinkFolders,
  ensurePermission,
  openFolder,
  pickSaveFolder,
  readPickedFiles,
  workspaceFiles,
  recallFolder,
  rememberFolder,
  writeFolder,
  MODEL_FILE,
  type DirHandle,
  type OpenedFolder,
} from './folder.ts';
import { Alert, Check, Code, Command, Grid, Upload, Connect, Dots, Download, Folder, History, Logo, Moon, PanelLeft, Plus, Pointer, Redo, Shapes, Sun, Undo } from './icons.tsx';
import * as history from './history.ts';
import { HistoryPanel, versionTime } from './HistoryPanel.tsx';
import { svgToPng } from './png.ts';
import { ElementInspector, RelationshipInspector } from './Inspector.tsx';
import { entryByKey, Library, Picker } from './Library.tsx';
import { TEMPLATES, viewYaml } from './templates.ts';
import { drawioFor, useDiagram } from './useDiagram.ts';
import { WorkspaceMenu } from './WorkspaceMenu.tsx';
import { FileMenu, MOD, useFilePickers } from './FileMenu.tsx';
import { writeZip } from './zip.ts';
import { Catalog } from './Catalog.tsx';
import { ConnectLibraryDialog, NewArchitectureDialog, PublishDialog } from './LibraryDialogs.tsx';
import { matchesVersion } from './storage/git.ts';
import { listLibraries, openLibrary } from './storage/libraries.ts';
import type { CatalogEntry as ArchEntry, Library as ArchLibrary, LibraryConfig, Origin } from './storage/types.ts';
import * as store from './workspaces.ts';

const THEME_KEY = 'trazo.theme';
const EDITOR_KEY = 'trazo.editor';
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

function download(name: string, content: string | Blob, type: string) {
  const url = URL.createObjectURL(typeof content === 'string' ? new Blob([content], { type }) : content);
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

type Dialog =
  | { kind: 'new-workspace' }
  | { kind: 'rename-workspace' }
  | { kind: 'delete-workspace' }
  | { kind: 'new-view' }
  | { kind: 'rename-view'; id: string }
  | { kind: 'delete-view'; id: string }
  | { kind: 'error'; message: string }
  | { kind: 'connect-library'; editing?: LibraryConfig & { kind: 'github' | 'gitlab' } }
  | { kind: 'new-architecture'; library: LibraryConfig }
  | { kind: 'publish' };

/** A workspace synced with a folder on disk; `ok` is false until write access is granted. */
interface FolderLink {
  handle: DirHandle;
  modelFile: string;
  ok: boolean;
  error?: string;
}

const firstView = (s: WorkspaceSources, prefer?: string) => {
  const ids = Object.keys(s.views).sort();
  return ids.find((v) => v === prefer) ?? ids[0] ?? 'default';
};

export function App() {
  const [workspaces, setWorkspaces] = useState(() => store.listWorkspaces());
  const [wsId, setWsId] = useState<string>(() => {
    const active = store.activeWorkspace();
    return workspaces.find((w) => w.id === active)?.id ?? workspaces[0]!.id;
  });
  const [sources, setSources] = useState<WorkspaceSources>(() => store.loadSources(wsId) ?? TEMPLATES[0]!.sources);
  const [link, setLink] = useState<FolderLink>();
  const [dialog, setDialog] = useState<Dialog>();
  const [viewMenu, setViewMenu] = useState(false);
  const [theme, setTheme] = useState<ThemeName>(() =>
    load<ThemeName | null>(THEME_KEY, null) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const viewIds = Object.keys(sources.views).sort();
  const [viewId, setViewId] = useState(() => firstView(sources, 'infra-aws'));
  // A view that disappeared (deleted, or another workspace) falls back to the first one.
  useEffect(() => {
    if (!(viewId in sources.views) && viewIds[0]) setViewId(viewIds[0]);
  }, [viewId, sources.views, viewIds]);
  const [tab, setTab] = useState<Tab>('model');
  const [editorOpen, setEditorOpen] = useState(() => load(EDITOR_KEY, true));
  useEffect(() => save(EDITOR_KEY, editorOpen), [editorOpen]);
  const toggleEditor = () => setEditorOpen((o) => !o);
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [screen, setScreen] = useState<'editor' | 'catalog'>('editor');
  /** Bumped when libraries or published versions change, so the catalog re-reads them. */
  const [catalogRev, setCatalogRev] = useState(0);
  const [catalogFocus, setCatalogFocus] = useState<string>();
  /** An earlier version shown read-only on the canvas and in the editor. */
  const [preview, setPreview] = useState<history.Version>();
  const editor = useRef<ReactCodeMirrorRef>(null);
  const stage = useRef<HTMLElement>(null);

  // Undo history of canvas edits; YAML typing uses the editor's own undo.
  const current = useRef(sources);
  current.current = sources;
  const past = useRef<WorkspaceSources[]>([]);
  const future = useRef<WorkspaceSources[]>([]);

  const shown = preview?.sources ?? sources;
  const diagram = useDiagram(shown, viewId, theme);
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

  // Autosave to this browser, and to the linked folder when there is one.
  useEffect(() => {
    setSaved(false);
    const t = setTimeout(async () => {
      store.saveSources(wsId, sources);
      setWorkspaces(store.listWorkspaces());
      void history.snapshot(wsId, sources);
      if (link?.ok) {
        try {
          await writeFolder(link.handle, sources, link.modelFile);
          if (link.error) setLink({ ...link, error: undefined });
        } catch (err) {
          setLink({ ...link, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
      setSaved(true);
    }, 600);
    return () => clearTimeout(t);
  }, [sources, wsId, link]);

  // Folder links survive reloads, but the browser asks again for write access.
  useEffect(() => {
    let cancelled = false;
    setLink(undefined);
    recallFolder(wsId).then(async (saved) => {
      if (!saved || cancelled) return;
      const granted = await (saved.handle as DirHandle).queryPermission({ mode: 'readwrite' }).catch(() => 'denied');
      if (!cancelled) setLink({ ...saved, ok: granted === 'granted' });
    });
    return () => {
      cancelled = true;
    };
  }, [wsId]);

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

  const editorText = tab === 'model' ? shown.model : (shown.views[viewId] ?? '');
  const onEdit = useCallback(
    (text: string) =>
      setSources((s) => (tab === 'model' ? { ...s, model: text } : { ...s, views: { ...s.views, [viewId]: text } })),
    [tab, viewId],
  );

  /** Scrolls the YAML to an element's definition; `focus` moves the caret there too. */
  const reveal = useCallback((id: string, focus = false) => {
    setTab('model');
    if (focus) setEditorOpen(true);
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
      if (mod && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void saveNow();
        return;
      }
      if (mod && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        pickers.pickFiles();
        return;
      }
      if (mod && e.key === '\\') {
        e.preventDefault();
        toggleEditor();
        return;
      }
      if (typing() || paletteOpen || dialog) return;
      const key = e.key.toLowerCase();
      if (screen === 'catalog') {
        if (e.key === 'Escape') setScreen('editor');
        return;
      }
      if (preview) {
        if (e.key === 'Escape') setPreview(undefined);
        return;
      }
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

  // ---- Workspaces and folders ----------------------------------------------------------------
  const fail = (err: unknown) => setDialog({ kind: 'error', message: err instanceof Error ? err.message : String(err) });

  const switchTo = (id: string, next?: WorkspaceSources) => {
    const loaded = next ?? store.loadSources(id);
    if (!loaded) return;
    store.saveSources(wsId, current.current);
    void history.snapshot(wsId, current.current, { reason: 'before-switch', force: true });
    setPreview(undefined);
    store.setActiveWorkspace(id);
    past.current = [];
    future.current = [];
    setWsId(id);
    setSources(loaded);
    setViewId(firstView(loaded));
    setSelection(undefined);
    setWorkspaces(store.listWorkspaces());
  };

  const adopt = async (opened: OpenedFolder) => {
    const meta = store.createWorkspace(opened.name, opened.sources, opened.handle ? opened.name : undefined);
    if (opened.handle) await rememberFolder(meta.id, { handle: opened.handle, modelFile: opened.modelFile });
    switchTo(meta.id, opened.sources);
    if (opened.handle) setLink({ handle: opened.handle, modelFile: opened.modelFile, ok: true });
  };

  const openFolderAction = async () => {
    try {
      const opened = await openFolder();
      if (opened) await adopt(opened);
    } catch (err) {
      fail(err);
    }
  };

  const importFiles = async (files: FileList) => {
    try {
      await adopt(await readPickedFiles(files));
    } catch (err) {
      fail(err);
    }
  };

  const saveToFolder = async () => {
    try {
      const handle = await pickSaveFolder();
      if (!handle) return;
      await writeFolder(handle, sources, MODEL_FILE);
      await rememberFolder(wsId, { handle, modelFile: MODEL_FILE });
      store.touch(wsId, { folder: handle.name });
      setWorkspaces(store.listWorkspaces());
      setLink({ handle, modelFile: MODEL_FILE, ok: true });
    } catch (err) {
      fail(err);
    }
  };

  const reconnect = async () => {
    if (!link) return;
    try {
      if (await ensurePermission(link.handle)) {
        await writeFolder(link.handle, current.current, link.modelFile);
        setLink({ ...link, ok: true, error: undefined });
      }
    } catch (err) {
      fail(err);
    }
  };

  const unlink = async () => {
    await rememberFolder(wsId, undefined);
    store.touch(wsId, { folder: undefined });
    setWorkspaces(store.listWorkspaces());
    setLink(undefined);
  };

  const activeMeta = workspaces.find((w) => w.id === wsId) ?? workspaces[0]!;

  const pickers = useFilePickers(importFiles);
  const zipName = () => `${activeMeta.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'trazo'}.zip`;
  const downloadZip = () =>
    download(zipName(), new Blob([writeZip(workspaceFiles(current.current, link?.modelFile)) as BlobPart], { type: 'application/zip' }), 'application/zip');
  /** ⌘S: writes to the synced folder now; otherwise picks a folder to sync with, or downloads a .zip. */
  const saveNow = async () => {
    store.saveSources(wsId, current.current);
    void history.snapshot(wsId, current.current, { force: true });
    if (origin) return startPublish();
    if (link) {
      if (!link.ok) return reconnect();
      try {
        await writeFolder(link.handle, current.current, link.modelFile);
        setSaved(true);
      } catch (err) {
        fail(err);
      }
    } else if (canLinkFolders) await saveToFolder();
    else downloadZip();
  };

  // ---- Libraries -----------------------------------------------------------------------------
  const origin = activeMeta.origin;
  const originLibrary = origin ? listLibraries().find((l) => l.id === origin.library) : undefined;
  const [unpublished, setUnpublished] = useState(false);
  useEffect(() => {
    if (!origin) return setUnpublished(false);
    let alive = true;
    const t = setTimeout(() => {
      void matchesVersion(origin.path, sources, origin.modelFile, origin.version).then((same) => alive && setUnpublished(!same));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [sources, origin]);

  /** Opens an architecture: its workspace if one is already open from there, else a new local copy. */
  const openFromLibrary = async (library: ArchLibrary, entry: ArchEntry) => {
    try {
      if (library.config.kind === 'browser') {
        if (entry.path !== wsId) switchTo(entry.path);
      } else {
        const existing = store.listWorkspaces().find((w) => w.origin?.library === library.config.id && w.origin?.path === entry.path);
        if (existing) {
          if (existing.id !== wsId) switchTo(existing.id);
        } else {
          const loaded = await library.load(entry.path);
          const o: Origin = { library: library.config.id, path: entry.path, modelFile: loaded.modelFile, version: loaded.version };
          const meta = store.createWorkspace(entry.title, loaded.sources, undefined, o);
          switchTo(meta.id, loaded.sources);
        }
      }
      setScreen('editor');
    } catch (err) {
      fail(err);
    }
  };

  const createArchitecture = (library: LibraryConfig, title: string, folder: string, sources: WorkspaceSources) => {
    const o: Origin | undefined = library.kind === 'browser' ? undefined : { library: library.id, path: folder, modelFile: MODEL_FILE, version: {} };
    const meta = store.createWorkspace(title, sources, undefined, o);
    switchTo(meta.id, sources);
    setScreen('editor');
    setDialog(undefined);
  };

  const publish = async (message: string, review: boolean, force: boolean) => {
    if (!origin || !originLibrary) throw new Error('La biblioteca de esta arquitectura ya no está conectada.');
    store.saveSources(wsId, current.current);
    const r = await openLibrary(originLibrary).publish(origin.path, current.current, origin.modelFile, origin.version, { message, review, force, branch: origin.branch });
    if (r.ok) {
      store.touch(wsId, { origin: { ...origin, version: r.version, published: r.url, branch: r.branch } });
      setWorkspaces(store.listWorkspaces());
      setCatalogRev((n) => n + 1);
      void history.snapshot(wsId, current.current, { name: review ? 'Publicada para revisión' : 'Publicada' });
    }
    return r;
  };
  const startPublish = () => {
    if (!origin) return;
    if (!originLibrary) return fail(new Error('La biblioteca de esta arquitectura ya no está conectada. Vuelve a conectarla desde el catálogo.'));
    if (!openLibrary(originLibrary).canWrite) return fail(new Error(`«${originLibrary.name}» es de solo lectura: añade un token desde el catálogo para publicar, o descarga una copia .zip.`));
    setDialog({ kind: 'publish' });
  };

  // ---- Version history -----------------------------------------------------------------------
  const openHistory = () => {
    setHistoryOpen(true);
    setSelection(undefined);
    setLibraryOpen(false);
  };
  const closeHistory = () => {
    setHistoryOpen(false);
    setPreview(undefined);
  };
  const previewVersion = (v: history.Version | undefined) => {
    setPreview(v);
    setSelection(undefined);
    setQuickAdd(undefined);
    setTool('select');
  };
  /** Restoring is an edit like any other: the state it replaces is kept as a version and ⌘Z undoes it. */
  const restore = async (v: history.Version) => {
    await history.snapshot(wsId, current.current, { reason: 'before-restore', force: true });
    commit(v.sources);
    setPreview(undefined);
  };
  const saveNamed = (name: string) => {
    store.saveSources(wsId, current.current);
    void history.snapshot(wsId, current.current, { name });
  };

  const exportPng = async (t: ThemeName) => {
    if (!diagram.layout) return;
    try {
      const svg = renderSvg(diagram.layout, diagram.layoutModel ?? model, { theme: t });
      download(`${viewId}.${t}.png`, await svgToPng(svg), 'image/png');
    } catch (err) {
      fail(err);
    }
  };

  const exports = useMemo(
    () => [
      { id: 'svg-light', label: 'SVG claro', run: () => diagram.layout && download(`${viewId}.light.svg`, renderSvg(diagram.layout, diagram.layoutModel ?? model, { theme: 'light' }), 'image/svg+xml') },
      { id: 'svg-dark', label: 'SVG oscuro', run: () => diagram.layout && download(`${viewId}.dark.svg`, renderSvg(diagram.layout, diagram.layoutModel ?? model, { theme: 'dark' }), 'image/svg+xml') },
      { id: 'png-light', label: 'PNG claro', run: () => void exportPng('light') },
      { id: 'png-dark', label: 'PNG oscuro', run: () => void exportPng('dark') },
      { id: 'drawio', label: 'draw.io (.drawio)', run: () => { const x = drawioFor(diagram, view?.title ?? viewId); if (x) download(`${viewId}.drawio`, x, 'application/xml'); } },
      { id: 'calm', label: 'Modelo CALM (.yaml)', run: () => download('architecture.calm.yaml', shown.model, 'application/yaml') },
    ],
    [diagram, viewId, view, shown.model],
  );

  const commands: CommandItem[] = [
    { id: 'add', group: 'Dibujar', label: 'Añadir elemento o grupo', run: () => setLibraryOpen(true) },
    { id: 'connect', group: 'Dibujar', label: 'Herramienta conectar', run: () => setTool('connect') },
    { id: 'undo', group: 'Dibujar', label: 'Deshacer', run: undo },
    { id: 'redo', group: 'Dibujar', label: 'Rehacer', run: redo },
    ...viewIds.map((id) => ({ id: `view-${id}`, group: 'Vistas', label: `Ir a ${titleOf(sources.views[id]) ?? id}`, run: () => setViewId(id) })),
    { id: 'history', group: 'Historial', label: 'Ver historial de versiones', run: openHistory },
    { id: 'save-version', group: 'Historial', label: 'Guardar versión con nombre…', run: openHistory },
    { id: 'theme', group: 'Apariencia', label: theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'editor', group: 'Editor', label: editorOpen ? 'Ocultar el editor de código' : 'Mostrar el editor de código', run: toggleEditor },
    { id: 'tab-model', group: 'Editor', label: 'Editar el modelo CALM', run: () => setTab('model') },
    { id: 'tab-view', group: 'Editor', label: 'Editar la vista actual', run: () => setTab('view') },
    ...exports.map((x) => ({ id: `export-${x.id}`, group: 'Exportar', label: `Exportar ${x.label}`, run: x.run })),
    { id: 'new-view', group: 'Vistas', label: 'Nueva vista…', run: () => setDialog({ kind: 'new-view' }) },
    { id: 'catalog', group: 'Bibliotecas', label: 'Abrir el catálogo de arquitecturas', run: () => setScreen('catalog') },
    { id: 'connect', group: 'Bibliotecas', label: 'Conectar un repositorio Git…', run: () => setDialog({ kind: 'connect-library' }) },
    ...(origin ? [{ id: 'publish', group: 'Bibliotecas', label: `Publicar en ${originLibrary?.name ?? 'la biblioteca'}…`, run: startPublish }] : []),
    { id: 'new-ws', group: 'Archivo', label: 'Nuevo diagrama…', run: () => setDialog({ kind: 'new-workspace' }) },
    { id: 'open-file', group: 'Archivo', label: `Abrir fichero… (${MOD}O)`, run: pickers.pickFiles },
    ...(canLinkFolders ? [{ id: 'open-folder', group: 'Archivo', label: 'Abrir carpeta…', run: openFolderAction }] : []),
    { id: 'save', group: 'Archivo', label: `Guardar (${MOD}S)`, run: () => void saveNow() },
    { id: 'zip', group: 'Archivo', label: 'Descargar como .zip', run: downloadZip },
    ...workspaces.filter((w) => w.id !== wsId).map((w) => ({ id: `ws-${w.id}`, group: 'Workspace', label: `Abrir ${w.name}`, run: () => switchTo(w.id) })),
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
          {pickers.inputs}
          <button className={`menu-button${screen === 'catalog' ? ' active' : ''}`} onClick={() => setScreen(screen === 'catalog' ? 'editor' : 'catalog')} aria-pressed={screen === 'catalog'}>
            <Grid size={14} /> Catálogo
          </button>
          <FileMenu
            canLinkFolders={canLinkFolders}
            folder={link?.handle.name}
            pickFiles={pickers.pickFiles}
            pickFolder={pickers.pickFolder}
            onNew={() => setDialog({ kind: 'new-workspace' })}
            onOpenFiles={importFiles}
            onOpenFolder={openFolderAction}
            onSave={() => void saveNow()}
            onDownload={downloadZip}
            onSaveToFolder={saveToFolder}
            onUnlink={unlink}
            onHistory={openHistory}
            onCatalog={() => setScreen('catalog')}
            publishTo={origin ? (originLibrary?.name ?? 'la biblioteca') : undefined}
            onPublish={startPublish}
          />
          <span className="crumb">/</span>
          <WorkspaceMenu
            workspaces={workspaces}
            active={activeMeta}
            onSwitch={(id) => id !== wsId && switchTo(id)}
            onNew={() => setDialog({ kind: 'new-workspace' })}
            onRename={() => setDialog({ kind: 'rename-workspace' })}
            onDelete={() => setDialog({ kind: 'delete-workspace' })}
          />
          {origin ? (
            <button
              className={`save-state origin${unpublished ? ' unpublished' : ''}`}
              onClick={startPublish}
              title={unpublished ? `Hay cambios guardados en este navegador que aún no están en ${originLibrary?.name ?? 'su biblioteca'}` : `Igual que en ${originLibrary?.name ?? 'su biblioteca'}`}
            >
              {unpublished ? <Upload size={13} /> : <Check size={13} />}
              <span>{unpublished ? 'Publicar' : 'Al día'}</span>
            </button>
          ) : link && !link.ok ? (
            <button className="save-state reconnect" onClick={reconnect} title={link.error ?? 'El navegador pide permiso de nuevo tras recargar'}>
              <Folder size={13} /> Reconectar {link.handle.name}
            </button>
          ) : (
            <span className={`save-state${saved ? '' : ' pending'}`} title={link ? `Se guarda en la carpeta ${link.handle.name}` : 'Se guarda automáticamente en este navegador'}>
              {saved ? <><Check size={13} /> {link ? `Guardado en ${link.handle.name}` : 'Guardado'}</> : 'Guardando…'}
            </span>
          )}
        </div>

        <nav className="views" aria-label="Vistas">
          {viewIds.map((id) => (
            <span key={id} className={`view-tab${id === viewId ? ' active' : ''}`}>
              <button onClick={() => setViewId(id)}>{titleOf(sources.views[id]) ?? id}</button>
              {id === viewId && (
                <span className="menu-wrap">
                  <button className="view-more" title="Opciones de la vista" onClick={() => setViewMenu((o) => !o)}><Dots size={14} /></button>
                  {viewMenu && (
                    <>
                      <div className="menu-backdrop" onClick={() => setViewMenu(false)} />
                      <div className="menu view-menu" role="menu">
                        <button role="menuitem" onClick={() => { setViewMenu(false); setDialog({ kind: 'rename-view', id }); }}>Renombrar…</button>
                        <button role="menuitem" onClick={() => { setViewMenu(false); setTab('view'); }}>Editar YAML de la vista</button>
                        <button role="menuitem" className="danger" disabled={viewIds.length < 2} onClick={() => { setViewMenu(false); setDialog({ kind: 'delete-view', id }); }}>Eliminar vista…</button>
                      </div>
                    </>
                  )}
                </span>
              )}
            </span>
          ))}
          <button className="view-add" title="Nueva vista" onClick={() => setDialog({ kind: 'new-view' })}><Plus size={15} /></button>
        </nav>

        <div className="actions">
          <button className="ghost-btn" onClick={() => setPaletteOpen(true)} title="Paleta de comandos">
            <Command size={14} /> <span className="kbd">⌘K</span>
          </button>
          <button className={`icon-btn${editorOpen ? ' active' : ''}`} onClick={toggleEditor} title={`${editorOpen ? 'Ocultar' : 'Mostrar'} el editor de código (⌘\\)`} aria-pressed={editorOpen}>
            <Code />
          </button>
          <button className={`icon-btn${historyOpen ? ' active' : ''}`} onClick={() => (historyOpen ? closeHistory() : openHistory())} title="Historial de versiones" aria-pressed={historyOpen}>
            <History />
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

      {screen === 'catalog' && (
        <Catalog
          theme={theme}
          initial={origin?.library}
          focus={catalogFocus}
          revision={catalogRev}
          onOpen={(lib, e) => void openFromLibrary(lib, e)}
          onNew={(library) => setDialog({ kind: 'new-architecture', library })}
          onConnect={() => setDialog({ kind: 'connect-library' })}
          onEdit={(l) => l.kind !== 'browser' && setDialog({ kind: 'connect-library', editing: l })}
          onClose={() => setScreen('editor')}
        />
      )}
      <main className={`workspace${editorOpen ? '' : ' no-editor'}`} hidden={screen === 'catalog'}>
        {editorOpen && <section className="panel">
          <div className="panel-tabs">
            <button className={tab === 'model' ? 'active' : ''} onClick={() => setTab('model')}>
              {link?.modelFile ?? MODEL_FILE}
            </button>
            <button className={tab === 'view' ? 'active' : ''} onClick={() => setTab('view')}>
              {viewId}.view.yaml
            </button>
            <span className="grow" />
            <button className="icon-btn small" title="Ocultar el editor (⌘\\)" onClick={toggleEditor}><PanelLeft size={15} /></button>
          </div>
          <div className="editor">
            <CodeMirror
              ref={editor}
              value={editorText}
              onChange={onEdit}
              editable={!preview}
              readOnly={!!preview}
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
        </section>}

        <section className="stage" ref={stage}>
          <Canvas
            svg={diagram.svg}
            layout={diagram.layout}
            fitKey={diagram.layoutView ?? ''}
            busy={diagram.busy}
            tool={tool}
            readOnly={!!preview}
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
            pins={view?.pins ?? []}
            onPin={(id, pin) => commit(setPin(sources, viewId, id, pin))}
            onDropEntry={(key, group) => {
              const entry = entryByKey(key);
              if (entry) addEntry(entry, group);
            }}
          />

          {!preview && <div className="toolbar" role="toolbar" aria-label="Herramientas" onPointerDown={(e) => e.stopPropagation()}>
            <ToolButton active={tool === 'select'} title="Seleccionar y mover" shortcut="V" onClick={() => setTool('select')}><Pointer size={17} /></ToolButton>
            <ToolButton active={tool === 'connect'} title="Conectar" shortcut="C" onClick={() => setTool('connect')}><Connect size={17} /></ToolButton>
            <ToolButton active={libraryOpen} title="Añadir elemento o grupo" shortcut="A" onClick={() => setLibraryOpen((o) => !o)}><Shapes size={17} /></ToolButton>
            <span className="tb-sep" />
            <ToolButton title="Deshacer" shortcut="⌘Z" disabled={!past.current.length} onClick={undo}><Undo size={17} /></ToolButton>
            <ToolButton title="Rehacer" shortcut="⇧⌘Z" disabled={!future.current.length} onClick={redo}><Redo size={17} /></ToolButton>
          </div>}

          {preview && (
            <div className="preview-banner" onPointerDown={(e) => e.stopPropagation()}>
              <History size={15} />
              <span>
                Viendo la versión de las <b>{versionTime(preview.at)}</b>
                {preview.name && <> · {preview.name}</>}
              </span>
              <button className="primary-btn small" onClick={() => void restore(preview)}>Restaurar</button>
              <button className="ghost-btn" onClick={() => setPreview(undefined)}>Volver a la actual</button>
            </div>
          )}

          {historyOpen && (
            <HistoryPanel
              ws={wsId}
              previewing={preview?.id}
              onPreview={previewVersion}
              onRestore={(v) => void restore(v)}
              onSaveNamed={saveNamed}
              onClose={closeHistory}
            />
          )}

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

          {selectedElement && !historyOpen && (
            <ElementInspector
              element={selectedElement}
              model={model}
              parent={parents.get(selectedElement.id)}
              containers={containers}
              canNest={!!kind}
              views={diagram.workspace.views.map((v) => ({
                id: v.id,
                title: v.title ?? v.id,
                all: v.includeAll,
                shown: v.includeAll || v.include.includes(selectedElement.id),
              }))}
              onToggleView={(v, shown) => commit(setInView(sources, v, selectedElement.id, shown))}
              pin={(() => {
                const pin = view?.pins.find((p) => p.id === selectedElement.id);
                return pin && { label: PIN_LABEL[pin.side], of: model.elements.get(pin.of)?.name ?? pin.of };
              })()}
              onUnpin={() => commit(setPin(sources, viewId, selectedElement.id, undefined))}
              focusName={focusReq.id === selectedElement.id ? focusReq.n : 0}
              onChange={(fields) => commit(updateNode(sources, selectedElement.id, fields))}
              onParent={(p) => kind && commit(setParent(sources, selectedElement.id, p, kind))}
              onDelete={deleteSelection}
              onReveal={() => reveal(selectedElement.id, true)}
              onClose={() => setSelection(undefined)}
            />
          )}
          {selectedRel && !historyOpen && (
            <RelationshipInspector
              rel={selectedRel}
              model={model}
              onChange={(f) => commit(updateRelationship(sources, selectedRel.id, f))}
              onReverse={() => commit(reverseRelationship(sources, selectedRel.id))}
              onDelete={deleteSelection}
              onClose={() => setSelection(undefined)}
            />
          )}

          {diagram.layout && diagram.layout.nodes.length === 0 && !diagram.busy && (
            <div className="empty-state">
              <h2>{model.elements.size ? 'Esta vista está vacía' : 'Empieza tu diagrama'}</h2>
              <p>
                {model.elements.size
                  ? 'Añade elementos nuevos o marca en el inspector los que ya existen en el modelo.'
                  : 'Añade elementos y grupos desde la biblioteca, o escribe el modelo CALM a la izquierda.'}
              </p>
              <button className="primary-btn" onClick={() => setLibraryOpen(true)}><Shapes size={15} /> Añadir elemento</button>
              <span className="kbd-hint">o pulsa A</span>
            </div>
          )}

          <div className="hint">
            {preview
              ? 'Versión anterior, solo lectura · Esc para volver a la actual'
              : tool === 'connect'
              ? 'Arrastra de un elemento a otro para conectarlos, o a un hueco para crear uno nuevo'
              : 'Arrastra un elemento sobre un grupo para meterlo dentro · tira del ⊕ para conectar · doble clic para renombrar'}
          </div>
        </section>
      </main>

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}

      {dialog?.kind === 'new-workspace' && (
        <NewWorkspaceDialog
          onClose={() => setDialog(undefined)}
          onCreate={(name, t) => {
            const meta = store.createWorkspace(name, t.sources);
            setDialog(undefined);
            switchTo(meta.id, t.sources);
          }}
        />
      )}
      {dialog?.kind === 'rename-workspace' && (
        <RenameDialog
          title="Renombrar workspace"
          label="Nombre"
          value={activeMeta.name}
          onClose={() => setDialog(undefined)}
          onSave={(name) => {
            store.touch(wsId, { name });
            setWorkspaces(store.listWorkspaces());
            setDialog(undefined);
          }}
        />
      )}
      {dialog?.kind === 'delete-workspace' && (
        <ConfirmDialog
          title="Eliminar workspace"
          message={<>Se borra <b>{activeMeta.name}</b> de este navegador.{link ? ' Los ficheros de la carpeta no se tocan.' : ' No se puede deshacer.'}</>}
          action="Eliminar"
          onClose={() => setDialog(undefined)}
          onConfirm={() => {
            const next = workspaces.find((w) => w.id !== wsId);
            if (!next) return;
            const gone = wsId;
            setDialog(undefined);
            void rememberFolder(gone, undefined);
            void history.deleteHistory(gone);
            switchTo(next.id);
            store.deleteWorkspace(gone);
            setWorkspaces(store.listWorkspaces());
          }}
        />
      )}
      {dialog?.kind === 'new-view' && (
        <NewViewDialog
          hasElements={model.elements.size > 0}
          onClose={() => setDialog(undefined)}
          onCreate={(title, k, empty) => {
            const id = freshViewId(sources, title);
            commit({ ...sources, views: { ...sources.views, [id]: viewYaml(title, k, empty ? [] : undefined) } });
            setViewId(id);
            setDialog(undefined);
          }}
        />
      )}
      {dialog?.kind === 'rename-view' && (
        <RenameDialog
          title="Renombrar vista"
          label="Título"
          value={titleOf(sources.views[dialog.id]) ?? dialog.id}
          onClose={() => setDialog(undefined)}
          onSave={(title) => {
            commit(renameView(sources, dialog.id, title));
            setDialog(undefined);
          }}
        />
      )}
      {dialog?.kind === 'delete-view' && (
        <ConfirmDialog
          title="Eliminar vista"
          message={<>Se elimina la vista <b>{titleOf(sources.views[dialog.id]) ?? dialog.id}</b>. Los elementos siguen en el modelo y en las demás vistas. Puedes deshacerlo con ⌘Z.</>}
          action="Eliminar vista"
          onClose={() => setDialog(undefined)}
          onConfirm={() => {
            const { [dialog.id]: _gone, ...views } = sources.views;
            commit({ ...sources, views });
            setDialog(undefined);
          }}
        />
      )}
      {dialog?.kind === 'connect-library' && (
        <ConnectLibraryDialog
          editing={dialog.editing}
          onClose={() => setDialog(undefined)}
          onDone={(config) => {
            setDialog(undefined);
            setCatalogFocus(config.id);
            setCatalogRev((n) => n + 1);
          }}
        />
      )}
      {dialog?.kind === 'new-architecture' && (
        <NewArchitectureDialog
          library={dialog.library}
          onClose={() => setDialog(undefined)}
          onCreate={(title, folder, t) => createArchitecture(dialog.library, title, folder, t.sources)}
        />
      )}
      {dialog?.kind === 'publish' && origin && originLibrary && originLibrary.kind !== 'browser' && (
        <PublishDialog
          library={originLibrary}
          path={origin.path}
          title={activeMeta.name}
          isNew={!Object.keys(origin.version).length}
          openReview={origin.branch ? origin.published : undefined}
          onPublish={publish}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === 'error' && <ErrorDialog message={dialog.message} onClose={() => setDialog(undefined)} />}
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
