/**
 * Version history of each workspace, kept in this browser (IndexedDB). Autosave writes the
 * current state; this keeps earlier states the user can browse, compare and restore.
 */
import { parseWorkspace, type WorkspaceSources } from '@trazo/core';

export type VersionReason = 'auto' | 'named' | 'before-restore' | 'before-switch';

export interface Version {
  id: number;
  ws: string;
  at: number;
  sources: WorkspaceSources;
  /** Element ids and names, to describe what changed between versions without reparsing. */
  elements: Array<[id: string, name: string]>;
  relationships: string[];
  views: string[];
  reason: VersionReason;
  name?: string;
}

export interface VersionDiff {
  added: string[];
  removed: string[];
  relsAdded: number;
  relsRemoved: number;
  viewsAdded: string[];
  viewsRemoved: string[];
  /** Same elements, relationships and views, but the text differs (names, properties, layout). */
  edited: boolean;
}

/** An edit session becomes one version: a new one starts after this much time. */
export const VERSION_GAP_MS = 2 * 60_000;
/** Unnamed versions kept per workspace; named ones are never pruned. */
export const MAX_VERSIONS = 100;

const same = (a: WorkspaceSources, b: WorkspaceSources) => a.model === b.model && JSON.stringify(a.views) === JSON.stringify(b.views);

export function summarize(sources: WorkspaceSources): Pick<Version, 'elements' | 'relationships' | 'views'> {
  const views = Object.keys(sources.views).sort();
  try {
    const { model } = parseWorkspace(sources);
    return { elements: [...model.elements.values()].map((e) => [e.id, e.name]), relationships: model.relationships.map((r) => r.id), views };
  } catch {
    return { elements: [], relationships: [], views };
  }
}

export function diffVersions(before: Pick<Version, 'elements' | 'relationships' | 'views' | 'sources'> | undefined, after: Pick<Version, 'elements' | 'relationships' | 'views' | 'sources'>): VersionDiff {
  const prevEls = new Map(before?.elements ?? []);
  const nextEls = new Map(after.elements);
  const prevRels = new Set(before?.relationships ?? []);
  const nextRels = new Set(after.relationships);
  const prevViews = new Set(before?.views ?? []);
  const nextViews = new Set(after.views);
  const diff: VersionDiff = {
    added: [...nextEls].filter(([id]) => !prevEls.has(id)).map(([, name]) => name),
    removed: [...prevEls].filter(([id]) => !nextEls.has(id)).map(([, name]) => name),
    relsAdded: [...nextRels].filter((id) => !prevRels.has(id)).length,
    relsRemoved: [...prevRels].filter((id) => !nextRels.has(id)).length,
    viewsAdded: [...nextViews].filter((v) => !prevViews.has(v)),
    viewsRemoved: [...prevViews].filter((v) => !nextViews.has(v)),
    edited: false,
  };
  const structural = diff.added.length + diff.removed.length + diff.relsAdded + diff.relsRemoved + diff.viewsAdded.length + diff.viewsRemoved.length;
  diff.edited = !structural && !!before && !same(before.sources, after.sources);
  return diff;
}

/**
 * Whether a save should become a new version. Identical content never does; otherwise a
 * forced snapshot (named, before restoring or switching) always does, and autosave does once
 * the last version is older than the gap.
 */
export function shouldSnapshot(latest: Pick<Version, 'at' | 'sources'> | undefined, sources: WorkspaceSources, now: number, force = false): boolean {
  if (!latest) return true;
  if (same(latest.sources, sources)) return false;
  return force || now - latest.at >= VERSION_GAP_MS;
}

/** Ids of unnamed versions beyond the cap, oldest first (`versions` is newest first). */
export function prunable(versions: Version[], max = MAX_VERSIONS): number[] {
  return versions.filter((v) => !v.name).slice(max).map((v) => v.id);
}

// ---- Storage --------------------------------------------------------------------------------

interface Backend {
  all(ws: string): Promise<Version[]>;
  put(v: Omit<Version, 'id'> & { id?: number }): Promise<number>;
  remove(ids: number[]): Promise<void>;
}

/** Used where IndexedDB is missing (tests, some sandboxed frames): history lasts until reload. */
function memoryBackend(): Backend {
  const rows = new Map<number, Version>();
  let next = 1;
  return {
    all: async (ws) => [...rows.values()].filter((v) => v.ws === ws).map((v) => structuredClone(v)),
    put: async (v) => {
      const id = v.id ?? next++;
      rows.set(id, structuredClone({ ...v, id }));
      return id;
    },
    remove: async (ids) => ids.forEach((id) => rows.delete(id)),
  };
}

const DB = 'trazo-history';
const STORE = 'versions';

function idbBackend(): Backend {
  let opened: Promise<IDBDatabase> | undefined;
  const db = () =>
    (opened ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }).createIndex('ws', 'ws');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void) =>
    db().then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const tx = d.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
          tx.onerror = () => reject(tx.error);
        }),
    );
  return {
    all: (ws) => run<Version[]>('readonly', (s) => s.index('ws').getAll(ws)),
    put: (v) => run<IDBValidKey>('readwrite', (s) => s.put(v)).then(Number),
    remove: (ids) => run<void>('readwrite', (s) => ids.forEach((id) => s.delete(id))),
  };
}

let backend: Backend = typeof indexedDB === 'undefined' ? memoryBackend() : idbBackend();

/** Falls back to memory the first time IndexedDB fails (blocked storage, private mode). */
async function use<T>(fn: (b: Backend) => Promise<T>): Promise<T> {
  try {
    return await fn(backend);
  } catch {
    backend = memoryBackend();
    return fn(backend);
  }
}

/** For tests: start from an empty in-memory store. */
export function resetHistoryForTests() {
  backend = memoryBackend();
}

const listeners = new Set<(ws: string) => void>();
export function onHistoryChange(fn: (ws: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = (ws: string) => listeners.forEach((fn) => fn(ws));

/** Versions of a workspace, newest first. */
export async function listVersions(ws: string): Promise<Version[]> {
  const all = await use((b) => b.all(ws));
  return all.sort((a, b) => b.at - a.at || b.id - a.id);
}

/** Records `sources` as a version when the policy says so; returns it, or undefined if skipped. */
export async function snapshot(
  ws: string,
  sources: WorkspaceSources,
  opts: { reason?: VersionReason; name?: string; force?: boolean; now?: number } = {},
): Promise<Version | undefined> {
  const now = opts.now ?? Date.now();
  const versions = await listVersions(ws);
  const latest = versions[0];
  if (opts.name && latest && same(latest.sources, sources)) {
    // Naming the current state names the version that already holds it.
    const named = { ...latest, name: opts.name, reason: latest.reason };
    await use((b) => b.put(named));
    changed(ws);
    return named;
  }
  if (!shouldSnapshot(latest, sources, now, opts.force || !!opts.name)) return undefined;
  const row = { ws, at: now, sources, ...summarize(sources), reason: opts.reason ?? (opts.name ? 'named' : 'auto'), name: opts.name };
  const id = await use((b) => b.put(row));
  const stale = prunable([{ ...row, id }, ...versions]);
  if (stale.length) await use((b) => b.remove(stale));
  changed(ws);
  return { ...row, id };
}

export async function renameVersion(version: Version, name: string | undefined) {
  await use((b) => b.put({ ...version, name: name?.trim() || undefined }));
  changed(version.ws);
}

export async function deleteHistory(ws: string) {
  const versions = await listVersions(ws);
  await use((b) => b.remove(versions.map((v) => v.id)));
  changed(ws);
}
