/**
 * "Iniciar sesión con GitHub" for git libraries, through a GitHub App.
 *
 * The browser cannot finish the OAuth flow by itself: the code-for-token exchange needs the
 * app's client secret and GitHub's token endpoint sends no CORS headers. This Worker does only
 * that exchange (and the refresh); the app keeps talking to api.github.com directly with the
 * user token, so diagrams never pass through here.
 *
 *   GET  /auth/github/login?return_to=<app url>   → redirect to GitHub (state + PKCE in a cookie)
 *   GET  /auth/github/callback                     → exchange the code, hand the session to the app
 *   POST /auth/github/refresh  {refresh_token}     → new user token (they expire after 8 h)
 *   POST /auth/github/logout   {access_token}      → revoke the token
 */
import { oauthEnabled, type Env } from './env.ts';
import { HttpError, base64url, isAllowedOrigin, json, randomToken, readJson } from './http.ts';

const COOKIE = '__Host-trazo_oauth';
const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';
const USER_AGENT = 'trazo-worker';

/** What the app receives after login or refresh. Times are epoch milliseconds; null when GitHub sets no expiry. */
export interface GitHubSession {
  accessToken: string;
  expiresAt: number | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
  user?: { login: string; name: string | null; avatarUrl: string };
}

/** Message posted to the window that opened the login popup. */
export type AuthMessage = { type: 'trazo:github-auth'; session: GitHubSession } | { type: 'trazo:github-auth'; error: string };

interface PendingLogin {
  state: string;
  verifier: string;
  returnTo: string;
}

function requireOauth(env: Env): asserts env is Env & { GH_CLIENT_ID: string; GH_CLIENT_SECRET: string } {
  if (!oauthEnabled(env)) throw new HttpError(501, 'oauth_not_configured', 'Faltan GH_CLIENT_ID o GH_CLIENT_SECRET');
}

/** `return_to` must be a page of an allowed app origin; anything else would let the token leak elsewhere. */
function checkReturnTo(env: Env, value: string | null): string {
  if (!value) throw new HttpError(400, 'return_to_required');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, 'return_to_invalid');
  }
  if (!isAllowedOrigin(env, url.origin)) throw new HttpError(403, 'return_to_not_allowed', `${url.origin} no está en ALLOWED_ORIGINS`);
  url.hash = '';
  return url.toString();
}

const callbackUrl = (request: Request): string => new URL('/auth/github/callback', request.url).toString();

export async function login(request: Request, env: Env): Promise<Response> {
  requireOauth(env);
  const returnTo = checkReturnTo(env, new URL(request.url).searchParams.get('return_to'));
  const pending: PendingLogin = { state: randomToken(), verifier: randomToken(48), returnTo };
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pending.verifier)));

  const authorize = new URL(AUTHORIZE_URL);
  authorize.searchParams.set('client_id', env.GH_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', callbackUrl(request));
  authorize.searchParams.set('state', pending.state);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');

  const cookie = base64url(new TextEncoder().encode(JSON.stringify(pending)));
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': `${COOKIE}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      'Cache-Control': 'no-store',
    },
  });
}

function readPending(request: Request): PendingLogin | null {
  const raw = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return null;
  try {
    const text = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    const value = JSON.parse(new TextDecoder().decode(Uint8Array.from(text, (c) => c.charCodeAt(0)))) as PendingLogin;
    return typeof value.state === 'string' && typeof value.verifier === 'string' && typeof value.returnTo === 'string' ? value : null;
  } catch {
    return null;
  }
}

export async function callback(request: Request, env: Env): Promise<Response> {
  requireOauth(env);
  const params = new URL(request.url).searchParams;
  const pending = readPending(request);
  // Without a valid pending login there is no trusted place to send anything back to.
  if (!pending) throw new HttpError(400, 'login_expired', 'La sesión de login caducó o no empezó aquí; vuelve a intentarlo desde Trazo');
  const returnTo = checkReturnTo(env, pending.returnTo);

  let message: AuthMessage;
  if (params.get('state') !== pending.state) {
    message = { type: 'trazo:github-auth', error: 'state_mismatch' };
  } else if (params.get('error')) {
    message = { type: 'trazo:github-auth', error: params.get('error')! };
  } else {
    try {
      const session = await exchange(env, {
        grant_type: 'authorization_code',
        code: params.get('code') ?? '',
        redirect_uri: callbackUrl(request),
        code_verifier: pending.verifier,
      });
      session.user = await fetchUser(session.accessToken);
      message = { type: 'trazo:github-auth', session };
    } catch (err) {
      message = { type: 'trazo:github-auth', error: err instanceof HttpError ? err.code : 'exchange_failed' };
    }
  }
  return handBack(message, returnTo);
}

export async function refresh(request: Request, env: Env, cors: Headers): Promise<Response> {
  requireOauth(env);
  const body = await readJson<{ refresh_token?: unknown }>(request);
  if (typeof body.refresh_token !== 'string' || !body.refresh_token) throw new HttpError(400, 'refresh_token_required');
  const session = await exchange(env, { grant_type: 'refresh_token', refresh_token: body.refresh_token });
  return json(session, { headers: cors });
}

export async function logout(request: Request, env: Env, cors: Headers): Promise<Response> {
  requireOauth(env);
  const body = await readJson<{ access_token?: unknown }>(request);
  if (typeof body.access_token !== 'string' || !body.access_token) throw new HttpError(400, 'access_token_required');
  const res = await fetch(`${API}/applications/${env.GH_CLIENT_ID}/token`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${btoa(`${env.GH_CLIENT_ID}:${env.GH_CLIENT_SECRET}`)}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ access_token: body.access_token }),
  });
  // 404: the token was already invalid, which is what logging out wants anyway.
  if (!res.ok && res.status !== 404) throw new HttpError(502, 'revoke_failed');
  return new Response(null, { status: 204, headers: cors });
}

async function exchange(env: Env & { GH_CLIENT_ID: string; GH_CLIENT_SECRET: string }, params: Record<string, string>): Promise<GitHubSession> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams({ client_id: env.GH_CLIENT_ID, client_secret: env.GH_CLIENT_SECRET, ...params }),
  });
  // GitHub answers 200 with an `error` field for bad codes and expired refresh tokens.
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof data.access_token !== 'string') {
    throw new HttpError(res.ok ? 400 : 502, typeof data.error === 'string' ? data.error : 'exchange_failed');
  }
  const now = Date.now();
  const at = (seconds: unknown): number | null => (typeof seconds === 'number' ? now + seconds * 1000 : null);
  return {
    accessToken: data.access_token,
    expiresAt: at(data.expires_in),
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
    refreshTokenExpiresAt: at(data.refresh_token_expires_in),
  };
}

async function fetchUser(token: string): Promise<GitHubSession['user']> {
  const res = await fetch(`${API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return undefined;
  const u = (await res.json()) as { login: string; name: string | null; avatar_url: string };
  return { login: u.login, name: u.name, avatarUrl: u.avatar_url };
}

/**
 * Small page that gives the result to the app: postMessage to the opener when login ran in a
 * popup, otherwise a redirect back with the result in the URL fragment (never sent to a server).
 */
function handBack(message: AuthMessage, returnTo: string): Response {
  const nonce = randomToken(16);
  const payload = JSON.stringify(message).replace(/</g, '\\u003c');
  const target = JSON.stringify(new URL(returnTo).origin);
  const fallback = JSON.stringify(`${returnTo}#trazo-auth=`);
  const html = `<!doctype html><meta charset="utf-8"><title>Trazo</title><p>Volviendo a Trazo…</p>
<script nonce="${nonce}">
const m = ${payload};
if (window.opener) { window.opener.postMessage(m, ${target}); window.close(); }
else { location.replace(${fallback} + encodeURIComponent(JSON.stringify(m))); }
</script>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}
