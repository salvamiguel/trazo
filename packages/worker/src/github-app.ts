/** Server-to-server GitHub App auth: an app JWT signed with the private key, swapped for a read-only installation token. */
import type { Env } from './env.ts';
import { HttpError, base64url } from './http.ts';

const API = 'https://api.github.com';
export const USER_AGENT = 'trazo-worker';

/** Lives as long as the isolate does; GitHub installation tokens last one hour. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function resetTokenCache(): void {
  tokenCache.clear();
}

function pemBody(pem: string): Uint8Array {
  const b64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

const der = (tag: number, body: Uint8Array): Uint8Array => new Uint8Array([tag, ...derLength(body.length), ...body]);

/** GitHub hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"); WebCrypto only imports PKCS#8, so wrap it. */
export function toPkcs8(pem: string): Uint8Array {
  const body = pemBody(pem);
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) return body;
  const rsaAlgorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  return der(0x30, new Uint8Array([...version, ...rsaAlgorithm, ...der(0x04, body)]));
}

export async function appJwt(env: Env, now = Math.floor(Date.now() / 1000)): Promise<string> {
  if (!env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY) throw new HttpError(501, 'gallery_not_configured');
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('pkcs8', toPkcs8(env.GH_APP_PRIVATE_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    throw new HttpError(500, 'invalid_app_private_key', 'GH_APP_PRIVATE_KEY no es una clave .pem válida');
  }
  const enc = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  // iat 60 s in the past absorbs clock drift; GitHub allows at most 10 minutes.
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iat: now - 60, exp: now + 540, iss: env.GH_APP_ID })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(signature)}`;
}

async function gh<T>(path: string, auth: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: auth, Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT, 'X-GitHub-Api-Version': '2022-11-28', ...init.headers },
  });
  if (res.status === 404) throw new HttpError(404, 'app_not_installed', `La GitHub App no está instalada en ${path.split('/').slice(2, 4).join('/')}`);
  if (!res.ok) throw new HttpError(502, 'github_error', `GitHub respondió ${res.status} en ${path}`);
  return (await res.json()) as T;
}

/** Read-only token for one repository, limited to `contents: read` whatever the app was granted. */
export async function installationToken(env: Env, owner: string, repo: string): Promise<string> {
  const key = `${owner}/${repo}`.toLowerCase();
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;

  const jwt = `Bearer ${await appJwt(env)}`;
  const installation = await gh<{ id: number }>(`/repos/${owner}/${repo}/installation`, jwt);
  const { token, expires_at } = await gh<{ token: string; expires_at: string }>(`/app/installations/${installation.id}/access_tokens`, jwt, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repositories: [repo], permissions: { contents: 'read' } }),
  });
  tokenCache.set(key, { token, expiresAt: Date.parse(expires_at) });
  return token;
}
