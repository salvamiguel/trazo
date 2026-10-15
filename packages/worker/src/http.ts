import { list, type Env } from './env.ts';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** True when `origin` is one of the web app origins this deployment serves. */
export function isAllowedOrigin(env: Env, origin: string | null): origin is string {
  return origin !== null && list(env.ALLOWED_ORIGINS).includes(origin);
}

/**
 * CORS headers for a browser call. Calls without an Origin header (curl, direct navigation) pass;
 * calls from an origin outside ALLOWED_ORIGINS are refused before doing any work.
 */
export function corsHeaders(env: Env, request: Request): Headers {
  const origin = request.headers.get('Origin');
  const headers = new Headers({ Vary: 'Origin' });
  if (origin === null) return headers;
  if (!isAllowedOrigin(env, origin)) throw new HttpError(403, 'origin_not_allowed', `Origin ${origin} no está en ALLOWED_ORIGINS`);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

export function json(body: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function errorResponse(err: unknown, headers?: HeadersInit): Response {
  if (err instanceof HttpError) return json({ error: err.code, message: err.message }, { status: err.status, headers });
  console.error(err);
  return json({ error: 'internal_error' }, { status: 500, headers });
}

export async function readJson<T>(request: Request): Promise<T> {
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) throw new HttpError(415, 'json_expected');
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export const base64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const randomToken = (bytes = 32): string => base64url(crypto.getRandomValues(new Uint8Array(bytes)));
