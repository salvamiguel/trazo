import { useState } from 'react';
import type { WorkspaceMeta } from './workspaces.ts';
import { Check, ChevronDown, Folder, Plus } from './icons.tsx';

interface Props {
  workspaces: WorkspaceMeta[];
  active: WorkspaceMeta;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onRename: () => void;
  onDelete: () => void;
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : new Date(t).toLocaleDateString('es');
};

export function WorkspaceMenu(p: Props) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="menu-wrap">
      <button className="ws-button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Workspaces">
        {p.active.folder && <Folder size={14} />}
        <span>{p.active.name}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu ws-menu" role="menu">
            <div className="menu-label">Workspaces en este navegador</div>
            {p.workspaces.map((w) => (
              <button key={w.id} role="menuitem" className="ws-item" onClick={run(() => p.onSwitch(w.id))}>
                <span className="ws-check">{w.id === p.active.id && <Check size={14} />}</span>
                <span className="ws-name">{w.name}</span>
                {w.folder && <span className="ws-folder" title={`Carpeta ${w.folder}`}><Folder size={12} /></span>}
                <span className="ws-when">{ago(w.updated)}</span>
              </button>
            ))}
            <div className="menu-sep" />
            <button role="menuitem" onClick={run(p.onNew)}><Plus size={14} /> Nuevo workspace…</button>
            <div className="menu-sep" />
            <button role="menuitem" onClick={run(p.onRename)}>Renombrar…</button>
            <button role="menuitem" className="danger" onClick={run(p.onDelete)} disabled={p.workspaces.length < 2}>Eliminar workspace…</button>
          </div>
        </>
      )}
    </div>
  );
}
