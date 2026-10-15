/**
 * "Iniciar sesión con GitHub" through the Trazo Worker (packages/worker). The Worker only swaps the
 * OAuth code for a GitHub App user token; the app then calls api.github.com with it directly.
 * Off unless the build sets VITE_TRAZO_API to the Worker URL. Only for github.com libraries.
 */

export interface GitHubSession {
  accessToken: string;
  /** Epoch ms; null when the GitHub App does not expire tokens. */
  expiresAt: number | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
  user?: { login: string; name: string | null; avatarUrl: string };
}

const KEY = 'trazo.github-session.v1';
const FRAGMENT = '#trazo-auth=';
/** Renew this long before the token runs out, so a publish never starts with a dying token. */
const MARGIN = 5 * 60_000;

export const authApi = (): string | undefined => (import.meta.env.VITE_TRAZO_API as string | undefined)?.replace(/\/+$/, '') || undefined;

function read(): GitHubSession | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GitHubSession) : undefined;
  } catch {
    return undefined;
  }
}

function write(session: GitHubSession | undefined) {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the session lasts until reload */
  }
  for (const fn of listeners) fn(session);
}

const listeners = new Set<(s: GitHubSession | undefined) => void>();
export function onSessionChange(fn: (s: GitHubSession | undefined) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The signed-in session, if it can still be used (directly or after a refresh). */
export function githubSession(now = Date.now()): GitHubSession | undefined {
  const s = read();
  if (!s) return undefined;
  const alive = s.expiresAt === null || s.expiresAt > now || (s.refreshToken && (s.refreshTokenExpiresAt === null || s.refreshTokenExpiresAt > now));
  return alive ? s : undefined;
}

/** Leaves for GitHub; the Worker brings the browser back here with the result in the URL fragment. */
export function startGitHubLogin() {
  const api = authApi();
  if (!api) return;
  const back = new URL(location.href);
  back.hash = '';
  location.assign(`${api}/auth/github/login?return_to=${encodeURIComponent(back.toString())}`);
}

/**
 * Reads the login result the Worker left in the URL fragment, stores the session and cleans the
 * URL. Returns undefined when this page load is not a return from login.
 */
export function consumeLoginResult(): { session?: GitHubSession; error?: string } | undefined {
  if (!location.hash.startsWith(FRAGMENT)) return undefined;
  const raw = location.hash.slice(FRAGMENT.length);
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const message = JSON.parse(decodeURIComponent(raw)) as { type?: string; session?: GitHubSession; error?: string };
    if (message.type !== 'trazo:github-auth') return { error: 'respuesta_desconocida' };
    if (message.session) write(message.session);
    return { session: message.session, error: message.error };
  } catch {
    return { error: 'respuesta_ilegible' };
  }
}

let refreshing: Promise<GitHubSession | undefined> | undefined;

async function refresh(s: GitHubSession, fetcher: typeof fetch): Promise<GitHubSession | undefined> {
  const api = authApi();
  if (!api || !s.refreshToken) return undefined;
  const res = await fetcher(`${api}/auth/github/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refreshToken }),
  });
  if (!res.ok) {
    // A refresh token that GitHub rejects is spent: sign out so the UI offers to log in again.
    if (res.status === 400 || res.status === 401) write(undefined);
    return undefined;
  }
  const next = { ...(await res.json()), user: s.user } as GitHubSession;
  write(next);
  return next;
}

/** A usable user token, renewed first when it is about to expire. */
export async function githubToken(fetcher: typeof fetch = (...a) => fetch(...a), now = Date.now()): Promise<string | undefined> {
  const s = githubSession(now);
  if (!s) return undefined;
  if (s.expiresAt === null || s.expiresAt - now > MARGIN) return s.accessToken;
  refreshing ??= refresh(s, fetcher).finally(() => (refreshing = undefined));
  const next = await refreshing;
  return next?.accessToken ?? (s.expiresAt > now ? s.accessToken : undefined);
}

export async function logoutGitHub(fetcher: typeof fetch = (...a) => fetch(...a)) {
  const s = read();
  write(undefined);
  const api = authApi();
  if (!s || !api) return;
  // Best effort: the session is gone from this browser whatever GitHub answers.
  await fetcher(`${api}/auth/github/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: s.accessToken }),
  }).catch(() => undefined);
}

/** Human message for an error code the Worker or GitHub sent back. */
export function loginErrorMessage(code: string): string {
  if (code === 'access_denied') return 'Cancelaste el inicio de sesión con GitHub.';
  if (code === 'state_mismatch') return 'El inicio de sesión no coincide con el que empezó Trazo. Vuelve a intentarlo.';
  if (code === 'bad_verification_code') return 'GitHub rechazó el código de inicio de sesión (caducado o ya usado). Vuelve a intentarlo.';
  return `No se pudo iniciar sesión con GitHub (${code}).`;
}

export interface InstalledRepo {
  owner: string;
  repo: string;
  fullName: string;
  private: boolean;
  description: string | null;
}

export interface InstalledRepos {
  repos: InstalledRepo[];
  /** Where to add or remove repositories of each installation (github.com settings pages). */
  configureUrls: string[];
}

/**
 * Repositories the signed-in person can reach through the Trazo GitHub App: those of every
 * installation they have access to. Picking one fills in the library connection.
 */
export async function installedRepos(fetcher: typeof fetch = (...a) => fetch(...a)): Promise<InstalledRepos> {
  const token = await githubToken(fetcher);
  if (!token) throw new Error('Inicia sesión con GitHub para ver tus repositorios.');
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetcher(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) throw new Error(`GitHub respondió ${res.status} al listar tus repositorios.`);
    return (await res.json()) as T;
  };
  const { installations } = await get<{ installations: Array<{ id: number; html_url: string }> }>('/user/installations?per_page=100');
  const repos: InstalledRepo[] = [];
  for (const inst of installations) {
    // A few pages are plenty for a list people scroll through; search narrows it anyway.
    for (let page = 1; page <= 5; page++) {
      const r = await get<{ repositories: Array<{ name: string; full_name: string; private: boolean; description: string | null; owner: { login: string } }> }>(
        `/user/installations/${inst.id}/repositories?per_page=100&page=${page}`,
      );
      for (const x of r.repositories) repos.push({ owner: x.owner.login, repo: x.name, fullName: x.full_name, private: x.private, description: x.description });
      if (r.repositories.length < 100) break;
    }
  }
  repos.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return { repos, configureUrls: installations.map((i) => i.html_url) };
}
