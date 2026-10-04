import { useEffect, useMemo, useRef, useState } from 'react';

export interface CommandItem {
  id: string;
  group: string;
  label: string;
  run: () => void;
}

export function CommandPalette({ commands, onClose }: { commands: CommandItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return q ? commands.filter((c) => norm(`${c.group} ${c.label}`).includes(norm(q))) : commands;
  }, [commands, query]);

  const run = (c: CommandItem | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Paleta de comandos" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={query}
          placeholder="Escribe un comando…"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(results.length - 1, i + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
            if (e.key === 'Enter') run(results[index]);
          }}
        />
        <ul>
          {results.map((c, i) => (
            <li key={c.id} className={i === index ? 'active' : ''} onMouseEnter={() => setIndex(i)} onClick={() => run(c)}>
              <span className="group">{c.group}</span>
              {c.label}
            </li>
          ))}
          {results.length === 0 && <li className="empty">Sin resultados</li>}
        </ul>
      </div>
    </div>
  );
}
