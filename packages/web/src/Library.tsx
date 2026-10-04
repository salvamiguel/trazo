import { useEffect, useMemo, useRef, useState } from 'react';
import { SECTIONS, searchCatalog, type CatalogEntry } from './catalog.ts';
import { IconGlyph } from './IconGlyph.tsx';
import { Close, Search } from './icons.tsx';

export const DRAG_TYPE = 'application/x-trazo-entry';

const byKey = new Map(SECTIONS.flatMap((s) => s.entries).map((e) => [e.key, e]));
const found = new Map<string, CatalogEntry>();

/** Resolves an entry dragged out of the library (curated or from a search). */
export function entryByKey(key: string): CatalogEntry | undefined {
  return byKey.get(key) ?? found.get(key);
}

interface PickerProps {
  onPick: (entry: CatalogEntry) => void;
  /** Sections shown before the user types; all of them by default. */
  sections?: string[];
  /** Allow dragging tiles onto the canvas. */
  draggable?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onEscape?: () => void;
}

/** Search box plus a grid of tiles; used by the library, quick-add and the icon field. */
export function Picker({ onPick, sections, draggable, placeholder = 'Buscar iconos y formas…', autoFocus = true, onEscape }: PickerProps) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const results = useMemo(() => {
    const r = searchCatalog(query);
    for (const e of r) found.set(e.key, e);
    return r;
  }, [query]);
  const shown = SECTIONS.filter((s) => !sections || sections.includes(s.id));

  const tile = (e: CatalogEntry) => (
    <button
      key={e.key}
      className="tile"
      title={e.label}
      draggable={draggable}
      onDragStart={(ev) => {
        ev.dataTransfer.setData(DRAG_TYPE, e.key);
        ev.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onPick(e)}
    >
      <span className={`tile-icon${e.groupStyle ? ' is-group' : ''}`}><IconGlyph icon={e.preview} size={26} /></span>
      <span className="tile-label">{e.label}</span>
    </button>
  );

  return (
    <div className="picker">
      <label className="picker-search">
        <Search size={15} />
        <input
          ref={input}
          value={query}
          placeholder={placeholder}
          onChange={(ev) => setQuery(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Escape') onEscape?.();
            if (ev.key === 'Enter' && results[0]) onPick(results[0]);
          }}
        />
      </label>
      <div className="picker-body">
        {query.trim() ? (
          results.length ? <div className="tiles">{results.map(tile)}</div> : <p className="picker-empty">Nada coincide con «{query}».</p>
        ) : (
          shown.map((s) => (
            <section key={s.id}>
              <h3>{s.title}</h3>
              <div className="tiles">{s.entries.map(tile)}</div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/** The shape library docked on the left of the canvas. */
export function Library({ onPick, onClose, target }: { onPick: (e: CatalogEntry) => void; onClose: () => void; target?: string }) {
  return (
    <aside className="library" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <div>
          <h2>Añadir</h2>
          <p>{target ? <>Se añade dentro de <b>{target}</b></> : 'Haz clic o arrastra al lienzo'}</p>
        </div>
        <button className="icon-btn small" title="Cerrar (Esc)" onClick={onClose}><Close size={15} /></button>
      </header>
      <Picker onPick={onPick} draggable onEscape={onClose} />
    </aside>
  );
}
