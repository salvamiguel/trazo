import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env.ts';
import { architecturesFromTree } from '../src/gallery.ts';
import { appJwt, resetTokenCache, toPkcs8 } from '../src/github-app.ts';
import { handle } from '../src/index.ts';

const APP = 'https://salvamiguel.github.io';
const BASE = 'https://trazo-api.example.workers.dev';

const env = (over: Partial<Env> = {}): Env => ({
  ALLOWED_ORIGINS: `${APP},http://localhost:5173`,
  GH_CLIENT_ID: 'Iv23client',
  GH_CLIENT_SECRET: 'shh',
  ...over,
});

type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;
let calls: Array<{ url: string; init: RequestInit }>;
function mockFetch(route: Route) {
  calls = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    calls.push({ url: url.toString(), init });
    return route(url, init);
  });
}
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  resetTokenCache();
});

async function startLogin(e = env()) {
  const res = await handle(new Request(`${BASE}/auth/github/login?return_to=${encodeURIComponent(`${APP}/trazo/#x`)}`), e);
  const location = new URL(res.headers.get('Location')!);
  const cookie = res.headers.get('Set-Cookie')!.split(';')[0]!;
  return { res, location, cookie };
}

describe('login', () => {
  it('redirects to GitHub with state and PKCE, keeping both in an HttpOnly cookie', async () => {
    const { res, location } = await startLogin();
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('Iv23client');
    expect(location.searchParams.get('redirect_uri')).toBe(`${BASE}/auth/github/callback`);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toMatch(/^[\w-]{40,}$/);
    expect(res.headers.get('Set-Cookie')).toMatch(/^__Host-trazo_oauth=.+; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  });

  it('refuses to return to an origin outside ALLOWED_ORIGINS', async () => {
    const res = await handle(new Request(`${BASE}/auth/github/login?return_to=https://evil.example/`), env());
    expect(res.status).toBe(403);
  });

  it('says so when the GitHub App is not configured', async () => {
    const res = await handle(new Request(`${BASE}/auth/github/login?return_to=${APP}/`), env({ GH_CLIENT_SECRET: '' }));
    expect(res.status).toBe(501);
  });
});

describe('callback', () => {
  beforeEach(() =>
    mockFetch((url, init) => {
      if (url.href === 'https://github.com/login/oauth/access_token') {
        const body = new URLSearchParams(init.body as string);
        if (body.get('code') !== 'good') return jsonRes({ error: 'bad_verification_code' });
        expect(body.get('client_secret')).toBe('shh');
        expect(body.get('code_verifier')).toBeTruthy();
        return jsonRes({ access_token: 'ghu_x', expires_in: 28800, refresh_token: 'ghr_y', refresh_token_expires_in: 15897600 });
      }
      if (url.href === 'https://api.github.com/user') return jsonRes({ login: 'salvamiguel', name: 'Salva', avatar_url: 'https://a/1' });
      return new Response('unexpected', { status: 500 });
    }),
  );

  const callback = async (query: string, cookie?: string) => {
    const res = await handle(new Request(`${BASE}/auth/github/callback?${query}`, { headers: cookie ? { Cookie: cookie } : {} }), env());
    const html = await res.text();
    const payload = /const m = (.*);\n/.exec(html)?.[1];
    return { res, html, message: payload ? JSON.parse(payload) : undefined };
  };

  it('exchanges the code and hands the session back to the app origin only', async () => {
    const { location, cookie } = await startLogin();
    const { res, html, message } = await callback(`code=good&state=${location.searchParams.get('state')}`, cookie);
    expect(res.status).toBe(200);
    expect(message.session).toMatchObject({ accessToken: 'ghu_x', refreshToken: 'ghr_y', user: { login: 'salvamiguel' } });
    expect(message.session.expiresAt).toBeGreaterThan(Date.now());
    expect(html).toContain(`postMessage(m, "${APP}")`);
    expect(html).toContain(`"${APP}/trazo/#trazo-auth="`);
    expect(res.headers.get('Content-Security-Policy')).toMatch(/script-src 'nonce-/);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('rejects a state that does not match the cookie', async () => {
    const { cookie } = await startLogin();
    const { message } = await callback('code=good&state=forged', cookie);
    expect(message).toEqual({ type: 'trazo:github-auth', error: 'state_mismatch' });
    expect(calls).toHaveLength(0);
  });

  it('reports a failed exchange', async () => {
    const { location, cookie } = await startLogin();
    const { message } = await callback(`code=bad&state=${location.searchParams.get('state')}`, cookie);
    expect(message).toEqual({ type: 'trazo:github-auth', error: 'bad_verification_code' });
  });

  it('refuses a callback without the login cookie', async () => {
    const { res } = await callback('code=good&state=x');
    expect(res.status).toBe(400);
  });
});

describe('refresh and logout', () => {
  it('refreshes for an allowed origin', async () => {
    mockFetch(() => jsonRes({ access_token: 'ghu_new', expires_in: 28800, refresh_token: 'ghr_new' }));
    const res = await handle(
      new Request(`${BASE}/auth/github/refresh`, { method: 'POST', headers: { Origin: APP, 'Content-Type': 'application/json' }, body: '{"refresh_token":"ghr_y"}' }),
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(await res.json()).toMatchObject({ accessToken: 'ghu_new', refreshToken: 'ghr_new' });
    expect(new URLSearchParams(calls[0]!.init.body as string).get('grant_type')).toBe('refresh_token');
  });

  it('blocks other origins before calling GitHub', async () => {
    mockFetch(() => jsonRes({}));
    const res = await handle(
      new Request(`${BASE}/auth/github/refresh`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"refresh_token":"x"}' }),
      env(),
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('answers the CORS preflight', async () => {
    const res = await handle(new Request(`${BASE}/auth/github/refresh`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }), env());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('revokes the token on logout', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    const res = await handle(
      new Request(`${BASE}/auth/github/logout`, { method: 'POST', headers: { Origin: APP, 'Content-Type': 'application/json' }, body: '{"access_token":"ghu_x"}' }),
      env(),
    );
    expect(res.status).toBe(204);
    expect(calls[0]!.url).toBe('https://api.github.com/applications/Iv23client/token');
    expect(calls[0]!.init.method).toBe('DELETE');
  });
});

describe('GitHub App keys', () => {
  it('wraps a PKCS#1 key as PKCS#8 and signs a JWT GitHub can verify', async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
    const pkcs1 = pkcs8.slice(26); // RSA PKCS#8 from WebCrypto: 26-byte header, then the PKCS#1 key
    const pem = (label: string, der: Uint8Array) => `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...der)).replace(/.{64}/g, '$&\n')}\n-----END ${label}-----\n`;

    expect(toPkcs8(pem('RSA PRIVATE KEY', pkcs1))).toEqual(pkcs8);
    expect(toPkcs8(pem('PRIVATE KEY', pkcs8))).toEqual(pkcs8);

    const jwt = await appJwt({ ALLOWED_ORIGINS: '', GH_APP_ID: '42', GH_APP_PRIVATE_KEY: pem('RSA PRIVATE KEY', pkcs1) }, 1_000_000);
    const [h, p, s] = jwt.split('.') as [string, string, string];
    const b64 = (x: string) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    expect(JSON.parse(new TextDecoder().decode(b64(p)))).toEqual({ iat: 999_940, exp: 1_000_540, iss: '42' });
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, b64(s), new TextEncoder().encode(`${h}.${p}`))).toBe(true);
  });
});

describe('gallery', () => {
  it('groups models, views and assets by folder', () => {
    const arch = architecturesFromTree([
      'README.md',
      'examples/aws-pagos/architecture.calm.yaml',
      'examples/aws-pagos/views/infra-aws.view.yaml',
      'examples/aws-pagos/views/contenedores-c4.view.yaml',
      'examples/aws-pagos/preview.svg',
      'examples/aws-pagos/views/notes.md',
      'examples/azure-web/architecture.calm.yaml',
      'packages/core/src/x.ts',
    ]);
    expect(arch).toEqual([
      {
        path: 'examples/aws-pagos',
        model: 'examples/aws-pagos/architecture.calm.yaml',
        views: [
          { id: 'contenedores-c4', path: 'examples/aws-pagos/views/contenedores-c4.view.yaml' },
          { id: 'infra-aws', path: 'examples/aws-pagos/views/infra-aws.view.yaml' },
        ],
        assets: ['examples/aws-pagos/preview.svg'],
      },
      { path: 'examples/azure-web', model: 'examples/azure-web/architecture.calm.yaml', views: [], assets: [] },
    ]);
  });

  it('is off until the app and repos are configured', async () => {
    const res = await handle(new Request(`${BASE}/gallery/salvamiguel/trazo`), env());
    expect(res.status).toBe(404);
    expect(await (await handle(new Request(`${BASE}/gallery`), env())).json()).toEqual({ repos: [] });
  });

  it('only serves files of allowlisted repos, at a commit, of known types', async () => {
    const e = env({ GH_APP_ID: '1', GH_APP_PRIVATE_KEY: 'unused', GALLERY_REPOS: 'salvamiguel/trazo' });
    const get = async (path: string) => (await handle(new Request(`${BASE}${path}`), e)).status;
    const sha = 'a'.repeat(40);
    expect(await get(`/gallery/other/repo`)).toBe(404);
    expect(await get(`/gallery/salvamiguel/trazo/files/x.calm.yaml?ref=main`)).toBe(400);
    expect(await get(`/gallery/salvamiguel/trazo/files/a%2F..%2Fsecret.yaml?ref=${sha}`)).toBe(400);
    expect(await get(`/gallery/salvamiguel/trazo/files/.env?ref=${sha}`)).toBe(403);
  });
});
