import type { Model } from '../model/types.ts';
import type { Layout, PlacedLabel, PlacedNode, Point } from '../layout/types.ts';
import { FONT } from '../layout/text.ts';
import { getIcon, iconFor } from '../icons/registry.ts';
import { GROUP_BADGE, groupBadgeSpace, groupBadgeSvg } from '../icons/groups.ts';
import { THEMES, type Theme, type ThemeName } from './theme.ts';

export interface SvgOptions {
  theme?: ThemeName;
  title?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r = (n: number) => Math.round(n * 10) / 10;

/** Orthogonal path with rounded corners, so bends read as intentional. */
function roundedPath(points: Point[], radius = 6): string {
  if (points.length < 2) return '';
  let d = `M${r(points[0]!.x)},${r(points[0]!.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!, cur = points[i]!, next = points[i + 1]!;
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const rad = Math.min(radius, inLen / 2, outLen / 2);
    const p1 = { x: cur.x - ((cur.x - prev.x) / inLen) * rad, y: cur.y - ((cur.y - prev.y) / inLen) * rad };
    const p2 = { x: cur.x + ((next.x - cur.x) / outLen) * rad, y: cur.y + ((next.y - cur.y) / outLen) * rad };
    d += ` L${r(p1.x)},${r(p1.y)} Q${r(cur.x)},${r(cur.y)} ${r(p2.x)},${r(p2.y)}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L${r(last.x)},${r(last.y)}`;
}

function labelText(label: PlacedLabel, theme: Theme, align: 'middle' | 'start', color?: string): string {
  let y = label.y + 2;
  const x = align === 'middle' ? label.x + label.width / 2 : label.x + 4;
  return label.lines
    .map((line) => {
      const size = line.kind === 'name' ? FONT.name : line.kind === 'group' ? FONT.group : line.kind === 'tech' ? FONT.tech : FONT.edge;
      y += size * FONT.lineHeight;
      const weight = line.kind === 'name' || line.kind === 'group' ? 600 : 400;
      const fill = color ?? (line.kind === 'tech' || line.kind === 'edge' ? theme.textMuted : theme.text);
      return `<text x="${r(x)}" y="${r(y - size * 0.3)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${align}">${esc(line.text)}</text>`;
    })
    .join('');
}

function iconMarkup(node: PlacedNode, model: Model, theme: Theme): string {
  const el = model.elements.get(node.id)!;
  const icon = getIcon(iconFor(el.icon, el.nodeType));
  const plate = `<rect x="${r(node.x)}" y="${r(node.y)}" width="${node.width}" height="${node.height}" rx="12" fill="${theme.iconPlate}" stroke="${theme.iconPlateStroke}"/>`;
  if (!icon) {
    const initials = el.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
    return `${plate}<text x="${r(node.x + node.width / 2)}" y="${r(node.y + node.height / 2 + 5)}" font-size="15" font-weight="700" fill="#5b6472" text-anchor="middle">${esc(initials)}</text>`;
  }
  const pad = 9;
  return `${plate}<svg x="${r(node.x + pad)}" y="${r(node.y + pad)}" width="${node.width - pad * 2}" height="${node.height - pad * 2}" viewBox="${icon.viewBox}"${icon.mono ? ` color="${theme.iconMono}"` : ''}>${icon.body}</svg>`;
}

export function renderSvg(layout: Layout, model: Model, options: SvgOptions = {}): string {
  const theme = THEMES[options.theme ?? 'light'];
  const out: string[] = [];
  const w = Math.ceil(layout.width), h = Math.ceil(layout.height);
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${esc(FONT.family)}">`,
  );
  if (options.title) out.push(`<title>${esc(options.title)}</title>`);
  out.push(
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${theme.edge}"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="${theme.background}"/>`,
  );

  const groups = layout.nodes.filter((n) => n.isGroup).sort((a, b) => a.depth - b.depth);
  for (const g of groups) {
    const el = model.elements.get(g.id)!;
    const tokens = theme.groups[el.groupStyle ?? 'generic'];
    const badge = groupBadgeSvg(el, tokens.stroke, options.theme === 'dark');
    const badgeMarkup = badge
      ? badge.replace('<svg ', `<svg x="${r(g.x + GROUP_BADGE.inset)}" y="${r(g.y + GROUP_BADGE.inset)}" `)
      : '';
    out.push(
      `<g data-id="${esc(g.id)}"><rect x="${r(g.x)}" y="${r(g.y)}" width="${r(g.width)}" height="${r(g.height)}" rx="6" fill="${tokens.fill}" stroke="${tokens.stroke}" stroke-width="1.5"${tokens.dashed ? ' stroke-dasharray="6 4"' : ''}/>`,
      badgeMarkup,
      labelText({ ...g.label, x: g.x + 12 + groupBadgeSpace(el) - (badge ? 8 : 0), y: g.y + 8 }, theme, 'start', tokens.text),
      '</g>',
    );
  }

  for (const e of layout.edges) {
    out.push(`<path data-id="${esc(e.id)}" d="${roundedPath(e.points)}" fill="none" stroke="${theme.edge}" stroke-width="1.5" marker-end="url(#arrow)"/>`);
  }
  for (const e of layout.edges) {
    if (!e.label) continue;
    const l = e.label;
    out.push(
      `<g data-label="${esc(e.id)}"><rect x="${r(l.x)}" y="${r(l.y)}" width="${r(l.width)}" height="${r(l.height)}" rx="3" fill="${theme.edgeLabelBg}" opacity="0.92"/>`,
      labelText(l, theme, 'middle'),
      '</g>',
    );
  }

  for (const n of layout.nodes.filter((n) => !n.isGroup)) {
    out.push(`<g data-id="${esc(n.id)}">${iconMarkup(n, model, theme)}${labelText(n.label, theme, 'middle')}</g>`);
  }
  out.push('</svg>');
  return out.join('\n');
}
