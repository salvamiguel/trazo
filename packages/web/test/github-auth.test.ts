import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeLoginResult, githubSession, githubToken, logoutGitHub, type GitHubSession } from '../src/storage/github-auth.ts';
import { openLibrary } from '../src/storage/libraries.ts';

const API = 'https://trazo-api.example.workers.dev';
const NOW = 1_800_000_000_000;

function fakeBrowser(hash = '') {
  const items = new Map<string, string>();
  const loc = { href: `https://salvamiguel.github.io/trazo/${hash}`, hash, pathname: '/trazo/', search: '' };
  const replaced: string[] = [];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => items.set(k, v),
    removeItem: (k: string) => items.delete(k),
  });
  vi.stubGlobal('location', loc);
  vi.stubGlobal('history', { replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) });
  return { items, replaced };
}

const session = (over: Partial<GitHubSession> = {}): GitHubSession => ({
  accessToken: 'ghu_old',
  expiresAt: NOW + 60 * 60_000,
  refreshToken: 'ghr_old',
  refreshTokenExpiresAt: NOW + 30 * 86_400_000,
  user: { login: 'salvamiguel', name: 'Salva', avatarUrl: 'https://a/1' },
  ...over,
});

const store = (s: GitHubSession) => localStorage.setItem('trazo.github-session.v1', JSON.stringify(s));

beforeEach(() => vi.stubEnv('VITE_TRAZO_API', `${API}/`));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GitHub login through the Trazo API', () => {
  it('takes the session from the URL fragment and cleans the URL', () => {
    const message = { type: 'trazo:github-auth', session: session() };
    const { replaced } = fakeBrowser(`#trazo-auth=${encodeURIComponent(JSON.stringify(message))}`);
    expect(consumeLoginResult()).toEqual({ session: session(), error: undefined });
    expect(replaced).toEqual(['/trazo/']);
    expect(githubSession(NOW)?.user?.login).toBe('salvamiguel');
  });

  it('reports a login error and ignores ordinary page loads', () => {
    fakeBrowser(`#trazo-auth=${encodeURIComponent('{"type":"trazo:github-auth","error":"access_denied"}')}`);
    expect(consumeLoginResult()).toEqual({ session: undefined, error: 'access_denied' });
    fakeBrowser('#otra-cosa');
    expect(consumeLoginResult()).toBeUndefined();
  });

  it('uses a fresh token as is and renews one about to expire', async () => {
    fakeBrowser();
    store(session());
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ accessToken: 'ghu_new', expiresAt: NOW + 8 * 3_600_000, refreshToken: 'ghr_new', refreshTokenExpiresAt: null }), { status: 200 }));
    expect(await githubToken(fetcher, NOW)).toBe('ghu_old');
    expect(fetcher).not.toHaveBeenCalled();

    expect(await githubToken(fetcher, NOW + 58 * 60_000)).toBe('ghu_new');
    expect(fetcher).toHaveBeenCalledWith(`${API}/auth/github/refresh`, expect.objectContaining({ method: 'POST', body: '{"refresh_token":"ghr_old"}' }));
    // The renewed session keeps who is signed in.
    expect(githubSession(NOW)).toMatchObject({ accessToken: 'ghu_new', user: { login: 'salvamiguel' } });
  });

  it('signs out when GitHub no longer accepts the refresh token', async () => {
    fakeBrowser();
    store(session({ expiresAt: NOW - 1 }));
    const fetcher = vi.fn(async () => new Response('{"error":"bad_refresh_token"}', { status: 400 }));
    expect(await githubToken(fetcher, NOW)).toBeUndefined();
    expect(githubSession(NOW)).toBeUndefined();
  });

  it('logs out locally and revokes the token', async () => {
    fakeBrowser();
    store(session());
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    await logoutGitHub(fetcher);
    expect(githubSession(NOW)).toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(`${API}/auth/github/logout`, expect.objectContaining({ body: '{"access_token":"ghu_old"}' }));
  });

  it('lets github.com libraries without a token of their own use the session', async () => {
    fakeBrowser();
    store(session({ expiresAt: null }));
    const seen: Array<string | null> = [];
    const fetcher = (async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('Authorization'));
      return new Response('{"default_branch":"main"}', { status: 200 });
    }) as typeof fetch;
    const github = openLibrary({ id: 'l1', kind: 'github', name: 'Arq', owner: 'acme', repo: 'arq' }, { fetcher });
    expect(github.canWrite).toBe(true);
    await github.list().catch(() => undefined);
    expect(seen[0]).toBe('Bearer ghu_old');

    // Enterprise servers are not covered by the github.com App.
    const ghes = openLibrary({ id: 'l2', kind: 'github', name: 'Arq', owner: 'acme', repo: 'arq', api: 'https://ghe.example/api/v3' }, { fetcher });
    expect(ghes.canWrite).toBe(false);
  });
});
