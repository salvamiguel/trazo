import { useRef, useState } from 'react';
import type { WorkspaceMeta } from './workspaces.ts';
import { Check, ChevronDown, Folder, Plus } from './icons.tsx';

interface Props {
  workspaces: WorkspaceMeta[];
  active: WorkspaceMeta;
  canLinkFolders: boolean;
  linked: boolean;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onOpenFolder: () => void;
  onImportFiles: (files: FileList) => void;
  onSaveToFolder: () => void;
  onUnlink: () => void;
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
  const files = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
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
      <input ref={files} type="file" multiple accept=".yaml,.yml,.json" hidden onChange={(e) => { if (e.target.files?.length) p.onImportFiles(e.target.files); e.target.value = ''; }} />
      <input
        ref={(el) => {
          folderInput.current = el;
          el?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        hidden
        onChange={(e) => { if (e.target.files?.length) p.onImportFiles(e.target.files); e.target.value = ''; }}
      />
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
            {p.canLinkFolders ? (
              <button role="menuitem" onClick={run(p.onOpenFolder)}><Folder size={14} /> Abrir carpeta…</button>
            ) : (
              <button role="menuitem" onClick={run(() => folderInput.current?.click())}><Folder size={14} /> Importar carpeta…</button>
            )}
            <button role="menuitem" onClick={run(() => files.current?.click())}>Importar ficheros YAML…</button>
            <div className="menu-sep" />
            {p.canLinkFolders && !p.linked && <button role="menuitem" onClick={run(p.onSaveToFolder)}>Guardar en una carpeta…</button>}
            {p.linked && <button role="menuitem" onClick={run(p.onUnlink)}>Dejar de sincronizar con la carpeta</button>}
            <button role="menuitem" onClick={run(p.onRename)}>Renombrar…</button>
            <button role="menuitem" className="danger" onClick={run(p.onDelete)} disabled={p.workspaces.length < 2}>Eliminar workspace…</button>
          </div>
        </>
      )}
    </div>
  );
}
