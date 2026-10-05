import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { layoutModelView, parseWorkspace, renderSvg, type ThemeName, type WorkspaceSources } from '@trazo/core';
import { IconGlyph } from './IconGlyph.tsx';
import { Close, Dots, Plus, Reset, Search } from './icons.tsx';
import { listLibraries, openLibrary, removeLibrary } from './storage/libraries.ts';
import type { CatalogEntry, Library, LibraryConfig } from './storage/types.ts';

interface Props {
  theme: ThemeName;
  /** Library to show first (the one the open workspace came from). */
  initial?: string;
  /** Library to switch to, e.g. one just connected. */
  focus?: string;
  /** Bumped by the app when libraries or workspaces change elsewhere. */
  revision: number;
  onOpen: (library: Library, entry: CatalogEntry) => void;
  onNew: (library: LibraryConfig) => void;
  onConnect: () => void;
  onEdit: (library: LibraryConfig) => void;
  onClose: () => void;
}

const LIBRARY_ICON: Record<LibraryConfig['kind'], string> = { browser: 'tabler:browser', github: 'logos:github-icon', gitlab: 'logos:gitlab-icon' };

/** Where a library lives, as a short line under its name. */
function whereLabel(c: LibraryConfig): string {
  if (c.kind === 'browser') return 'Workspaces guardados aquí';
  const repo = c.kind === 'github' ? `${c.owner}/${c.repo}` : c.project;
  return [repo, c.branch, c.root].filter(Boolean).join(' · ');
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Diagram thumbnails, rendered one at a time in the background and kept for the session. */
const thumbs = new Map<string, Promise<string | undefined>>();
let queue = Promise.resolve();
function thumbnail(key: string, load: () => Promise<WorkspaceSources>, theme: ThemeName): Promise<string | undefined> {
  const k = `${theme}:${key}`;
  let p = thumbs.get(k);
  if (!p) {
    p = new Promise((resolve) => {
      queue = queue.then(async () => {
        try {
          const sources = await load();
          const ws = parseWorkspace(sources);
          const view = [...ws.views].sort((a, b) => a.id.localeCompare(b.id))[0];
          if (!view) return resolve(undefined);
          const { layout } = await layoutModelView(ws.model, view);
          resolve(layout.nodes.length ? renderSvg(layout, ws.model, { theme }) : undefined);
        } catch {
          resolve(undefined);
        }
      });
    });
    thumbs.set(k, p);
  }
  return p;
}

const Thumb = memo(function Thumb({ id, load, theme }: { id: string; load: () => Promise<WorkspaceSources>; theme: ThemeName }) {
  const [svg, setSvg] = useState<string | null>();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let alive = true;
    // Only diagrams scrolled into view are laid out.
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void thumbnail(id, load, theme).then((s) => alive && setSvg(s ?? null));
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [id, load, theme]);
  return (
    <div ref={box} className={`card-thumb${svg === undefined ? ' loading' : ''}`}>
      {svg ? <div className="card-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : svg === null ? <span className="card-nothumb">Sin vista previa</span> : null}
    </div>
  );
});

/** The catalog: libraries on the left, the selected library's architectures as cards. */
export function Catalog({ theme, initial, focus, revision, onOpen, onNew, onConnect, onEdit, onClose }: Props) {
  const [libraries, setLibraries] = useState(() => listLibraries());
  const [selected, setSelected] = useState(() => (libraries.some((l) => l.id === initial) ? initial! : libraries[0]!.id));
  const config = libraries.find((l) => l.id === selected) ?? libraries[0]!;
  const library = useMemo(() => openLibrary(config), [config]);
  const [state, setState] = useState<{ entries?: CatalogEntry[]; error?: string; loading: boolean }>({ loading: true });
  const [query, setQuery] = useState('');
  const [facet, setFacet] = useState<string>();
  const [menu, setMenu] = useState<string>();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const all = listLibraries();
    setLibraries(all);
    if (focus && all.some((l) => l.id === focus)) setSelected(focus);
  }, [revision, focus]);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ entries: s.entries, loading: true }));
    library
      .list()
      .then((entries) => alive && setState({ entries, loading: false }))
      .catch((err: unknown) => alive && setState({ loading: false, error: err instanceof Error ? err.message : String(err) }));
    return () => {
      alive = false;
    };
  }, [library, reload, revision]);

  // Facets: domains, statuses and tags present in this library.
  const facets = useMemo(() => {
    const all = new Map<string, number>();
    for (const e of state.entries ?? []) for (const f of [e.domain, e.status, ...e.tags]) if (f) all.set(f, (all.get(f) ?? 0) + 1);
    return [...all].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([f]) => f);
  }, [state.entries]);

  const shown = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return (state.entries ?? []).filter((e) => {
      if (facet && ![e.domain, e.status, ...e.tags].includes(facet)) return false;
      const hay = norm([e.title, e.description, e.owner, e.domain, e.status, e.path, ...e.tags].filter(Boolean).join(' '));
      return words.every((w) => hay.includes(w));
    });
  }, [state.entries, query, facet]);

  const loader = useCallback((entry: CatalogEntry) => () => library.load(entry.path).then((l) => l.sources), [library]);
  const loaders = useMemo(() => new Map((state.entries ?? []).map((e) => [e.path, loader(e)])), [state.entries, loader]);

  return (
    <div className="catalog">
      <aside className="catalog-side" aria-label="Bibliotecas">
        <h2>Bibliotecas</h2>
        <nav>
          {libraries.map((l) => (
            <div key={l.id} className={`lib-row${l.id === config.id ? ' active' : ''}`}>
              <button className="lib-pick" onClick={() => { setSelected(l.id); setFacet(undefined); }}>
                <span className="lib-icon"><IconGlyph icon={LIBRARY_ICON[l.kind]} size={18} /></span>
                <span className="lib-text">
                  <b>{l.name}</b>
                  <small>{whereLabel(l)}</small>
                </span>
              </button>
              {l.kind !== 'browser' && (
                <span className="menu-wrap">
                  <button className="icon-btn small" title="Opciones de la biblioteca" onClick={() => setMenu(menu === l.id ? undefined : l.id)}><Dots size={14} /></button>
                  {menu === l.id && (
                    <>
                      <div className="menu-backdrop" onClick={() => setMenu(undefined)} />
                      <div className="menu" role="menu">
                        <button role="menuitem" onClick={() => { setMenu(undefined); onEdit(l); }}>Editar conexión…</button>
                        <button
                          role="menuitem"
                          className="danger"
                          onClick={() => {
                            setMenu(undefined);
                            removeLibrary(l.id);
                            setLibraries(listLibraries());
                            if (selected === l.id) setSelected('browser');
                          }}
                        >
                          Quitar de Trazo
                        </button>
                      </div>
                    </>
                  )}
                </span>
              )}
            </div>
          ))}
        </nav>
        <button className="lib-connect" onClick={onConnect}><Plus size={14} /> Conectar repositorio Git…</button>
        <p className="catalog-note">Conecta el repositorio de arquitecturas de tu empresa o equipo, en GitHub o GitLab, público o privado.</p>
      </aside>

      <section className="catalog-main">
        <header className="catalog-head">
          <div className="catalog-title">
            <h1>{config.name}</h1>
            <p>
              {whereLabel(config)}
              {config.kind !== 'browser' && !library.canWrite && <span className="pill">Solo lectura</span>}
            </p>
          </div>
          <div className="catalog-actions">
            {config.kind !== 'browser' && (
              <button className="icon-btn" title="Actualizar" onClick={() => setReload((r) => r + 1)}><Reset size={16} /></button>
            )}
            <button className="primary-btn" onClick={() => onNew(config)} disabled={config.kind !== 'browser' && !library.canWrite} title={config.kind !== 'browser' && !library.canWrite ? 'Añade un token para crear arquitecturas aquí' : undefined}>
              <Plus size={15} /> Nueva arquitectura
            </button>
            <button className="icon-btn" title="Volver al editor (Esc)" onClick={onClose}><Close size={16} /></button>
          </div>
        </header>

        <div className="catalog-filters">
          <label className="picker-search catalog-search">
            <Search size={15} />
            <input value={query} placeholder="Buscar por nombre, dominio, equipo o etiqueta…" onChange={(e) => setQuery(e.target.value)} />
          </label>
          {facets.length > 0 && (
            <div className="facets">
              {facets.map((f) => (
                <button key={f} className={`facet${facet === f ? ' active' : ''}`} aria-pressed={facet === f} onClick={() => setFacet(facet === f ? undefined : f)}>{f}</button>
              ))}
            </div>
          )}
        </div>

        {state.error ? (
          <div className="catalog-empty">
            <h2>No se pudo leer la biblioteca</h2>
            <p>{state.error}</p>
            <div className="catalog-empty-actions">
              <button className="ghost-btn" onClick={() => setReload((r) => r + 1)}>Reintentar</button>
              {config.kind !== 'browser' && <button className="primary-btn" onClick={() => onEdit(config)}>Revisar la conexión</button>}
            </div>
          </div>
        ) : state.entries && !state.entries.length ? (
          <div className="catalog-empty">
            <h2>Todavía no hay arquitecturas</h2>
            <p>
              {config.kind === 'browser'
                ? 'Crea la primera o abre un fichero desde el menú Archivo.'
                : <>Cada carpeta del repositorio con un <code>architecture.calm.yaml</code> (y sus <code>views/</code>) aparece aquí.</>}
            </p>
            {(config.kind === 'browser' || library.canWrite) && <button className="primary-btn" onClick={() => onNew(config)}><Plus size={15} /> Nueva arquitectura</button>}
          </div>
        ) : (
          <div className="cards" aria-busy={state.loading}>
            {!state.entries &&
              Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="card skeleton">
                  <div className="card-thumb loading" />
                  <div className="card-body"><span className="sk-line" /><span className="sk-line short" /></div>
                </div>
              ))}
            {shown.map((e) => (
              <button key={e.path} className="card" onClick={() => onOpen(library, e)}>
                <Thumb id={`${config.id}:${e.path}:${e.updated ?? ''}:${reload}`} load={loaders.get(e.path)!} theme={theme} />
                <div className="card-body">
                  <h3>{e.title}</h3>
                  {e.description && <p>{e.description}</p>}
                  <div className="card-tags">
                    {e.status && <span className={`tag status s-${norm(e.status).replace(/\s+/g, '-')}`}>{e.status}</span>}
                    {e.domain && <span className="tag">{e.domain}</span>}
                    {e.tags.slice(0, 3).map((t) => <span key={t} className="tag subtle">{t}</span>)}
                  </div>
                  <footer>
                    <span>{e.elements} elementos · {e.views} {e.views === 1 ? 'vista' : 'vistas'}</span>
                    {e.owner ? <span>{e.owner}</span> : config.kind !== 'browser' ? <span className="mono">{e.path || '/'}</span> : null}
                  </footer>
                </div>
              </button>
            ))}
            {state.entries && state.entries.length > 0 && !shown.length && <p className="picker-empty">Nada coincide con la búsqueda.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
