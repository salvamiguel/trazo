/** GitHub and GitHub Enterprise Server through the REST API (which allows calls from the browser). */
import type { Change, GitHost, Snapshot, TreeFile } from './git.ts';
import { LibraryError, type LibraryConfig } from './types.ts';

type Config = LibraryConfig & { kind: 'github' };

const decodeBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export class GitHubHost implements GitHost {
  private api: string;
  private web: string;

  constructor(
    readonly config: Config,
    private token: string | undefined,
    private fetcher: typeof fetch = (...a) => fetch(...a),
  ) {
    this.api = (config.api || 'https://api.github.com').replace(/\/+$/, '');
    this.web = this.api === 'https://api.github.com' ? 'https://github.com' : this.api.replace(/\/api\/v3$/, '');
  }

  get canWrite() {
    return !!this.token;
  }

  private repo = () => `/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}`;

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await this.fetcher(`${this.api}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.json().then((j: { message?: string }) => j.message).catch(() => undefined);
      throw new LibraryError(githubMessage(res.status, detail, `${this.config.owner}/${this.config.repo}`, !!this.token), res.status);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  async defaultBranch(): Promise<string> {
    return (await this.call<{ default_branch: string }>(this.repo())).default_branch;
  }

  async snapshot(branch: string): Promise<Snapshot> {
    const ref = await this.call<{ object: { sha: string } }>(`${this.repo()}/git/ref/heads/${encodeURIComponent(branch).replace(/%2F/g, '/')}`);
    const commit = ref.object.sha;
    const treeSha = (await this.call<{ tree: { sha: string } }>(`${this.repo()}/git/commits/${commit}`)).tree.sha;
    const tree = await this.call<{ tree: Array<{ path: string; type: string; sha: string }>; truncated: boolean }>(`${this.repo()}/git/trees/${treeSha}?recursive=1`);
    if (tree.truncated) console.warn('GitHub truncated the repository tree; set a root folder for the library.');
    return { branch, commit, files: tree.tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, sha: e.sha })) };
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
    const b = await this.call<{ content: string; encoding: string }>(`${this.repo()}/git/blobs/${file.sha}`);
    return b.encoding === 'base64' ? decodeBase64(b.content) : b.content;
  }

  async commit(branch: string, changes: Change[], message: string, from?: string): Promise<string> {
    const parent = from ?? (await this.call<{ object: { sha: string } }>(`${this.repo()}/git/ref/heads/${branch}`)).object.sha;
    const baseTree = (await this.call<{ tree: { sha: string } }>(`${this.repo()}/git/commits/${parent}`)).tree.sha;
    const tree = await this.call<{ sha: string }>(`${this.repo()}/git/trees`, {
      method: 'POST',
      body: {
        base_tree: baseTree,
        tree: changes.map((c) => ({ path: c.path, mode: '100644', type: 'blob', ...(c.content === null ? { sha: null } : { content: c.content }) })),
      },
    });
    const commit = await this.call<{ sha: string; html_url: string }>(`${this.repo()}/git/commits`, {
      method: 'POST',
      body: { message, tree: tree.sha, parents: [parent] },
    });
    if (from) await this.call(`${this.repo()}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } });
    else await this.call(`${this.repo()}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
    return commit.html_url ?? `${this.web}/${this.config.owner}/${this.config.repo}/commit/${commit.sha}`;
  }

  async review(branch: string, base: string, title: string, body: string): Promise<string> {
    const open = await this.call<Array<{ html_url: string }>>(`${this.repo()}/pulls?state=open&head=${encodeURIComponent(`${this.config.owner}:${branch}`)}`);
    if (open[0]) return open[0].html_url;
    return (await this.call<{ html_url: string }>(`${this.repo()}/pulls`, { method: 'POST', body: { title, head: branch, base, body } })).html_url;
  }

  webUrl(branch: string, path: string): string {
    return `${this.web}/${this.config.owner}/${this.config.repo}/tree/${branch}/${path}`.replace(/\/$/, '');
  }
}

function githubMessage(status: number, detail: string | undefined, repo: string, hasToken: boolean): string {
  if (status === 401) return 'GitHub no acepta el token: revisa que no haya caducado.';
  if (status === 403 && /rate limit/i.test(detail ?? '')) return 'GitHub ha limitado las consultas sin token. Añade un token para seguir.';
  if (status === 403) return `El token no tiene permiso para esta operación en ${repo}. Necesita «Contents» y «Pull requests» de lectura y escritura.`;
  if (status === 404) return hasToken ? `No se encuentra ${repo} o el token no tiene acceso.` : `No se encuentra ${repo}. Si es privado, añade un token.`;
  if (status === 409) return `El repositorio ${repo} está vacío.`;
  if (status === 422) return `GitHub rechazó el cambio: ${detail ?? 'datos no válidos'}.`;
  return `GitHub respondió ${status}${detail ? `: ${detail}` : ''}.`;
}
