/**
 * A library backed by a Git repository. Every folder holding a `*.calm.yaml` (with its
 * `views/*.view.yaml`) is one architecture; hosts (GitHub, GitLab) only provide the few
 * repository operations below, and this class turns them into list, load and publish.
 */
import type { WorkspaceSources } from '@trazo/core';
import { MODEL_FILE } from '../folder.ts';
import { architectureMeta } from './meta.ts';
import type { CatalogEntry, Library, LibraryConfig, Loaded, PublishOptions, PublishResult, Version } from './types.ts';

export interface TreeFile {
  path: string;
  sha: string;
}

export interface Snapshot {
  branch: string;
  commit: string;
  files: TreeFile[];
}

/** File changes of one commit; `content: null` deletes the file. */
export interface Change {
  path: string;
  content: string | null;
  /** Whether the file exists on the branch the commit goes to. */
  exists: boolean;
}

export interface GitHost {
  config: LibraryConfig & { kind: 'github' | 'gitlab' };
  canWrite: boolean;
  defaultBranch(): Promise<string>;
  snapshot(branch: string): Promise<Snapshot>;
  /** Snapshot of a branch, or undefined if it does not exist. */
  maybeSnapshot(branch: string): Promise<Snapshot | undefined>;
  blob(file: TreeFile): Promise<string>;
  /** Commits on `branch`, creating it from `from` (a commit id) when given. Returns the commit's web URL. */
  commit(branch: string, changes: Change[], message: string, from?: string): Promise<string>;
  /** Opens (or finds the open) pull/merge request from `branch` into `base`; returns its web URL. */
  review(branch: string, base: string, title: string, body: string): Promise<string>;
  webUrl(branch: string, path: string): string;
}

const MODEL_RE = /(^|\/)[^/]+\.calm\.(ya?ml|json)$/i;
const VIEW_RE = /^(.+)\.view\.ya?ml$/i;

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const join = (dir: string, file: string) => (dir ? `${dir}/${file}` : file);

/** Git's blob id of a text file: sha1("blob <bytes>\0<content>"), so versions can be computed locally. */
export async function gitBlobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text);
  const head = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head);
  all.set(body, head.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Short, readable branch name for a review: `trazo/pagos-aws-20261005-1932`. */
export function reviewBranch(path: string, now = new Date()): string {
  const slug = (path.split('/').pop() || 'arquitectura').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arquitectura';
  const p = (n: number) => String(n).padStart(2, '0');
  return `trazo/${slug}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

interface Found {
  path: string;
  model: TreeFile;
  views: TreeFile[];
}

export class GitLibrary implements Library {
  private branch?: Promise<string>;
  private blobs = new Map<string, Promise<string>>();

  constructor(private host: GitHost) {}

  get config() {
    return this.host.config;
  }
  get canWrite() {
    return this.host.canWrite;
  }

  private base(): Promise<string> {
    return (this.branch ??= this.host.config.branch ? Promise.resolve(this.host.config.branch) : this.host.defaultBranch());
  }

  private read(file: TreeFile): Promise<string> {
    let p = this.blobs.get(file.sha);
    if (!p) {
      p = this.host.blob(file).catch((err) => {
        this.blobs.delete(file.sha);
        throw err;
      });
      this.blobs.set(file.sha, p);
    }
    return p;
  }

  /** Architectures in a snapshot: one per folder with a model, the preferred file name winning. */
  private find(files: TreeFile[]): Found[] {
    const root = (this.host.config.root ?? '').replace(/^\/+|\/+$/g, '');
    const inRoot = (p: string) => !root || p === root || p.startsWith(`${root}/`);
    const byDir = new Map<string, Found>();
    for (const f of files) {
      if (!MODEL_RE.test(f.path) || !inRoot(f.path)) continue;
      const dir = dirOf(f.path);
      const prev = byDir.get(dir);
      if (!prev || f.path.endsWith(`/${MODEL_FILE}`) || f.path === MODEL_FILE) byDir.set(dir, { path: dir, model: f, views: [] });
    }
    for (const f of files) {
      const dir = dirOf(f.path);
      if (!dir.endsWith('views') || !VIEW_RE.test(f.path.split('/').pop()!)) continue;
      byDir.get(dirOf(dir))?.views.push(f);
    }
    return [...byDir.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  async list(): Promise<CatalogEntry[]> {
    const snap = await this.host.snapshot(await this.base());
    const found = this.find(snap.files);
    return Promise.all(
      found.map(async (a) => ({
        ...architectureMeta(await this.read(a.model), a.views.length, a.path),
        path: a.path,
        modelFile: a.model.path.split('/').pop()!,
      })),
    );
  }

  async load(path: string): Promise<Loaded> {
    const snap = await this.host.snapshot(await this.base());
    const a = this.find(snap.files).find((x) => x.path === path);
    if (!a) throw new Error(`No hay ninguna arquitectura en «${path || '/'}».`);
    const views: Record<string, string> = {};
    const version: Version = { [a.model.path]: a.model.sha };
    await Promise.all(
      a.views.map(async (v) => {
        views[VIEW_RE.exec(v.path.split('/').pop()!)![1]!] = await this.read(v);
        version[v.path] = v.sha;
      }),
    );
    return { sources: { model: await this.read(a.model), views }, modelFile: a.model.path.split('/').pop()!, version, commit: snap.commit };
  }

  /**
   * Publishes the architecture in `path`. With `review`, commits to `branch` (a review branch
   * created from the library's branch if it does not exist yet) and opens a pull/merge request.
   * Unless forced, refuses when the files changed on the target branch since `base` was read.
   */
  async publish(
    path: string,
    sources: WorkspaceSources,
    modelFile: string,
    base: Version | undefined,
    opts: PublishOptions,
  ): Promise<PublishResult> {
    const main = await this.base();
    const target = opts.review ? (opts.branch ?? reviewBranch(path)) : main;
    const existing = target === main ? await this.host.snapshot(main) : await this.host.maybeSnapshot(target);
    const snap = existing ?? (await this.host.snapshot(main));
    const onBranch = new Map(snap.files.map((f) => [f.path, f.sha]));

    // Files of this architecture on the branch now, and what we will write.
    const prefix = path ? `${path}/` : '';
    const current = snap.files.filter((f) => f.path.startsWith(prefix) && (f.path === join(path, modelFile) || (dirOf(f.path) === join(path, 'views') && VIEW_RE.test(f.path.split('/').pop()!))));
    const next = new Map<string, string>([[join(path, modelFile), sources.model]]);
    for (const [id, text] of Object.entries(sources.views)) next.set(join(path, `views/${id}.view.yaml`), text);

    if (!opts.force && base) {
      const changed = [...new Set([...Object.keys(base), ...current.map((f) => f.path)])].filter((p) => base[p] !== onBranch.get(p));
      if (changed.length) return { ok: false, conflict: changed };
    }

    const version: Version = {};
    const changes: Change[] = [];
    for (const [p, text] of next) {
      const sha = await gitBlobSha(text);
      version[p] = sha;
      if (onBranch.get(p) !== sha) changes.push({ path: p, content: text, exists: onBranch.has(p) });
    }
    for (const f of current) if (!next.has(f.path)) changes.push({ path: f.path, content: null, exists: true });

    const title = opts.message.split('\n')[0]!;
    if (!changes.length && !(opts.review && existing)) {
      return { ok: true, version, url: this.host.webUrl(target, path), review: opts.review, branch: opts.review ? target : undefined };
    }
    let url = changes.length ? await this.host.commit(target, changes, opts.message, existing ? undefined : snap.commit) : this.host.webUrl(target, path);
    if (opts.review) url = await this.host.review(target, main, title, `${opts.message}\n\nPublicado desde Trazo: \`${path || '/'}\`.`);
    return { ok: true, version, url, review: opts.review, branch: opts.review ? target : undefined };
  }

  webUrl(path: string): string | undefined {
    return this.host.webUrl(this.host.config.branch ?? 'HEAD', path);
  }
}

/** True when the sources are exactly the files `version` describes (nothing to publish). */
export async function matchesVersion(path: string, sources: WorkspaceSources, modelFile: string, version: Version): Promise<boolean> {
  const files = new Map<string, string>([[join(path, modelFile), sources.model]]);
  for (const [id, text] of Object.entries(sources.views)) files.set(join(path, `views/${id}.view.yaml`), text);
  if (files.size !== Object.keys(version).length) return false;
  for (const [p, text] of files) if (version[p] !== (await gitBlobSha(text))) return false;
  return true;
}
