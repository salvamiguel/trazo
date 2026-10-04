import { getIconData, iconToSVG, iconToHTML, replaceIDs } from '@iconify/utils';
import type { IconifyJSON } from '@iconify/types';

import core from '../../icons/core.json' with { type: 'json' };
import { resolveIconId } from './refs.ts';

export { resolveIconId };

/**
 * Icon sets by prefix. Every set starts as the small always-loaded subset from `icons/core.json`
 * (fallback glyphs and the library's curated icons); `loadIconSets` swaps in the full set when a
 * diagram or search needs it. Full sets are separate chunks in the web build.
 */
const LOADERS: Record<string, () => Promise<IconifyJSON>> = {
  aws: () => import('../../icons/aws.json', { with: { type: 'json' } }).then((m) => m.default as IconifyJSON),
  azure: () => import('../../icons/azure.json', { with: { type: 'json' } }).then((m) => m.default as IconifyJSON),
  k8s: () => import('../../icons/k8s.json', { with: { type: 'json' } }).then((m) => m.default as IconifyJSON),
  cncf: () => import('../../icons/cncf.json', { with: { type: 'json' } }).then((m) => m.default as unknown as IconifyJSON),
  logos: () => import('@iconify-json/logos/icons.json', { with: { type: 'json' } }).then((m) => m.default as IconifyJSON),
  tabler: () => import('@iconify-json/tabler/icons.json', { with: { type: 'json' } }).then((m) => m.default as IconifyJSON),
};

export const ICON_PREFIXES = Object.keys(LOADERS);

const sets: Record<string, IconifyJSON> = {};
for (const set of core as unknown as IconifyJSON[]) sets[set.prefix] = set;
const full = new Set<string>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** Monochrome fallback per CALM node-type when an element has no icon. */
const NODE_TYPE_ICONS: Record<string, string> = {
  actor: 'tabler:user',
  system: 'tabler:box',
  ecosystem: 'tabler:world',
  service: 'tabler:server',
  database: 'tabler:database',
  network: 'tabler:network',
  ldap: 'tabler:address-book',
  webclient: 'tabler:browser',
  'data-asset': 'tabler:file',
};

export function iconFor(icon: string | undefined, nodeType: string): string | undefined {
  return icon ?? NODE_TYPE_ICONS[nodeType];
}

/** Colour used for monochrome (currentColor) icons in exports without CSS. */
const MONO_COLOR = '#4a5361';

export interface IconSvg {
  /** True when the icon draws with currentColor and takes the theme's text colour. */
  mono: boolean;
  /** Complete standalone SVG document. */
  svg: string;
  /** Inner markup and viewBox for nesting inside another SVG. */
  body: string;
  viewBox: string;
}

const cache = new Map<string, IconSvg>();

function lookup(id: string) {
  const [prefix, name] = id.split(':');
  const set = prefix ? sets[prefix] : undefined;
  return set && name ? getIconData(set, name) : null;
}

/** Draws a reference with whatever sets are loaded; null when it is unknown or not loaded yet. */
export function getIcon(ref: string | undefined): IconSvg | null {
  if (!ref) return null;
  const id = resolveIconId(ref);
  const hit = cache.get(id);
  if (hit) return hit;
  const data = lookup(id);
  if (!data) return null;
  const rendered = iconToSVG(data, { height: 'auto' });
  // Unique ids so several icons can live in one SVG without gradient clashes.
  const body = replaceIDs(rendered.body);
  const viewBox = rendered.attributes.viewBox;
  const mono = body.includes('currentColor');
  const standalone = iconToHTML(mono ? body.replaceAll('currentColor', MONO_COLOR) : body, { ...rendered.attributes, xmlns: 'http://www.w3.org/2000/svg' });
  const icon = { mono, svg: standalone, body, viewBox };
  cache.set(id, icon);
  return icon;
}

/** Full sets still to load for these references to draw (empty when all are ready). */
export function missingIconSets(refs: Iterable<string | undefined>): string[] {
  const missing = new Set<string>();
  for (const ref of refs) {
    if (!ref) continue;
    const id = resolveIconId(ref);
    const prefix = id.split(':')[0]!;
    if (!full.has(prefix) && LOADERS[prefix] && !lookup(id)) missing.add(prefix);
  }
  return [...missing];
}

/** Loads full icon sets (all of them by default). Resolves once every one is ready. */
export async function loadIconSets(prefixes: Iterable<string> = ICON_PREFIXES): Promise<void> {
  await Promise.all(
    [...prefixes].map((prefix) => {
      if (full.has(prefix) || !LOADERS[prefix]) return undefined;
      let p = pending.get(prefix);
      if (!p) {
        p = LOADERS[prefix]!().then((set) => {
          sets[prefix] = set;
          full.add(prefix);
          pending.delete(prefix);
          for (const fn of listeners) fn();
        });
        pending.set(prefix, p);
      }
      return p;
    }),
  );
}

export function isIconSetLoaded(prefix: string): boolean {
  return full.has(prefix);
}

/** Called whenever a full set finishes loading, so views can redraw icons that were missing. */
export function onIconSetsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Adds or replaces a set at runtime (custom packs). */
export function registerIconSet(set: IconifyJSON) {
  sets[set.prefix] = set;
  full.add(set.prefix);
  for (const id of [...cache.keys()]) if (id.startsWith(`${set.prefix}:`)) cache.delete(id);
  for (const fn of listeners) fn();
}

/** Every icon id currently loaded (`prefix:name`). Search uses the index instead, see `iconIndex`. */
export function iconIds(): string[] {
  return Object.entries(sets).flatMap(([prefix, set]) =>
    [...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})].map((name) => `${prefix}:${name}`),
  );
}

/** Search metadata for every set, without the drawings: titles and categories per icon. */
export interface IconIndex {
  [prefix: string]: { title: string; license: string; icons: Record<string, [title: string, category: string]>; aliases: Record<string, string> };
}

let index: Promise<IconIndex> | undefined;
export function iconIndex(): Promise<IconIndex> {
  index ??= import('../../icons/index.json', { with: { type: 'json' } }).then((m) => m.default as unknown as IconIndex);
  return index;
}
