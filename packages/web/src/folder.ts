/**
 * Workspaces on disk: `architecture.calm.yaml` (or any `*.calm.yaml|yml|json`) plus
 * `views/*.view.yaml`, the same layout the CLI reads. Uses the File System Access API where
 * the browser has it (Chrome, Edge); elsewhere files can still be imported read-only.
 */
import type { WorkspaceSources } from '@trazo/core';
import { readZip, type ZipEntry } from './zip.ts';

export const MODEL_FILE = 'architecture.calm.yaml';
const MODEL_RE = /\.calm\.(ya?ml|json)$/i;
const VIEW_RE = /^(.+)\.view\.ya?ml$/i;

type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(d: { mode: 'readwrite' }): Promise<PermissionState>;
};

export interface OpenedFolder {
  name: string;
  sources: WorkspaceSources;
  handle?: DirHandle;
  /** Model file name found in the folder, kept so saves go back to the same file. */
  modelFile: string;
}

export const canLinkFolders = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

async function readDir(dir: DirHandle): Promise<{ sources: WorkspaceSources; modelFile: string }> {
  let model: string | undefined;
  let modelFile = MODEL_FILE;
  const views: Record<string, string> = {};
  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && MODEL_RE.test(entry.name) && (model === undefined || entry.name === MODEL_FILE)) {
      model = await (await (entry as FileSystemFileHandle).getFile()).text();
      modelFile = entry.name;
    }
    if (entry.kind === 'directory' && entry.name === 'views') {
      for await (const v of (entry as DirHandle).values()) {
        const m = v.kind === 'file' ? VIEW_RE.exec(v.name) : null;
        if (m) views[m[1]!] = await (await (v as FileSystemFileHandle).getFile()).text();
      }
    }
  }
  if (model === undefined) throw new Error(`No hay ningún fichero *.calm.yaml en «${dir.name}».`);
  return { sources: { model, views }, modelFile };
}

/** Lets the user pick a folder and reads the workspace in it. */
export async function openFolder(): Promise<OpenedFolder | undefined> {
  try {
    const handle = (await (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite' }));
    const { sources, modelFile } = await readDir(handle);
    return { name: handle.name, sources, handle, modelFile };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return undefined;
    throw err;
  }
}

/** Lets the user pick an empty (or any) folder to save a workspace into. */
export async function pickSaveFolder(): Promise<DirHandle | undefined> {
  try {
    return await (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return undefined;
    throw err;
  }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const file = await dir.getFileHandle(name, { create: true });
  const w = await file.createWritable();
  await w.write(text);
  await w.close();
}

/** Writes the model and every view; view files for views that no longer exist are removed. */
export async function writeFolder(dir: DirHandle, sources: WorkspaceSources, modelFile = MODEL_FILE) {
  await writeFile(dir, modelFile, sources.model);
  const viewsDir = await dir.getDirectoryHandle('views', { create: true });
  for (const [id, text] of Object.entries(sources.views)) await writeFile(viewsDir, `${id}.view.yaml`, text);
  for await (const v of (viewsDir as DirHandle).values()) {
    const m = v.kind === 'file' ? VIEW_RE.exec(v.name) : null;
    if (m && !(m[1]! in sources.views)) await viewsDir.removeEntry(v.name);
  }
}

/** Re-asks for write access after a reload; must run inside a click. */
export async function ensurePermission(dir: DirHandle): Promise<boolean> {
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/**
 * A workspace from a flat list of files (paths relative to some root): the model is any
 * `*.calm.yaml`, preferring `architecture.calm.yaml`; views are `*.view.yaml` anywhere.
 */
export function workspaceFromFiles(files: ZipEntry[], fallbackName: string): OpenedFolder {
  let model: string | undefined;
  let modelFile = MODEL_FILE;
  let name = fallbackName;
  const views: Record<string, string> = {};
  for (const { path, text } of files) {
    const base = path.split('/').pop()!;
    if (path.includes('/') && !path.startsWith('views/')) name = path.split('/')[0]!;
    const m = VIEW_RE.exec(base);
    if (m) views[m[1]!] = text;
    else if (MODEL_RE.test(base) && (model === undefined || base === MODEL_FILE)) {
      model = text;
      modelFile = base;
    }
  }
  if (model === undefined) throw new Error('Entre los ficheros elegidos no hay ningún *.calm.yaml.');
  return { name, sources: { model, views }, modelFile };
}

/** The files a workspace is saved as, in the layout the CLI and folders use. */
export function workspaceFiles(sources: WorkspaceSources, modelFile = MODEL_FILE): ZipEntry[] {
  return [
    { path: modelFile, text: sources.model },
    ...Object.keys(sources.views)
      .sort()
      .map((id) => ({ path: `views/${id}.view.yaml`, text: sources.views[id]! })),
  ];
}

/** Reads a workspace from files chosen with an <input type="file">: YAML files, a folder or a .zip. */
export async function readPickedFiles(files: FileList): Promise<OpenedFolder> {
  const list = Array.from(files);
  const zip = list.find((f) => /\.zip$/i.test(f.name));
  if (zip) return workspaceFromFiles(await readZip(await zip.arrayBuffer()), zip.name.replace(/(\.trazo)?\.zip$/i, ''));
  const entries = await Promise.all(
    list.map(async (f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, text: await f.text() })),
  );
  return workspaceFromFiles(entries, 'Importado');
}

// ---- Remember folder links across reloads (IndexedDB can store directory handles) -----------

const DB = 'trazo';
const STORE = 'folders';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function rememberFolder(workspaceId: string, link: { handle: DirHandle; modelFile: string } | undefined) {
  try {
    const d = await db();
    const tx = d.transaction(STORE, 'readwrite');
    if (link) tx.objectStore(STORE).put(link, workspaceId);
    else tx.objectStore(STORE).delete(workspaceId);
  } catch {
    /* not available here: the link lasts until the page reloads */
  }
}

export async function recallFolder(workspaceId: string): Promise<{ handle: DirHandle; modelFile: string } | undefined> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction(STORE).objectStore(STORE).get(workspaceId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

export type { DirHandle };
