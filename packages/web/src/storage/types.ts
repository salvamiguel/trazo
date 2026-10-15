/**
 * The storage layer. The editor always works on a local copy (a workspace in this browser);
 * a library is where architectures live for a team: this browser, or a Git repository on
 * GitHub or GitLab. Opening an architecture copies it into a workspace that remembers where it
 * came from; saving publishes the copy back as a commit or a pull/merge request.
 */
import type { WorkspaceSources } from '@trazo/core';

export type LibraryKind = 'browser' | 'github' | 'gitlab';

/** How a library is reached. Tokens are kept apart from this (see libraries.ts). */
export type LibraryConfig =
  | { id: string; kind: 'browser'; name: string }
  | {
      id: string;
      kind: 'github';
      name: string;
      owner: string;
      repo: string;
      /** Branch to read and publish to; the repository's default branch when empty. */
      branch?: string;
      /** Only architectures under this folder are listed (e.g. `architectures`). */
      root?: string;
      /** API base for GitHub Enterprise Server, e.g. https://github.acme.com/api/v3. */
      api?: string;
    }
  | {
      id: string;
      kind: 'gitlab';
      name: string;
      /** Project path (`group/subgroup/repo`) or numeric id. */
      project: string;
      branch?: string;
      root?: string;
      /** GitLab instance, https://gitlab.com by default. */
      url?: string;
    };

/** What the catalog shows for one architecture, read from the model's `metadata.trazo`. */
export interface ArchitectureMeta {
  title: string;
  description?: string;
  owner?: string;
  domain?: string;
  status?: string;
  tags: string[];
  elements: number;
  views: number;
}

export interface CatalogEntry extends ArchitectureMeta {
  /** Folder of the architecture inside the library (for the browser library, the workspace id). */
  path: string;
  /** File names the model was found under. */
  modelFile: string;
  updated?: number;
}

/** Blob ids of the files an architecture was loaded from, to detect concurrent changes on save. */
export type Version = Record<string, string>;

export interface Loaded {
  sources: WorkspaceSources;
  modelFile: string;
  version: Version;
  /** Commit the files were read at, when the library has one. */
  commit?: string;
}

export interface PublishOptions {
  message: string;
  /** Open a pull/merge request from a new branch instead of committing to the library's branch. */
  review: boolean;
  /** Publish even if the files changed in the library since they were loaded. */
  force?: boolean;
  /** Review branch opened by an earlier publish, to add commits to the same pull/merge request. */
  branch?: string;
}

export type PublishResult =
  | { ok: true; version: Version; url: string; review: boolean; branch?: string }
  | { ok: false; conflict: string[] };

export interface Library {
  config: LibraryConfig;
  /** False when the library can be read but not written (no token, public repository). */
  canWrite: boolean;
  list(): Promise<CatalogEntry[]>;
  load(path: string): Promise<Loaded>;
  publish(path: string, sources: WorkspaceSources, modelFile: string, base: Version | undefined, opts: PublishOptions): Promise<PublishResult>;
  /** Where to see the architecture in the host's UI (repository folder), if any. */
  webUrl(path: string): string | undefined;
}

/** Where a workspace came from; set when an architecture is opened from a Git library. */
export interface Origin {
  library: string;
  path: string;
  modelFile: string;
  version: Version;
  /** URL of the last pull/merge request or commit published from this workspace. */
  published?: string;
  /** Review branch of that pull/merge request; later publishes for review add to it. */
  branch?: string;
}

export class LibraryError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
