import { useRef, useState } from 'react';
import { ChevronDown } from './icons.tsx';

interface Props {
  canLinkFolders: boolean;
  /** Folder the workspace is synced with, if any. */
  folder?: string;
  onNew: () => void;
  onOpenFiles: (files: FileList) => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onDownload: () => void;
  onSaveToFolder: () => void;
  onUnlink: () => void;
  onHistory: () => void;
  onCatalog: () => void;
  /** Library the open architecture came from; saving publishes there. */
  publishTo?: string;
  onPublish: () => void;
}

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = mac ? '⌘' : 'Ctrl+';

/** Hidden file inputs the menu and ⌘O share. */
export function useFilePickers(onFiles: (files: FileList) => void) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onFiles(e.target.files);
    e.target.value = '';
  };
  const inputs = (
    <>
      <input ref={files} type="file" multiple accept=".zip,.yaml,.yml,.json" hidden onChange={take} />
      <input
        ref={(el) => {
          folder.current = el;
          el?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        hidden
        onChange={take}
      />
    </>
  );
  return { inputs, pickFiles: () => files.current?.click(), pickFolder: () => folder.current?.click() };
}

/** "Archivo": open and save the workspace as files, a .zip or a synced folder. */
export function FileMenu(p: Props & { pickFiles: () => void; pickFolder: () => void }) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const item = (label: string, fn: () => void, shortcut?: string, extra?: { danger?: boolean }) => (
    <button role="menuitem" className={extra?.danger ? 'danger' : undefined} onClick={run(fn)}>
      <span className="grow">{label}</span>
      {shortcut && <span className="menu-kbd">{shortcut}</span>}
    </button>
  );
  return (
    <div className="menu-wrap">
      <button className="menu-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Archivo <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu file-menu" role="menu">
            {item('Catálogo de arquitecturas', p.onCatalog)}
            {item('Nuevo diagrama…', p.onNew)}
            {item('Abrir fichero…', p.pickFiles, `${MOD}O`)}
            {p.canLinkFolders ? item('Abrir carpeta…', p.onOpenFolder) : item('Importar carpeta…', p.pickFolder)}
            <div className="menu-sep" />
            {p.publishTo
              ? item(`Publicar en ${p.publishTo}…`, p.onPublish, `${MOD}S`)
              : item(p.folder ? `Guardar en ${p.folder}` : 'Guardar…', p.onSave, `${MOD}S`)}
            {item('Descargar como .zip', p.onDownload)}
            {p.canLinkFolders && !p.folder && item('Guardar en una carpeta…', p.onSaveToFolder)}
            {p.folder && item('Dejar de sincronizar con la carpeta', p.onUnlink)}
            <div className="menu-sep" />
            {item('Historial de versiones', p.onHistory)}
          </div>
        </>
      )}
    </div>
  );
}
