/** Bindings of the Trazo Worker. Plain values come from wrangler.jsonc or `--var`; secrets from `wrangler secret put`. */
export interface Env {
  /** Origins of the Trazo web app allowed to log in and call the API, comma separated (e.g. `https://salvamiguel.github.io,http://localhost:5173`). */
  ALLOWED_ORIGINS: string;
  /** Client ID of the GitHub App used for "Iniciar sesión con GitHub". */
  GH_CLIENT_ID?: string;
  /** Secret: client secret of that GitHub App. */
  GH_CLIENT_SECRET?: string;
  /** App ID of the GitHub App, only needed by the gallery. */
  GH_APP_ID?: string;
  /** Secret: private key (.pem, PKCS#1 or PKCS#8) of the GitHub App, only needed by the gallery. */
  GH_APP_PRIVATE_KEY?: string;
  /** Repositories published read-only in the gallery, comma separated `owner/repo`. Empty turns the gallery off. */
  GALLERY_REPOS?: string;
}

export const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const oauthEnabled = (env: Env): boolean => Boolean(env.GH_CLIENT_ID && env.GH_CLIENT_SECRET);

export const galleryEnabled = (env: Env): boolean => Boolean(env.GH_APP_ID && env.GH_APP_PRIVATE_KEY && list(env.GALLERY_REPOS).length);
