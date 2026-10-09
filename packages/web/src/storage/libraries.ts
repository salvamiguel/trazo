/**
 * Libraries the user connected, kept in this browser. Access tokens are stored apart from the
 * configuration so a config can be exported or shown without them.
 */
import * as store from '../workspaces.ts';
import { GitLibrary } from './git.ts';
import { githubSession, githubToken } from './github-auth.ts';
import { GitHubHost, type TokenSource } from './github.ts';
import { GitLabHost } from './gitlab.ts';
import { architectureMeta } from './meta.ts';
import type { CatalogEntry, Library, LibraryConfig, Loaded } from './types.ts';

const CONFIGS = 'trazo.libraries.v1';
const tokenKey = (id: string) => `trazo.library-token.${id}`;

export const BROWSER: LibraryConfig = { id: 'browser', kind: 'browser', name: 'Este navegador' };

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the library lasts until reload */
  }
}

export function listLibraries(): LibraryConfig[] {
  return [BROWSER, ...(read<LibraryConfig[]>(CONFIGS) ?? [])];
}

export function saveLibrary(config: LibraryConfig, token?: string | null) {
  const others = (read<LibraryConfig[]>(CONFIGS) ?? []).filter((c) => c.id !== config.id);
  write(CONFIGS, [...others, config]);
  // undefined keeps the stored token; null or '' removes it.
  if (token !== undefined) write(tokenKey(config.id), token || undefined);
}

export function removeLibrary(id: string) {
  write(CONFIGS, (read<LibraryConfig[]>(CONFIGS) ?? []).filter((c) => c.id !== id));
  write(tokenKey(id), undefined);
}

export const hasToken = (id: string) => !!read<string>(tokenKey(id));

export function newLibraryId(): string {
  return `lib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** The workspaces of this browser, as a library. */
class BrowserLibrary implements Library {
  config = BROWSER;
  canWrite = false;
  async list(): Promise<CatalogEntry[]> {
    return store.listWorkspaces().map((w) => {
      const sources = store.loadSources(w.id);
      return {
        ...architectureMeta(sources?.model ?? '', Object.keys(sources?.views ?? {}).length, w.name),
        // The workspace name is what people see in the switcher, so it wins over the model title.
        title: w.name,
        path: w.id,
        modelFile: 'architecture.calm.yaml',
        updated: w.updated,
      };
    });
  }
  async load(path: string): Promise<Loaded> {
    const sources = store.loadSources(path);
    if (!sources) throw new Error('Ese workspace ya no existe.');
    return { sources, modelFile: 'architecture.calm.yaml', version: {} };
  }
  async publish(): Promise<never> {
    throw new Error('Los workspaces de este navegador se guardan solos.');
  }
  webUrl() {
    return undefined;
  }
}

const cache = new Map<string, { key: string; library: Library }>();

/** The library for a config; reused while its config and token stay the same, so blob caches survive. */
export function openLibrary(config: LibraryConfig, opts: { token?: string; fetcher?: typeof fetch } = {}): Library {
  if (config.kind === 'browser') return new BrowserLibrary();
  const trial = opts.token !== undefined || !!opts.fetcher;
  const token = opts.token ?? read<string>(tokenKey(config.id));
  // github.com libraries without a token of their own use the "Iniciar sesión con GitHub" session.
  const session = !token && config.kind === 'github' && !config.api ? githubSession() : undefined;
  const key = JSON.stringify([config, token, session?.user?.login ?? (session ? 'session' : null)]);
  const hit = cache.get(config.id);
  if (hit && hit.key === key && !trial) return hit.library;
  const source: TokenSource = token || (session ? () => githubToken() : undefined);
  const host = config.kind === 'github' ? new GitHubHost(config, source, opts.fetcher) : new GitLabHost(config, token, opts.fetcher);
  const library = new GitLibrary(host);
  if (!trial) cache.set(config.id, { key, library });
  return library;
}

/**
 * Reads a repository reference as typed or pasted: `owner/repo`, a GitHub or GitLab URL
 * (with an optional `/tree/<branch>/<folder>`), or a self-managed GitLab URL.
 */
export interface RepoRef {
  kind?: 'github' | 'gitlab';
  owner?: string;
  repo?: string;
  api?: string;
  project?: string;
  url?: string;
  branch?: string;
  root?: string;
}

export function parseRepoUrl(input: string): RepoRef {
  const text = input.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  let url: URL | undefined;
  try {
    url = new URL(/^https?:\/\//.test(text) ? text : `https://${text}`);
  } catch {
    return {};
  }
  const bare = !/^https?:\/\//.test(text) && !/\./.test(text.split('/')[0] ?? '');
  if (bare) {
    const [owner, repo] = text.split('/');
    return owner && repo ? { kind: 'github', owner, repo } : {};
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'github.com' || url.hostname.startsWith('github.')) {
    const [owner, repo, tree, branch, ...rest] = parts;
    if (!owner || !repo) return {};
    const api = url.hostname === 'github.com' ? undefined : `${url.origin}/api/v3`;
    return { kind: 'github', owner, repo, api, ...(tree === 'tree' && branch ? { branch, root: rest.join('/') || undefined } : {}) };
  }
  // GitLab: group/sub/project[/-/tree/branch/folder]
  const dash = parts.indexOf('-');
  const project = (dash >= 0 ? parts.slice(0, dash) : parts).join('/');
  if (!project.includes('/')) return {};
  const tree = dash >= 0 && parts[dash + 1] === 'tree' ? parts.slice(dash + 2) : [];
  return {
    kind: 'gitlab',
    project,
    url: url.hostname === 'gitlab.com' ? undefined : url.origin,
    ...(tree[0] ? { branch: tree[0], root: tree.slice(1).join('/') || undefined } : {}),
  };
}
