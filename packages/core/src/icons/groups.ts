import type { Element, GroupStyle } from '../model/types.ts';
import { getIcon } from './registry.ts';

/**
 * Header icon per group style, following the AWS architecture group conventions
 * (availability zones and generic groups have none). `metadata.trazo.icon` overrides it.
 */
const GROUP_ICONS: Partial<Record<GroupStyle, string>> = {
  'aws-cloud': 'tabler:brand-aws',
  'aws-account': 'tabler:user-square',
  'aws-region': 'tabler:flag',
  'aws-vpc': 'tabler:cloud-lock',
  'aws-subnet-public': 'tabler:lock-open',
  'aws-subnet-private': 'tabler:lock',
  'aws-security-group': 'tabler:shield-lock',
  'k8s-cluster': 'logos:kubernetes',
};

export const GROUP_BADGE = { size: 22, inset: 8, gap: 8 };

export function groupIconFor(el: Element): string | undefined {
  return el.icon ?? (el.groupStyle ? GROUP_ICONS[el.groupStyle] : undefined);
}

/** Horizontal room the badge takes before the group title. */
export function groupBadgeSpace(el: Element): number {
  return groupIconFor(el) ? GROUP_BADGE.size + GROUP_BADGE.gap : 0;
}

/**
 * Standalone SVG for a group header badge: monochrome icons are drawn white on a square
 * in the group colour (as AWS does); full-colour logos are drawn as they are.
 */
export function groupBadgeSvg(el: Element, color: string): string | null {
  const icon = getIcon(groupIconFor(el));
  if (!icon) return null;
  const s = GROUP_BADGE.size;
  if (!icon.mono) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><svg width="${s}" height="${s}" viewBox="${icon.viewBox}">${icon.body}</svg></svg>`;
  }
  const pad = 3;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    `<rect width="${s}" height="${s}" rx="3" fill="${color}"/>` +
    `<svg x="${pad}" y="${pad}" width="${s - pad * 2}" height="${s - pad * 2}" viewBox="${icon.viewBox}" color="${isLight(color) ? '#1b1f24' : '#ffffff'}">${icon.body}</svg></svg>`
  );
}

/** Relative luminance check so the glyph stays legible on light badge colours (dark theme). */
function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.45;
}
