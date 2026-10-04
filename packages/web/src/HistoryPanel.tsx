import { useEffect, useMemo, useState } from 'react';
import { diffVersions, listVersions, onHistoryChange, renameVersion, type Version, type VersionDiff } from './history.ts';
import { Close } from './icons.tsx';

const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export const versionTime = (at: number) => time.format(at);

function dayLabel(at: number, now = Date.now()): string {
  const start = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((start(now) - start(at)) / 86_400_000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  const label = day.format(at);
  return label[0]!.toUpperCase() + label.slice(1);
}

function ago(at: number, now = Date.now()): string {
  const min = Math.round((now - at) / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return relative.format(-min, 'minute');
  const h = Math.round(min / 60);
  return h < 24 ? relative.format(-h, 'hour') : relative.format(-Math.round(h / 24), 'day');
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Short chips describing what a version changed compared with the one before it. */
export function diffChips(d: VersionDiff | undefined): Array<{ text: string; kind: 'add' | 'remove' | 'edit'; title?: string }> {
  if (!d) return [{ text: 'Primera versión', kind: 'edit' }];
  const chips: ReturnType<typeof diffChips> = [];
  if (d.added.length) chips.push({ text: `+${plural(d.added.length, 'elemento', 'elementos')}`, kind: 'add', title: d.added.join(', ') });
  if (d.removed.length) chips.push({ text: `−${plural(d.removed.length, 'elemento', 'elementos')}`, kind: 'remove', title: d.removed.join(', ') });
  if (d.relsAdded) chips.push({ text: `+${plural(d.relsAdded, 'relación', 'relaciones')}`, kind: 'add' });
  if (d.relsRemoved) chips.push({ text: `−${plural(d.relsRemoved, 'relación', 'relaciones')}`, kind: 'remove' });
  if (d.viewsAdded.length) chips.push({ text: `+${plural(d.viewsAdded.length, 'vista', 'vistas')}`, kind: 'add', title: d.viewsAdded.join(', ') });
  if (d.viewsRemoved.length) chips.push({ text: `−${plural(d.viewsRemoved.length, 'vista', 'vistas')}`, kind: 'remove', title: d.viewsRemoved.join(', ') });
  if (!chips.length) chips.push({ text: d.edited ? 'Cambios de texto o posición' : 'Sin cambios', kind: 'edit' });
  return chips;
}

const REASON: Record<Version['reason'], string | undefined> = {
  auto: undefined,
  named: undefined,
  'before-restore': 'Antes de restaurar',
  'before-switch': undefined,
};

interface Props {
  ws: string;
  /** The version shown on the canvas, if any; otherwise the current state is. */
  previewing?: number;
  onPreview: (v: Version | undefined) => void;
  onRestore: (v: Version) => void;
  onSaveNamed: (name: string) => void;
  onClose: () => void;
}

/** Drawer listing earlier versions of the workspace, grouped by day. */
export function HistoryPanel({ ws, previewing, onPreview, onRestore, onSaveNamed, onClose }: Props) {
  const [versions, setVersions] = useState<Version[]>();
  const [name, setName] = useState('');
  const [naming, setNaming] = useState<number>();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const load = () => listVersions(ws).then((v) => alive && setVersions(v));
    void load();
    const off = onHistoryChange((changed) => changed === ws && void load());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      alive = false;
      off();
      clearInterval(tick);
    };
  }, [ws]);

  const days = useMemo(() => {
    const out: Array<{ label: string; rows: Array<{ v: Version; diff?: VersionDiff }> }> = [];
    (versions ?? []).forEach((v, i) => {
      const label = dayLabel(v.at, now);
      const row = { v, diff: versions![i + 1] ? diffVersions(versions![i + 1], v) : undefined };
      if (out.at(-1)?.label === label) out.at(-1)!.rows.push(row);
      else out.push({ label, rows: [row] });
    });
    return out;
  }, [versions, now]);

  return (
    <aside className="history" onPointerDown={(e) => e.stopPropagation()} aria-label="Historial de versiones">
      <header>
        <div>
          <h2>Historial</h2>
          <p>Se guarda una versión cada pocos minutos mientras editas.</p>
        </div>
        <button className="icon-btn small" title="Cerrar" onClick={onClose}><Close size={15} /></button>
      </header>

      <form
        className="history-save"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSaveNamed(name.trim());
          setName('');
        }}
      >
        <input value={name} placeholder="Nombre de la versión, p. ej. «Revisión con seguridad»" onChange={(e) => setName(e.target.value)} />
        <button className="ghost-btn" disabled={!name.trim()}>Guardar</button>
      </form>

      <div className="history-list">
        <div className={`history-row current${previewing === undefined ? ' active' : ''}`}>
          <button className="history-pick" onClick={() => onPreview(undefined)}>
            <span className="history-dot" />
            <span className="history-main">
              <b>Versión actual</b>
              <small>Lo que estás editando</small>
            </span>
          </button>
        </div>

        {versions && !versions.length && <p className="history-empty">Todavía no hay versiones anteriores. La primera se guarda en cuanto edites.</p>}

        {days.map((d) => (
          <section key={d.label}>
            <h3>{d.label}</h3>
            {d.rows.map(({ v, diff }) => {
              const active = previewing === v.id;
              return (
                <div key={v.id} className={`history-row${active ? ' active' : ''}${v.name ? ' named' : ''}`}>
                  <button className="history-pick" onClick={() => onPreview(active ? undefined : v)} title={new Date(v.at).toLocaleString('es')}>
                    <span className="history-dot" />
                    <span className="history-main">
                      <span className="history-when">
                        <b>{versionTime(v.at)}</b>
                        {v.name && <span className="history-name">{v.name}</span>}
                        <small>{ago(v.at, now)}</small>
                      </span>
                      {REASON[v.reason] && <small className="history-reason">{REASON[v.reason]}</small>}
                      <span className="history-chips">
                        {diffChips(diff).map((c) => (
                          <span key={c.text} className={`chip ${c.kind}`} title={c.title}>{c.text}</span>
                        ))}
                      </span>
                    </span>
                  </button>
                  {active && (
                    <div className="history-actions">
                      {naming === v.id ? (
                        <NameForm
                          initial={v.name ?? ''}
                          onSave={(n) => {
                            void renameVersion(v, n);
                            setNaming(undefined);
                          }}
                          onCancel={() => setNaming(undefined)}
                        />
                      ) : (
                        <>
                          <button className="primary-btn small" onClick={() => onRestore(v)}>Restaurar esta versión</button>
                          <button className="link-btn" onClick={() => setNaming(v.id)}>{v.name ? 'Renombrar' : 'Ponerle nombre'}</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}

function NameForm({ initial, onSave, onCancel }: { initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="history-save inline"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <input autoFocus value={value} placeholder="Nombre" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
      <button className="ghost-btn">Guardar</button>
    </form>
  );
}
