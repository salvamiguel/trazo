import type { Model } from '../model/types.ts';
import type { Layout, PlacedNode, Point } from '../layout/types.ts';
import { getIcon, iconFor } from '../icons/registry.ts';
import { GROUP_BADGE, groupBadgeSvg } from '../icons/groups.ts';
import type { GroupStyle } from '../model/types.ts';
import { THEMES } from '../render/theme.ts';

/**
 * draw.io's own AWS group shapes (Arrange > AWS 2021 "Groups"), so exported groups stay
 * native and editable. Styles without a native icon get an image badge cell instead.
 */
const NATIVE_AWS_GROUPS: Partial<Record<GroupStyle, Record<string, string | number>>> = {
  'aws-cloud': { grIcon: 'mxgraph.aws4.group_aws_cloud_alt' },
  'aws-account': { grIcon: 'mxgraph.aws4.group_account' },
  'aws-region': { grIcon: 'mxgraph.aws4.group_region' },
  'aws-vpc': { grIcon: 'mxgraph.aws4.group_vpc2' },
  'aws-subnet-public': { grIcon: 'mxgraph.aws4.group_security_group', grStroke: 0 },
  'aws-subnet-private': { grIcon: 'mxgraph.aws4.group_security_group', grStroke: 0 },
};

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const htmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r = (n: number) => Math.round(n * 10) / 10;

/** draw.io style strings use `;` as separator, so data URIs go base64 without the `;base64` token. */
function imageDataUri(svg: string): string {
  return `data:image/svg+xml,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function style(entries: Record<string, string | number | undefined>): string {
  return Object.entries(entries)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(';') + ';';
}

/** Relative position (0..1) of a point on a node border, used for exit/entry constraints. */
function anchor(p: Point, n: PlacedNode) {
  const fx = Math.min(1, Math.max(0, (p.x - n.x) / n.width));
  const fy = Math.min(1, Math.max(0, (p.y - n.y) / n.height));
  return { x: Math.round(fx * 1000) / 1000, y: Math.round(fy * 1000) / 1000 };
}

/**
 * Exports a laid-out view as an uncompressed `.drawio` file. Geometry and edge waypoints come
 * from Trazo's layout, so the file opens identical to the SVG and stays editable in draw.io.
 */
export function exportDrawio(layout: Layout, model: Model, name = 'Trazo'): string {
  const theme = THEMES.light;
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const cellId = (id: string) => `t-${id}`;
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];

  // Parents must precede children in draw.io files.
  const ordered = [...layout.nodes].sort((a, b) => a.depth - b.depth);
  for (const n of ordered) {
    const el = model.elements.get(n.id)!;
    const parent = n.parent ? byId.get(n.parent) : undefined;
    const x = parent ? n.x - parent.x : n.x;
    const y = parent ? n.y - parent.y : n.y;
    const parentCell = parent ? cellId(parent.id) : '1';
    let value: string;
    let st: string;
    let badge: string | null = null;
    if (n.isGroup) {
      const g = theme.groups[el.groupStyle ?? 'generic'];
      const native = !el.icon && el.groupStyle ? NATIVE_AWS_GROUPS[el.groupStyle] : undefined;
      badge = native ? null : groupBadgeSvg(el, g.stroke);
      const hasIcon = Boolean(native || badge);
      value = htmlEsc(el.name);
      st = style({
        ...(native ? { shape: 'mxgraph.aws4.group', grIconSize: 22, ...native } : { rounded: 1, arcSize: 2, absoluteArcSize: 1 }),
        whiteSpace: 'wrap', html: 1, container: 1, collapsible: 0, recursiveResize: 0, pointerEvents: 0,
        fillColor: g.fill === 'none' ? 'none' : g.fill, strokeColor: g.stroke, fontColor: g.text, dashed: g.dashed ? 1 : 0,
        verticalAlign: 'top', align: 'left', spacingLeft: hasIcon ? 34 : 10, spacingTop: 4, fontStyle: 1, fontSize: 12,
      });
    } else {
      const icon = getIcon(iconFor(el.icon, el.nodeType));
      value = `<b>${htmlEsc(el.name)}</b>${el.technology ? `<br><font style="font-size:10px;color:#5b6472">[${htmlEsc(el.technology)}]</font>` : ''}`;
      st = icon
        ? style({ shape: 'image', html: 1, verticalLabelPosition: 'bottom', verticalAlign: 'top', labelBackgroundColor: 'none', imageAspect: 1, aspect: 'fixed', fontSize: 12, image: imageDataUri(icon.svg) })
        : style({ rounded: 1, html: 1, whiteSpace: 'wrap', verticalLabelPosition: 'bottom', verticalAlign: 'top', fillColor: '#ffffff', strokeColor: '#c9ced6', fontSize: 12 });
    }
    cells.push(
      `<mxCell id="${xmlEsc(cellId(n.id))}" value="${xmlEsc(value)}" style="${xmlEsc(st)}" vertex="1" parent="${xmlEsc(parentCell)}">` +
        `<mxGeometry x="${r(x)}" y="${r(y)}" width="${r(n.width)}" height="${r(n.height)}" as="geometry"/></mxCell>`,
    );
    if (badge) {
      // Badge as a locked child image in the group's top-left corner.
      const bst = style({ shape: 'image', image: imageDataUri(badge), imageAspect: 1, aspect: 'fixed', movable: 0, resizable: 0, rotatable: 0, deletable: 0, editable: 0, connectable: 0 });
      cells.push(
        `<mxCell id="${xmlEsc(cellId(n.id))}-badge" value="" style="${xmlEsc(bst)}" vertex="1" parent="${xmlEsc(cellId(n.id))}">` +
          `<mxGeometry x="${GROUP_BADGE.inset}" y="${GROUP_BADGE.inset}" width="${GROUP_BADGE.size}" height="${GROUP_BADGE.size}" as="geometry"/></mxCell>`,
      );
    }
  }

  for (const e of layout.edges) {
    const src = byId.get(e.source)!, tgt = byId.get(e.target)!;
    const start = e.points[0]!, end = e.points[e.points.length - 1]!;
    const exit = anchor(start, src), entry = anchor(end, tgt);
    const label = e.label ? e.label.lines.map((l) => l.text).join(' ') : '';
    const st = style({
      edgeStyle: 'orthogonalEdgeStyle', rounded: 1, orthogonalLoop: 1, jettySize: 'auto', html: 1,
      endArrow: 'block', endFill: 1, strokeColor: theme.edge, strokeWidth: 1.5, fontSize: 11, fontColor: theme.textMuted,
      labelBackgroundColor: '#ffffff',
      exitX: exit.x, exitY: exit.y, exitDx: 0, exitDy: 0, exitPerimeter: 0,
      entryX: entry.x, entryY: entry.y, entryDx: 0, entryDy: 0, entryPerimeter: 0,
    });
    const waypoints = e.points.slice(1, -1).map((p) => `<mxPoint x="${r(p.x)}" y="${r(p.y)}"/>`).join('');
    cells.push(
      `<mxCell id="${xmlEsc(cellId(e.id))}" value="${xmlEsc(htmlEsc(label))}" style="${xmlEsc(st)}" edge="1" parent="1" source="${xmlEsc(cellId(e.source))}" target="${xmlEsc(cellId(e.target))}">` +
        `<mxGeometry relative="1" as="geometry">${waypoints ? `<Array as="points">${waypoints}</Array>` : ''}</mxGeometry></mxCell>`,
    );
  }

  const w = Math.ceil(layout.width), h = Math.ceil(layout.height);
  return [
    '<mxfile host="trazo" type="device">',
    `<diagram id="${xmlEsc(name)}" name="${xmlEsc(name)}">`,
    `<mxGraphModel dx="${w}" dy="${h}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${w}" pageHeight="${h}" math="0" shadow="0">`,
    '<root>',
    ...cells,
    '</root>',
    '</mxGraphModel>',
    '</diagram>',
    '</mxfile>',
    '',
  ].join('\n');
}
