import { useEffect, useRef, useState } from 'react';
import { TEMPLATES, VIEW_KINDS, type Template, type ViewKind } from './templates.ts';
import { Close } from './icons.tsx';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn small" title="Cerrar (Esc)" onClick={onClose}><Close size={15} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function useAutofocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
    if (ref.current instanceof HTMLInputElement) ref.current.select();
  }, []);
  return ref;
}

export function NewWorkspaceDialog({ onCreate, onClose }: { onCreate: (name: string, t: Template) => void; onClose: () => void }) {
  const [name, setName] = useState('Nuevo diagrama');
  const [template, setTemplate] = useState(TEMPLATES[0]!);
  const input = useAutofocus<HTMLInputElement>();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onCreate(name.trim(), template);
  };
  return (
    <Modal title="Nuevo workspace" onClose={onClose}>
      <form onSubmit={submit} className="modal-body">
        <label className="field">
          <span>Nombre</span>
          <input id="ws-name" ref={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Empezar desde</span>
          <div className="choice-grid">
            {TEMPLATES.map((t) => (
              <button type="button" key={t.id} className={`choice${t.id === template.id ? ' active' : ''}`} aria-pressed={t.id === template.id} onClick={() => setTemplate(t)}>
                <b>{t.name}</b>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
        </div>
        <footer>
          <button type="button" className="ghost-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-btn">Crear</button>
        </footer>
      </form>
    </Modal>
  );
}

export function NewViewDialog({ onCreate, onClose, hasElements }: {
  onCreate: (title: string, kind: ViewKind, empty: boolean) => void;
  onClose: () => void;
  hasElements: boolean;
}) {
  const [title, setTitle] = useState('Nueva vista');
  const [kind, setKind] = useState<ViewKind>('aws-infra');
  const [empty, setEmpty] = useState(false);
  const input = useAutofocus<HTMLInputElement>();
  return (
    <Modal title="Nueva vista" onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) onCreate(title.trim(), kind, empty);
        }}
      >
        <label className="field">
          <span>Título</span>
          <input id="view-title" ref={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="field">
          <span>Tipo de vista</span>
          <div className="choice-grid">
            {(Object.keys(VIEW_KINDS) as ViewKind[]).map((k) => (
              <button type="button" key={k} className={`choice${k === kind ? ' active' : ''}`} aria-pressed={k === kind} onClick={() => setKind(k)}>
                <b>{VIEW_KINDS[k].label}</b>
                <span>{VIEW_KINDS[k].hint}</span>
              </button>
            ))}
          </div>
        </div>
        {hasElements && (
          <div className="field">
            <span>Elementos</span>
            <div className="segmented">
              <button type="button" className={!empty ? 'active' : ''} onClick={() => setEmpty(false)}>Todos los del modelo</button>
              <button type="button" className={empty ? 'active' : ''} onClick={() => setEmpty(true)}>Empezar vacía</button>
            </div>
            <small>{empty ? 'Añade elementos desde la biblioteca o márcalos en el inspector.' : 'Los elementos nuevos aparecerán también aquí.'}</small>
          </div>
        )}
        <footer>
          <button type="button" className="ghost-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-btn">Crear vista</button>
        </footer>
      </form>
    </Modal>
  );
}

/** One-line text prompt (the viewer blocks window.prompt, so this is drawn in the page). */
export function RenameDialog({ title, label, value, onSave, onClose }: {
  title: string; label: string; value: string; onSave: (v: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState(value);
  const input = useAutofocus<HTMLInputElement>();
  return (
    <Modal title={title} onClose={onClose}>
      <form className="modal-body" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSave(text.trim()); }}>
        <label className="field">
          <span>{label}</span>
          <input id="rename" ref={input} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <footer>
          <button type="button" className="ghost-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-btn">Guardar</button>
        </footer>
      </form>
    </Modal>
  );
}

/** Confirmation drawn in the page (window.confirm is blocked in some viewers). */
export function ConfirmDialog({ title, message, action, onConfirm, onClose }: {
  title: string; message: React.ReactNode; action: string; onConfirm: () => void; onClose: () => void;
}) {
  const btn = useAutofocus<HTMLButtonElement>();
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <p className="modal-text">{message}</p>
        <footer>
          <button type="button" className="ghost-btn" onClick={onClose}>Cancelar</button>
          <button ref={btn} type="button" className="danger-solid" onClick={onConfirm}>{action}</button>
        </footer>
      </div>
    </Modal>
  );
}

export function ErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Modal title="No se pudo completar" onClose={onClose}>
      <div className="modal-body">
        <p className="modal-text">{message}</p>
        <footer><button type="button" className="primary-btn" onClick={onClose}>Entendido</button></footer>
      </div>
    </Modal>
  );
}
