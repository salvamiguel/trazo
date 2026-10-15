import { describe, expect, it } from 'vitest';
import { gitBlobSha, GitLibrary, matchesVersion, reviewBranch } from '../src/storage/git.ts';
import { GitHubHost } from '../src/storage/github.ts';
import { GitLabHost } from '../src/storage/gitlab.ts';
import { parseRepoUrl } from '../src/storage/libraries.ts';
import { architectureMeta } from '../src/storage/meta.ts';

const MODEL = `# Pagos: cobros con tarjeta
metadata:
  trazo:
    title: Plataforma de pagos
    domain: Pagos
    status: Producción
    tags: [aws, ia]
nodes:
  - unique-id: a
    node-type: service
    name: A
`;

/**
 * A tiny in-memory GitHub: refs point at commits, commits at flat trees (path → content).
 * Enough of the REST git data API for GitLibrary to list, load and publish against.
 */
async function fakeGitHub(files: Record<string, string>) {
  const blobs = new Map<string, string>();
  const commits = new Map<string, Record<string, string>>();
  const refs = new Map<string, string>();
  const pulls: Array<{ head: string; base: string; title: string }> = [];
  const calls: string[] = [];
  let n = 0;
  const store = async (tree: Record<string, string>) => {
    const id = `c${++n}`;
    const shas: Record<string, string> = {};
    for (const [p, text] of Object.entries(tree)) {
      const sha = await gitBlobSha(text);
      blobs.set(sha, text);
      shas[p] = sha;
    }
    commits.set(id, shas);
    return id;
  };
  refs.set('main', await store(files));
  const trees = new Map<string, Record<string, string>>();
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetcher = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const path = url.pathname.replace('/repos/acme/arq', '');
    calls.push(`${method} ${path}`);
    let m: RegExpExecArray | null;
    if (path === '' && method === 'GET') return json({ default_branch: 'main' });
    if ((m = /^\/git\/ref\/heads\/(.+)$/.exec(path))) {
      const sha = refs.get(m[1]!);
      return sha ? json({ object: { sha } }) : json({ message: 'Not Found' }, 404);
    }
    if ((m = /^\/git\/commits\/(\w+)$/.exec(path))) return json({ tree: { sha: `t-${m[1]}` } });
    if ((m = /^\/git\/trees\/t-(\w+)$/.exec(path))) {
      const shas = commits.get(m[1]!)!;
      return json({ truncated: false, tree: Object.entries(shas).map(([p, sha]) => ({ path: p, type: 'blob', sha })) });
    }
    if ((m = /^\/git\/blobs\/(\w+)$/.exec(path))) return json({ encoding: 'base64', content: Buffer.from(blobs.get(m[1]!)!).toString('base64') });
    if (path === '/git/trees' && method === 'POST') {
      const tree = { ...commits.get(body.base_tree.slice(2))! };
      const text: Record<string, string> = Object.fromEntries(Object.entries(tree).map(([p, sha]) => [p, blobs.get(sha)!]));
      for (const e of body.tree) {
        if (e.sha === null) delete text[e.path];
        else text[e.path] = e.content;
      }
      const id = `tree${trees.size}`;
      trees.set(id, text);
      return json({ sha: id });
    }
    if (path === '/git/commits' && method === 'POST') return json({ sha: await store(trees.get(body.tree)!), html_url: 'https://github.com/acme/arq/commit/x' });
    if (path === '/git/refs' && method === 'POST') {
      refs.set(body.ref.replace('refs/heads/', ''), body.sha);
      return json({}, 201);
    }
    if ((m = /^\/git\/refs\/heads\/(.+)$/.exec(path)) && method === 'PATCH') {
      refs.set(m[1]!, body.sha);
      return json({});
    }
    if (path === '/pulls' && method === 'GET') {
      const head = url.searchParams.get('head')!.split(':')[1];
      return json(pulls.filter((p) => p.head === head).map(() => ({ html_url: 'https://github.com/acme/arq/pull/1' })));
    }
    if (path === '/pulls' && method === 'POST') {
      pulls.push(body);
      return json({ html_url: 'https://github.com/acme/arq/pull/1' }, 201);
    }
    return json({ message: `unexpected ${method} ${path}` }, 500);
  }) as typeof fetch;

  /** The text of every file on a branch. */
  const read = (branch: string) => Object.fromEntries(Object.entries(commits.get(refs.get(branch)!)!).map(([p, sha]) => [p, blobs.get(sha)!]));
  return { fetcher, refs, pulls, calls, read };
}

const REPO = {
  'README.md': '# Arquitecturas',
  'arquitecturas/pagos/architecture.calm.yaml': MODEL,
  'arquitecturas/pagos/views/contexto.view.yaml': 'title: Contexto\n',
  'arquitecturas/pagos/views/infra.view.yaml': 'title: Infra\n',
  'arquitecturas/crm/crm.calm.yaml': 'nodes: []\n',
  'otros/legacy/architecture.calm.yaml': 'nodes: []\n',
};

const library = (fetcher: typeof fetch, root?: string) =>
  new GitLibrary(new GitHubHost({ id: 'l', kind: 'github', name: 'Acme', owner: 'acme', repo: 'arq', root }, 'token', fetcher));

describe('reading a repository reference', () => {
  it('accepts owner/repo, GitHub and GitLab URLs', () => {
    expect(parseRepoUrl('acme/arq')).toEqual({ kind: 'github', owner: 'acme', repo: 'arq' });
    expect(parseRepoUrl('https://github.com/acme/arq/tree/dev/docs/arq')).toMatchObject({ kind: 'github', owner: 'acme', repo: 'arq', branch: 'dev', root: 'docs/arq' });
    expect(parseRepoUrl('https://github.acme.com/arq/catalogo.git')).toMatchObject({ kind: 'github', api: 'https://github.acme.com/api/v3' });
    expect(parseRepoUrl('https://gitlab.com/acme/plataforma/arq/-/tree/main/sistemas')).toEqual({ kind: 'gitlab', project: 'acme/plataforma/arq', url: undefined, branch: 'main', root: 'sistemas' });
    expect(parseRepoUrl('https://git.acme.es/equipo/arq')).toMatchObject({ kind: 'gitlab', project: 'equipo/arq', url: 'https://git.acme.es' });
    expect(parseRepoUrl('no es un repo')).toEqual({});
  });
});

describe('catalog metadata', () => {
  it('comes from metadata.trazo, then the leading comment, then the folder', () => {
    expect(architectureMeta(MODEL, 2, 'x')).toMatchObject({ title: 'Plataforma de pagos', description: 'cobros con tarjeta', domain: 'Pagos', status: 'Producción', tags: ['aws', 'ia'], elements: 1, views: 2 });
    expect(architectureMeta('# CRM: clientes\nnodes: []', 0, 'x').title).toBe('CRM');
    expect(architectureMeta('nodes: [', 0, 'equipo/pagos-aws').title).toBe('Pagos aws');
  });
});

describe('git versions', () => {
  it('computes blob ids like git does', async () => {
    expect(await gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(await gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });

  it('names review branches after the folder', () => {
    expect(reviewBranch('arquitecturas/Pagos AWS', new Date(2026, 9, 5, 9, 3, 7))).toBe('trazo/pagos-aws-20261005-090307');
  });
});

describe('a GitHub library', () => {
  it('lists one architecture per folder with a model, inside its root', async () => {
    const gh = await fakeGitHub(REPO);
    const entries = await library(gh.fetcher, 'arquitecturas').list();
    expect(entries.map((e) => [e.path, e.modelFile, e.title, e.views])).toEqual([
      ['arquitecturas/crm', 'crm.calm.yaml', 'Crm', 0],
      ['arquitecturas/pagos', 'architecture.calm.yaml', 'Plataforma de pagos', 2],
    ]);
  });

  it('loads an architecture with its views and version', async () => {
    const gh = await fakeGitHub(REPO);
    const loaded = await library(gh.fetcher).load('arquitecturas/pagos');
    expect(loaded.sources.model).toBe(MODEL);
    expect(Object.keys(loaded.sources.views).sort()).toEqual(['contexto', 'infra']);
    expect(Object.keys(loaded.version)).toHaveLength(3);
    expect(await matchesVersion('arquitecturas/pagos', loaded.sources, loaded.modelFile, loaded.version)).toBe(true);
  });

  it('commits straight to the branch, deleting removed views', async () => {
    const gh = await fakeGitHub(REPO);
    const lib = library(gh.fetcher);
    const { sources, version } = await lib.load('arquitecturas/pagos');
    const edited = { model: `${sources.model}  # editado\n`, views: { contexto: sources.views.contexto!, nueva: 'title: Nueva\n' } };
    const r = await lib.publish('arquitecturas/pagos', edited, 'architecture.calm.yaml', version, { message: 'Cambia pagos', review: false });
    expect(r).toMatchObject({ ok: true, review: false });
    const files = gh.read('main');
    expect(files['arquitecturas/pagos/architecture.calm.yaml']).toContain('# editado');
    expect(files['arquitecturas/pagos/views/nueva.view.yaml']).toBe('title: Nueva\n');
    expect(files['arquitecturas/pagos/views/infra.view.yaml']).toBeUndefined();
    expect(files['README.md']).toBe('# Arquitecturas');
    if (r.ok) expect(await matchesVersion('arquitecturas/pagos', edited, 'architecture.calm.yaml', r.version)).toBe(true);
  });

  it('opens a pull request on a new branch, and reuses it on the next publish', async () => {
    const gh = await fakeGitHub(REPO);
    const lib = library(gh.fetcher);
    const { sources, version } = await lib.load('arquitecturas/pagos');
    const r1 = await lib.publish('arquitecturas/pagos', { ...sources, model: `${MODEL}# v2\n` }, 'architecture.calm.yaml', version, { message: 'v2', review: true });
    if (!r1.ok) throw new Error('conflict');
    expect(r1.branch).toMatch(/^trazo\/pagos-/);
    expect(r1.url).toBe('https://github.com/acme/arq/pull/1');
    expect(gh.read('main')['arquitecturas/pagos/architecture.calm.yaml']).toBe(MODEL);
    const r2 = await lib.publish('arquitecturas/pagos', { ...sources, model: `${MODEL}# v3\n` }, 'architecture.calm.yaml', r1.version, { message: 'v3', review: true, branch: r1.branch });
    expect(r2.ok).toBe(true);
    expect(gh.read(r1.branch!)['arquitecturas/pagos/architecture.calm.yaml']).toContain('# v3');
    expect(gh.pulls).toHaveLength(1);
  });

  it('creates a new architecture in its folder', async () => {
    const gh = await fakeGitHub(REPO);
    const r = await library(gh.fetcher).publish('arquitecturas/nueva', { model: 'nodes: []\n', views: { contexto: 'title: C\n' } }, 'architecture.calm.yaml', undefined, { message: 'Añade nueva', review: false });
    expect(r.ok).toBe(true);
    expect(Object.keys(gh.read('main')).filter((p) => p.startsWith('arquitecturas/nueva/'))).toEqual(['arquitecturas/nueva/architecture.calm.yaml', 'arquitecturas/nueva/views/contexto.view.yaml']);
  });

  it('refuses to overwrite changes made since it was opened, unless forced', async () => {
    const gh = await fakeGitHub(REPO);
    const mine = library(gh.fetcher);
    const theirs = library(gh.fetcher);
    const opened = await mine.load('arquitecturas/pagos');
    const other = await theirs.load('arquitecturas/pagos');
    await theirs.publish('arquitecturas/pagos', { ...other.sources, views: { ...other.sources.views, infra: 'title: Suya\n' } }, 'architecture.calm.yaml', other.version, { message: 'suya', review: false });
    const edited = { ...opened.sources, model: `${MODEL}# mía\n` };
    const r = await mine.publish('arquitecturas/pagos', edited, 'architecture.calm.yaml', opened.version, { message: 'mía', review: false });
    expect(r).toEqual({ ok: false, conflict: ['arquitecturas/pagos/views/infra.view.yaml'] });
    const forced = await mine.publish('arquitecturas/pagos', edited, 'architecture.calm.yaml', opened.version, { message: 'mía', review: false, force: true });
    expect(forced.ok).toBe(true);
    expect(gh.read('main')['arquitecturas/pagos/views/infra.view.yaml']).toBe('title: Infra\n');
  });

  it('explains a missing private repository in Spanish', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })) as typeof fetch;
    const lib = new GitLibrary(new GitHubHost({ id: 'l', kind: 'github', name: 'x', owner: 'acme', repo: 'privado' }, undefined, fetcher));
    await expect(lib.list()).rejects.toThrow('No se encuentra acme/privado. Si es privado, añade un token.');
  });
});

describe('a GitLab library', () => {
  it('commits with create, update and delete actions from the right start', async () => {
    const sent: Array<{ url: string; body?: unknown; headers?: HeadersInit }> = [];
    const files = [
      { path: 'arq/pagos/architecture.calm.yaml', type: 'blob', id: await gitBlobSha(MODEL) },
      { path: 'arq/pagos/views/vieja.view.yaml', type: 'blob', id: await gitBlobSha('title: Vieja\n') },
    ];
    const fetcher = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: init?.headers });
      const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (url.includes('/repository/branches/main')) return ok({ commit: { id: 'abc' } });
      if (url.includes('/repository/branches/')) return new Response('{"message":"404 Branch Not Found"}', { status: 404 });
      if (url.includes('/repository/tree')) return ok(files);
      if (url.endsWith('/repository/commits')) return ok({ id: 'def', web_url: 'https://gitlab.com/acme/arq/-/commit/def' });
      if (url.includes('/merge_requests?')) return ok([]);
      if (url.endsWith('/merge_requests')) return ok({ web_url: 'https://gitlab.com/acme/arq/-/merge_requests/7' });
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    const lib = new GitLibrary(new GitLabHost({ id: 'g', kind: 'gitlab', name: 'Acme', project: 'acme/arq', branch: 'main', root: 'arq' }, 'glpat', fetcher));
    const r = await lib.publish('arq/pagos', { model: `${MODEL}# v2\n`, views: { nueva: 'title: N\n' } }, 'architecture.calm.yaml', undefined, { message: 'v2', review: true });
    expect(r).toMatchObject({ ok: true, url: 'https://gitlab.com/acme/arq/-/merge_requests/7', review: true });
    const commit = sent.find((s) => s.url.endsWith('/repository/commits'))!.body as { start_sha: string; actions: Array<{ action: string; file_path: string }> };
    expect(commit.start_sha).toBe('abc');
    expect(commit.actions.map((a) => `${a.action} ${a.file_path}`)).toEqual([
      'update arq/pagos/architecture.calm.yaml',
      'create arq/pagos/views/nueva.view.yaml',
      'delete arq/pagos/views/vieja.view.yaml',
    ]);
    expect(sent[0]!.url).toContain('/api/v4/projects/acme%2Farq/');
    expect(sent[0]!.headers).toMatchObject({ 'PRIVATE-TOKEN': 'glpat' });
  });
});
