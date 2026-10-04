/**
 * Workspaces kept in this browser. Each one is a CALM model plus its views; a workspace
 * linked to a folder on disk also writes there (see folder.ts).
 */
import type { WorkspaceSources } from '@trazo/core';
import { EXAMPLE, EXAMPLE_NAME } from './example.ts';

export interface WorkspaceMeta {
  id: string;
  name: string;
  updated: number;
  /** Name of the linked folder, when the workspace lives on disk. */
  folder?: string;
}

const INDEX = 'trazo.workspaces.v2';
const ACTIVE = 'trazo.active';
const LEGACY = 'trazo.workspace.v1';
const key = (id: string) => `trazo.ws.${id}`;

function read<T>(k: string): T | undefined {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(k: string, value: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(value));
  } catch {
    /* private mode or full storage: keeping it in memory is the best we can do */
  }
}

function remove(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

const newId = () => Math.random().toString(36).slice(2, 10);

/** Workspaces, most recently edited first. The first run seeds the example. */
export function listWorkspaces(): WorkspaceMeta[] {
  let index = read<WorkspaceMeta[]>(INDEX);
  if (!index) {
    const meta = { id: newId(), name: EXAMPLE_NAME, updated: Date.now() };
    write(key(meta.id), read<WorkspaceSources>(LEGACY) ?? EXAMPLE);
    index = [meta];
    write(INDEX, index);
  }
  return [...index].sort((a, b) => b.updated - a.updated);
}

export function loadSources(id: string): WorkspaceSources | undefined {
  return read<WorkspaceSources>(key(id));
}

export function saveSources(id: string, sources: WorkspaceSources) {
  write(key(id), sources);
  touch(id, {});
}

export function touch(id: string, patch: Partial<WorkspaceMeta>) {
  const index = read<WorkspaceMeta[]>(INDEX) ?? [];
  write(INDEX, index.map((m) => (m.id === id ? { ...m, ...patch, updated: Date.now() } : m)));
}

export function createWorkspace(name: string, sources: WorkspaceSources, folder?: string): WorkspaceMeta {
  const meta: WorkspaceMeta = { id: newId(), name, updated: Date.now(), ...(folder ? { folder } : {}) };
  write(key(meta.id), sources);
  write(INDEX, [...(read<WorkspaceMeta[]>(INDEX) ?? []), meta]);
  return meta;
}

export function deleteWorkspace(id: string) {
  remove(key(id));
  write(INDEX, (read<WorkspaceMeta[]>(INDEX) ?? []).filter((m) => m.id !== id));
}

export function activeWorkspace(): string | undefined {
  return read<string>(ACTIVE);
}

export function setActiveWorkspace(id: string) {
  write(ACTIVE, id);
}
