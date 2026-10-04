import { createRequire } from 'node:module';
import { getIconData, iconToSVG, iconToHTML, replaceIDs } from '@iconify/utils';
import type { IconifyJSON } from '@iconify/types';

const require = createRequire(import.meta.url);
const sets: Record<string, IconifyJSON> = {
  logos: require('@iconify-json/logos/icons.json') as IconifyJSON,
  tabler: require('@iconify-json/tabler/icons.json') as IconifyJSON,
};

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

/**
 * Short Trazo icon ids -> Iconify ids. The spike uses the Iconify "logos" set;
 * the official AWS/Azure architecture packages replace it in phase 1.
 */
const ALIASES: Record<string, string> = {
  'aws/aws': 'logos:aws',
  'k8s/kubernetes': 'logos:kubernetes',
  'cncf/helm': 'logos:helm',
  'cncf/argocd': 'logos:argo-icon',
  'hashicorp/terraform': 'logos:terraform-icon',
  'ai/openai': 'logos:openai-icon',
  'ai/anthropic': 'logos:anthropic-icon',
  'azure/azure': 'logos:microsoft-azure',
};

export function resolveIconId(ref: string): string {
  if (ALIASES[ref]) return ALIASES[ref];
  if (ref.includes(':')) return ref;
  const [provider, name] = ref.split('/');
  if (provider === 'aws' && name) return `logos:aws-${name}`;
  return `logos:${name ?? provider}`;
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

const cache = new Map<string, IconSvg | null>();

export function getIcon(ref: string | undefined): IconSvg | null {
  if (!ref) return null;
  const id = resolveIconId(ref);
  if (cache.has(id)) return cache.get(id)!;
  const [prefix, name] = id.split(':');
  const set = prefix ? sets[prefix] : undefined;
  const data = set && name ? getIconData(set, name) : null;
  if (!data) {
    cache.set(id, null);
    return null;
  }
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
