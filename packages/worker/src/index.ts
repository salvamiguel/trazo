/** Trazo API: the few things the static web app cannot do from the browser. See docs/backend-cloudflare.md. */
import { galleryEnabled, oauthEnabled, type Env } from './env.ts';
import * as gallery from './gallery.ts';
import { HttpError, corsHeaders, errorResponse, json } from './http.ts';
import * as oauth from './oauth.ts';

export type { Env } from './env.ts';

export async function handle(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;

  // Login pages are top-level navigations, not fetches: no CORS, errors shown as text.
  if (method === 'GET' && pathname === '/auth/github/login') return oauth.login(request, env).catch(plainError);
  if (method === 'GET' && pathname === '/auth/github/callback') return oauth.callback(request, env).catch(plainError);

  let cors: Headers;
  try {
    cors = corsHeaders(env, request);
  } catch (err) {
    return errorResponse(err);
  }
  try {
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const res = await route(request, env, method, pathname, cors);
    for (const [k, v] of cors) res.headers.set(k, v);
    return res;
  } catch (err) {
    return errorResponse(err, cors);
  }
}

async function route(request: Request, env: Env, method: string, pathname: string, cors: Headers): Promise<Response> {
  if (method === 'GET' && pathname === '/health') {
    return json({ ok: true, oauth: oauthEnabled(env), gallery: galleryEnabled(env) });
  }
  if (method === 'POST' && pathname === '/auth/github/refresh') return oauth.refresh(request, env, cors);
  if (method === 'POST' && pathname === '/auth/github/logout') return oauth.logout(request, env, cors);

  if (method === 'GET' && pathname === '/gallery') return gallery.repos(env);
  const g = /^\/gallery\/([^/]+)\/([^/]+)(?:\/files\/(.+))?$/.exec(pathname);
  if (method === 'GET' && g) {
    let parts: Array<string | undefined>;
    try {
      parts = g.map((s) => (s === undefined ? s : decodeURIComponent(s)));
    } catch {
      throw new HttpError(400, 'invalid_path');
    }
    const [, owner, repo, path] = parts;
    // The cached Response may be immutable; copy it so CORS headers can be added.
    const res = path ? await gallery.file(request, env, owner!, repo!, path) : await gallery.index(request, env, owner!, repo!);
    return new Response(res.body, res);
  }
  throw new HttpError(404, 'not_found');
}

function plainError(err: unknown): Response {
  const status = err instanceof HttpError ? err.status : 500;
  if (!(err instanceof HttpError)) console.error(err);
  const text = err instanceof HttpError ? err.message : 'Error interno';
  return new Response(`Trazo: ${text}\n`, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),
};
