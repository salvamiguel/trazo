import type { Box, Layout, Point } from './types.ts';

export interface QualityMetrics {
  nodes: number;
  edges: number;
  /** Proper crossings between segments of different edges. */
  crossings: number;
  /** Total bends over all edges. */
  bends: number;
  maxBendsPerEdge: number;
  /** Label boxes (node or edge) overlapping another label or an icon. */
  labelOverlaps: number;
  /** Edge segments passing through an icon that is not one of its endpoints. */
  edgesThroughNodes: number;
  /** Edges whose end does not touch the border of its target icon. */
  misalignedEndpoints: number;
}

type Segment = [Point, Point];

function segments(points: Point[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) out.push([points[i]!, points[i + 1]!]);
  return out;
}

/** Orthogonal segments only: strict interior crossing. */
function crosses([a, b]: Segment, [c, d]: Segment): boolean {
  const h1 = a.y === b.y, h2 = c.y === d.y;
  if (h1 === h2) return false;
  const [h, v] = h1 ? [[a, b], [c, d]] : [[c, d], [a, b]];
  const hx1 = Math.min(h[0]!.x, h[1]!.x), hx2 = Math.max(h[0]!.x, h[1]!.x);
  const vy1 = Math.min(v[0]!.y, v[1]!.y), vy2 = Math.max(v[0]!.y, v[1]!.y);
  const x = v[0]!.x, y = h[0]!.y;
  return x > hx1 && x < hx2 && y > vy1 && y < vy2;
}

function overlap(a: Box, b: Box, margin = 0): boolean {
  return a.x < b.x + b.width - margin && b.x < a.x + a.width - margin && a.y < b.y + b.height - margin && b.y < a.y + a.height - margin;
}

function segmentHitsBox([a, b]: Segment, box: Box, inset = 2): boolean {
  const x1 = box.x + inset, x2 = box.x + box.width - inset, y1 = box.y + inset, y2 = box.y + box.height - inset;
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  return maxX > x1 && minX < x2 && maxY > y1 && minY < y2;
}

export function measureLayout(layout: Layout): QualityMetrics {
  const icons = layout.nodes.filter((n) => !n.isGroup);
  const labels: Box[] = [
    ...layout.nodes.filter((n) => n.label.lines.length && !n.isGroup).map((n) => n.label),
    ...layout.edges.flatMap((e) => (e.label ? [e.label] : [])),
  ];

  let crossings = 0;
  const segs = layout.edges.map((e) => segments(e.points));
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++)
      for (const s1 of segs[i]!) for (const s2 of segs[j]!) if (crosses(s1, s2)) crossings++;

  const bendsPer = layout.edges.map((e) => Math.max(0, e.points.length - 2));

  let labelOverlaps = 0;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) if (overlap(labels[i]!, labels[j]!, 1)) labelOverlaps++;
    for (const icon of icons) if (overlap(labels[i]!, icon, 1)) labelOverlaps++;
  }

  let edgesThroughNodes = 0;
  let misalignedEndpoints = 0;
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  for (const e of layout.edges) {
    for (const icon of icons) {
      if (icon.id === e.source || icon.id === e.target) continue;
      if (segments(e.points).some((s) => segmentHitsBox(s, icon))) edgesThroughNodes++;
    }
    const target = byId.get(e.target);
    const end = e.points[e.points.length - 1]!;
    if (target && !target.isGroup) {
      const onX = Math.abs(end.x - target.x) <= 1.5 || Math.abs(end.x - (target.x + target.width)) <= 1.5;
      const onY = Math.abs(end.y - target.y) <= 1.5 || Math.abs(end.y - (target.y + target.height)) <= 1.5;
      const insideX = end.x >= target.x - 1.5 && end.x <= target.x + target.width + 1.5;
      const insideY = end.y >= target.y - 1.5 && end.y <= target.y + target.height + 1.5;
      if (!((onX && insideY) || (onY && insideX))) misalignedEndpoints++;
    }
  }

  return {
    nodes: icons.length,
    edges: layout.edges.length,
    crossings,
    bends: bendsPer.reduce((a, b) => a + b, 0),
    maxBendsPerEdge: Math.max(0, ...bendsPer),
    labelOverlaps,
    edgesThroughNodes,
    misalignedEndpoints,
  };
}
