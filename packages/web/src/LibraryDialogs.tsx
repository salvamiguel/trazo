import { useState } from 'react';
import { Modal, useAutofocus } from './Dialogs.tsx';
import { authApi, githubSession } from './storage/github-auth.ts';
import { hasToken, newLibraryId, openLibrary, parseRepoUrl, saveLibrary } from './storage/libraries.ts';
import type { LibraryConfig, PublishResult } from './storage/types.ts';
import { TEMPLATES, type Template } from './templates.ts';

type GitConfig = LibraryConfig & { kind: 'github' | 'gitlab' };

/** Connects (or edits) a Git library: paste the repository URL, optionally a token. */
export function ConnectLibraryDialog({ editing, onDone, onClose }: { editing?: GitConfig; onDone: (c: LibraryConfig) => void; onClose: () => void }) {
  const initialUrl = editing
    ? editing.kind === 'github'
      ? `${editing.api ? editing.api.replace(/\/api\/v3$/, '') : 'https://github.com'}/${editing.owner}/${editing.repo}`
      : `${editing.url ?? 'https://gitlab.com'}/${editing.project}`
    : '';
  const [url, setUrl] = useState(initialUrl);
  const [name, setName] = useState(editing?.name ?? '');
  const [branch, setBranch] = useState(editing?.branch ?? '');
  const [root, setRoot] = useState(editing?.root ?? '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const input = useAutofocus<HTMLInputElement>();
  const parsed = parseRepoUrl(url);
  const kindLabel = parsed.kind === 'github' ? 'GitHub' : parsed.kind === 'gitlab' ? 'GitLab' : undefined;
  const defaultName = parsed.kind === 'github' ? parsed.repo : parsed.kind === 'gitlab' ? parsed.project?.split('/').pop() : '';

  const onUrl = (v: string) => {
    setUrl(v);
    const p = parseRepoUrl(v);
    // A pasted /tree/<branch>/<folder> URL fills in branch and folder.
    if (p.branch) setBranch(p.branch);
    if (p.root) setRoot(p.root);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.kind) return setError('Pega la URL de un repositorio de GitHub o GitLab, o escribe propietario/repositorio.');
    const base = { id: editing?.id ?? newLibraryId(), name: name.trim() || defaultName || 'Biblioteca', branch: branch.trim() || undefined, root: root.trim().replace(/^\/+|\/+$/g, '') || undefined };
    const config: GitConfig =
      parsed.kind === 'github'
        ? { ...base, kind: 'github', owner: parsed.owner!, repo: parsed.repo!, api: parsed.api }
        : { ...base, kind: 'gitlab', project: parsed.project!, url: parsed.url };
    setBusy(true);
    setError(undefined);
    // Try it before saving anything, with the new token if one was typed.
    try {
      await openLibrary(config, { token: token.trim() || (editing && hasToken(editing.id) ? undefined : '') }).list();
      saveLibrary(config, token.trim() || undefined);
      onDone(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? 'Editar biblioteca' : 'Conectar una biblioteca'} onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <p className="modal-text">
          Una biblioteca es un repositorio Git con el catálogo de arquitecturas de tu empresa o equipo. Cada carpeta con un <code>*.calm.yaml</code> es una arquitectura.
        </p>
        <label className="field">
          <span>Repositorio {kindLabel && <em className="field-hint">· {kindLabel}</em>}</span>
          <input ref={input} value={url} placeholder="https://github.com/empresa/arquitecturas" onChange={(e) => onUrl(e.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Nombre</span>
            <input value={name} placeholder={defaultName || 'Arquitecturas'} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Rama</span>
            <input value={branch} placeholder="la principal" onChange={(e) => setBranch(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Carpeta</span>
          <input value={root} placeholder="todo el repositorio" onChange={(e) => setRoot(e.target.value)} />
        </label>
        <label className="field">
          <span>Token de acceso {editing && hasToken(editing.id) && <em className="field-hint">· guardado; escribe otro para cambiarlo</em>}</span>
          <input type="password" autoComplete="off" value={token} placeholder={parsed.kind === 'gitlab' ? 'glpat-…' : 'github_pat_…'} onChange={(e) => setToken(e.target.value)} />
          <small className="field-help">
            {parsed.kind === 'gitlab'
              ? 'Hace falta para repositorios privados y para publicar cambios: un token personal o de proyecto con el alcance «api».'
              : githubLogin(parsed.api)}{' '}
            Se guarda solo en este navegador.
          </small>
        </label>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" className="ghost-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-btn" disabled={busy || !url.trim()}>{busy ? 'Conectando…' : editing ? 'Guardar' : 'Conectar'}</button>
        </footer>
      </form>
    </Modal>
  );
}

/** Token help for GitHub: with the Trazo API deployed, the GitHub session makes the token optional. */
function githubLogin(enterprise: string | undefined): string {
  const pat = 'un token fine-grained con permiso de lectura y escritura en «Contents» y «Pull requests».';
  if (!authApi() || enterprise) return `Hace falta para repositorios privados y para publicar cambios: ${pat}`;
  const s = githubSession();
  if (s) return `Opcional: sin token se usa tu sesión de GitHub${s.user ? ` (@${s.user.login})` : ''}. Si pones uno, debe ser ${pat}`;
  return `Para repositorios privados y para publicar, inicia sesión con GitHub desde el catálogo o pega ${pat}`;
}

/** Creates an architecture in a library: a title, a starting template, and the folder it will live in. */
export function NewArchitectureDialog({ library, onCreate, onClose }: {
  library: LibraryConfig;
  onCreate: (title: string, folder: string, t: Template) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('Nueva arquitectura');
  const [template, setTemplate] = useState(TEMPLATES[0]!);
  const input = useAutofocus<HTMLInputElement>();
  const root = library.kind === 'browser' ? '' : (library.root ?? '');
  const slug = title.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arquitectura';
  const folder = root ? `${root}/${slug}` : slug;
  return (
    <Modal title={`Nueva arquitectura en ${library.name}`} onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) onCreate(title.trim(), folder, template);
        }}
      >
        <label className="field">
          <span>Título</span>
          <input ref={input} value={title} onChange={(e) => setTitle(e.target.value)} />
          {library.kind !== 'browser' && <small className="field-help">Se creará en <code>{folder}/</code> al publicarla.</small>}
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

/** Publishes the open architecture to its library, as a pull/merge request or a direct commit. */
export function PublishDialog({ library, path, title, isNew, openReview, onPublish, onClose }: {
  library: GitConfig;
  path: string;
  title: string;
  isNew: boolean;
  /** Pull/merge request this workspace already opened, which a new review publish adds to. */
  openReview?: string;
  onPublish: (message: string, review: boolean, force: boolean) => Promise<PublishResult>;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(isNew ? `Añade la arquitectura ${title}` : `Actualiza la arquitectura ${title}`);
  const [review, setReview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<string[]>();
  const [done, setDone] = useState<{ url: string; review: boolean }>();
  const input = useAutofocus<HTMLTextAreaElement>();
  const pr = library.kind === 'gitlab' ? 'merge request' : 'pull request';
  const branch = library.branch ?? 'la rama principal';

  const run = async (force: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await onPublish(message.trim() || `Actualiza ${title}`, review, force);
      if (r.ok) setDone({ url: r.url, review: r.review });
      else setConflict(r.conflict);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal title="Publicado" onClose={onClose}>
        <div className="modal-body">
          <p className="modal-text">
            {done.review ? <>Los cambios están en un {pr} para que el equipo los revise.</> : <>Los cambios están en <b>{branch}</b>.</>}
          </p>
          <footer>
            <a className="ghost-btn" href={done.url} target="_blank" rel="noreferrer">{done.review ? `Abrir el ${pr}` : 'Ver el commit'}</a>
            <button className="primary-btn" onClick={onClose}>Hecho</button>
          </footer>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Publicar en ${library.name}`} onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          void run(false);
        }}
      >
        <p className="modal-text">
          <b>{title}</b> se guarda en <code>{path || '/'}</code>.
        </p>
        <label className="field">
          <span>Qué ha cambiado</span>
          <textarea ref={input} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <div className="field">
          <span>Cómo publicarlo</span>
          <div className="choice-grid">
            <button type="button" className={`choice${review ? ' active' : ''}`} aria-pressed={review} onClick={() => setReview(true)}>
              <b>{openReview ? `Añadir al ${pr} abierto` : `Abrir un ${pr}`}</b>
              <span>El equipo lo revisa antes de que entre en {branch}. Recomendado.</span>
            </button>
            <button type="button" className={`choice${!review ? ' active' : ''}`} aria-pressed={!review} onClick={() => setReview(false)}>
              <b>Commit directo</b>
              <span>Entra en {branch} ahora mismo, si tienes permiso.</span>
            </button>
          </div>
        </div>
        {conflict && (
          <div className="form-error">
            Alguien cambió esta arquitectura en la biblioteca desde que la abriste:
            <ul>{conflict.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
            Si publicas igualmente, tus ficheros sustituyen a los suyos.
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" className="ghost-btn" onClick={onClose}>Cancelar</button>
          {conflict ? (
            <button type="button" className="danger-solid" disabled={busy} onClick={() => void run(true)}>Publicar igualmente</button>
          ) : (
            <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Publicando…' : 'Publicar'}</button>
          )}
        </footer>
      </form>
    </Modal>
  );
}
