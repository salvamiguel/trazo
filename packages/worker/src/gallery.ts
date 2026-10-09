/**
 * Read-only public gallery: anyone can browse the architectures of the repositories listed in
 * GALLERY_REPOS without a GitHub account. The Worker reads them with the GitHub App's installation
 * token and caches the answers at the edge, so visitors do not spend any API quota.
 *
 *   GET /gallery                                    → { repos }
 *   GET /gallery/:owner/:repo?ref=<branch|sha>      → index of architectures at one commit
 *   GET /gallery/:owner/:repo/files/<path>?ref=<sha> → one file of that commit (yaml, md, svg, png, json)
 *
 * An architecture is a folder holding a `*.calm.yaml` model, with its views in `views/*.view.yaml`
 * (the layout of examples/ in this repo).
 */
import { galleryEnabled, list, type Env } from './env.ts';
import { installationToken, USER_AGENT } from './github-app.ts';
import { HttpError, json } from './http.ts';

const API = 'https://api.github.com';
const INDEX_TTL = 60;
const FILE_TTL = 86_400;
const FILE_TYPES: Record<string, string> = {
  yaml: 'text/yaml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  json: 'application/json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
};

export interface GalleryArchitecture {
  /** Folder of the architecture, '' for the repository root. */
  path: string;
  model: string;
  views: Array<{ id: string; path: string }>;
  /** Other files next to the model that the catalog may show: README, preview images. */
  assets: string[];
}

export interface GalleryIndex {
  repo: string;
  ref: string;
  commit: string;
  architectures: GalleryArchitecture[];
}

const NAME = /^[A-Za-z0-9_.-]+$/;

function galleryRepo(env: Env, owner: string, repo: string): string {
  if (!galleryEnabled(env)) throw new HttpError(404, 'gallery_disabled');
  if (!NAME.test(owner) || !NAME.test(repo)) throw new HttpError(400, 'invalid_repo');
  const full = list(env.GALLERY_REPOS).find((r) => r.toLowerCase() === `${owner}/${repo}`.toLowerCase());
  if (!full) throw new HttpError(404, 'repo_not_in_gallery');
  return full;
}

async function api(path: string, token: string, accept = 'application/vnd.github+json'): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': USER_AGENT, 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (res.status === 404) throw new HttpError(404, 'not_found');
  if (!res.ok) throw new HttpError(502, 'github_error', `GitHub respondió ${res.status}`);
  return res;
}

/** Groups a git tree into architectures. Exported for tests. */
export function architecturesFromTree(paths: string[]): GalleryArchitecture[] {
  const models = paths.filter((p) => /(^|\/)[^/]+\.calm\.ya?ml$/.test(p)).sort();
  return models.map((model) => {
    const dir = model.includes('/') ? model.slice(0, model.lastIndexOf('/')) : '';
    const prefix = dir ? `${dir}/` : '';
    const views = paths
      .filter((p) => p.startsWith(`${prefix}views/`) && /^[^/]+\.view\.ya?ml$/.test(p.slice(`${prefix}views/`.length)))
      .sort()
      .map((p) => ({ id: p.slice(p.lastIndexOf('/') + 1).replace(/\.view\.ya?ml$/, ''), path: p }));
    const assets = paths
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/') && /\.(md|svg|png)$/i.test(p))
      .sort();
    return { path: dir, model, views, assets };
  });
}

async function cached(request: Request, ttl: number, produce: () => Promise<Response>): Promise<Response> {
  const cache = typeof caches === 'undefined' ? undefined : (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache?.match(key);
  if (hit) return hit;
  const res = await produce();
  res.headers.set('Cache-Control', `public, max-age=${ttl}`);
  if (cache && res.ok) await cache.put(key, res.clone());
  return res;
}

export function repos(env: Env): Response {
  return json({ repos: galleryEnabled(env) ? list(env.GALLERY_REPOS) : [] }, { headers: { 'Cache-Control': `public, max-age=${INDEX_TTL}` } });
}

export async function index(request: Request, env: Env, owner: string, repo: string): Promise<Response> {
  const full = galleryRepo(env, owner, repo);
  return cached(request, INDEX_TTL, async () => {
    const token = await installationToken(env, owner, repo);
    let ref = new URL(request.url).searchParams.get('ref');
    if (!ref) ref = ((await (await api(`/repos/${owner}/${repo}`, token)).json()) as { default_branch: string }).default_branch;
    const commit = (await (await api(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, token)).json()) as {
      sha: string;
      commit: { tree: { sha: string } };
    };
    const tree = (await (await api(`/repos/${owner}/${repo}/git/trees/${commit.commit.tree.sha}?recursive=1`, token)).json()) as {
      tree: Array<{ path: string; type: string }>;
      truncated: boolean;
    };
    if (tree.truncated) console.warn(`Tree of ${full} truncated; the gallery may miss architectures`);
    const body: GalleryIndex = {
      repo: full,
      ref,
      commit: commit.sha,
      architectures: architecturesFromTree(tree.tree.filter((e) => e.type === 'blob').map((e) => e.path)),
    };
    return json(body);
  });
}

export async function file(request: Request, env: Env, owner: string, repo: string, path: string): Promise<Response> {
  galleryRepo(env, owner, repo);
  const ref = new URL(request.url).searchParams.get('ref') ?? '';
  // Only exact commits: the answer never changes, so it can be cached for a day.
  if (!/^[0-9a-f]{40}$/.test(ref)) throw new HttpError(400, 'commit_sha_required', 'Pasa ?ref=<sha del commit> (el campo commit del índice)');
  const segments = path.split('/');
  if (!path || segments.some((s) => !s || s === '.' || s === '..')) throw new HttpError(400, 'invalid_path');
  const type = FILE_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()];
  if (!type) throw new HttpError(403, 'file_type_not_allowed');

  return cached(request, FILE_TTL, async () => {
    const token = await installationToken(env, owner, repo);
    const encoded = segments.map(encodeURIComponent).join('/');
    const res = await api(`/repos/${owner}/${repo}/contents/${encoded}?ref=${ref}`, token, 'application/vnd.github.raw');
    return new Response(await res.arrayBuffer(), {
      headers: {
        'Content-Type': type,
        // SVGs are user content: never let them run script on this origin.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
