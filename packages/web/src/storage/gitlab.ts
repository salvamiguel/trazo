/** GitLab (gitlab.com or self-managed) through the REST API v4, which allows calls from the browser. */
import type { Change, GitHost, Snapshot, TreeFile } from './git.ts';
import { LibraryError, type LibraryConfig } from './types.ts';

type Config = LibraryConfig & { kind: 'gitlab' };

const PER_PAGE = 100;

export class GitLabHost implements GitHost {
  private base: string;

  constructor(
    readonly config: Config,
    private token: string | undefined,
    private fetcher: typeof fetch = (...a) => fetch(...a),
  ) {
    this.base = (config.url || 'https://gitlab.com').replace(/\/+$/, '');
  }

  get canWrite() {
    return !!this.token;
  }

  private project = () => `/projects/${encodeURIComponent(this.config.project)}`;

  private async raw(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    const res = await this.fetcher(`${this.base}/api/v4${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(this.token ? { 'PRIVATE-TOKEN': this.token } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      const detail = await res
        .json()
        .then((j: { message?: unknown; error?: string }) => (typeof j.message === 'string' ? j.message : j.error ?? JSON.stringify(j.message)))
        .catch(() => undefined);
      throw new LibraryError(gitlabMessage(res.status, detail, this.config.project, !!this.token), res.status);
    }
    return res;
  }

  private async call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    return (await (await this.raw(path, init)).json()) as T;
  }

  async defaultBranch(): Promise<string> {
    return (await this.call<{ default_branch: string }>(this.project())).default_branch;
  }

  async snapshot(branch: string): Promise<Snapshot> {
    const b = await this.call<{ commit: { id: string } }>(`${this.project()}/repository/branches/${encodeURIComponent(branch)}`);
    const files: TreeFile[] = [];
    const root = (this.config.root ?? '').replace(/^\/+|\/+$/g, '');
    for (let page = 1; ; page++) {
      const q = new URLSearchParams({ ref: b.commit.id, recursive: 'true', per_page: String(PER_PAGE), page: String(page) });
      if (root) q.set('path', root);
      const entries = await this.call<Array<{ path: string; type: string; id: string }>>(`${this.project()}/repository/tree?${q}`);
      for (const e of entries) if (e.type === 'blob') files.push({ path: e.path, sha: e.id });
      if (entries.length < PER_PAGE) break;
    }
    return { branch, commit: b.commit.id, files };
  }

  async maybeSnapshot(branch: string): Promise<Snapshot | undefined> {
    try {
      return await this.snapshot(branch);
    } catch (err) {
      if (err instanceof LibraryError && err.status === 404) return undefined;
      throw err;
    }
  }

  async blob(file: TreeFile): Promise<string> {
    return (await this.raw(`${this.project()}/repository/blobs/${file.sha}/raw`)).text();
  }

  async commit(branch: string, changes: Change[], message: string, from?: string): Promise<string> {
    const c = await this.call<{ id: string; web_url?: string }>(`${this.project()}/repository/commits`, {
      method: 'POST',
      body: {
        branch,
        ...(from ? { start_sha: from } : {}),
        commit_message: message,
        actions: changes.map((ch) =>
          ch.content === null
            ? { action: 'delete', file_path: ch.path }
            : { action: ch.exists ? 'update' : 'create', file_path: ch.path, content: ch.content },
        ),
      },
    });
    return c.web_url ?? `${this.base}/${this.config.project}/-/commit/${c.id}`;
  }

  async review(branch: string, base: string, title: string, body: string): Promise<string> {
    const q = new URLSearchParams({ state: 'opened', source_branch: branch, target_branch: base });
    const open = await this.call<Array<{ web_url: string }>>(`${this.project()}/merge_requests?${q}`);
    if (open[0]) return open[0].web_url;
    const mr = await this.call<{ web_url: string }>(`${this.project()}/merge_requests`, {
      method: 'POST',
      body: { source_branch: branch, target_branch: base, title, description: body, remove_source_branch: true },
    });
    return mr.web_url;
  }

  webUrl(branch: string, path: string): string {
    return `${this.base}/${this.config.project}/-/tree/${branch}/${path}`.replace(/\/$/, '');
  }
}

function gitlabMessage(status: number, detail: string | undefined, project: string, hasToken: boolean): string {
  if (status === 401) return 'GitLab no acepta el token: revisa que no haya caducado.';
  if (status === 403) return `El token no tiene permiso para esta operación en ${project}. Necesita el alcance «api» (o «read_repository» para solo leer).`;
  if (status === 404) return hasToken ? `No se encuentra ${project} o el token no tiene acceso.` : `No se encuentra ${project}. Si es privado, añade un token.`;
  if (status === 400 || status === 422) return `GitLab rechazó el cambio: ${detail ?? 'datos no válidos'}.`;
  return `GitLab respondió ${status}${detail ? `: ${detail}` : ''}.`;
}
