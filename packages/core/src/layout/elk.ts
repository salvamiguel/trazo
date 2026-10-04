import { createRequire } from 'node:module';
import type { ELK as ElkInstance, ELKConstructorArguments, ElkExtendedEdge, ElkNode, ElkLabel } from 'elkjs/lib/elk-api.js';
import type { ViewGraph } from '../model/view.ts';
import type { Direction, Element } from '../model/types.ts';
import { FONT, textWidth, wrap } from './text.ts';
import type { Layout, LabelLine, PlacedEdge, PlacedLabel, PlacedNode, Point } from './types.ts';
import { simplifyPolyline } from './polyline.ts';
import { presetRules } from './presets.ts';
import { groupBadgeSpace } from '../icons/groups.ts';
import type { Model } from '../model/types.ts';

// elkjs ships CommonJS; load it explicitly so ESM and the typings agree.
const ELK = createRequire(import.meta.url)('elkjs/lib/elk.bundled.js') as new (args?: ELKConstructorArguments) => ElkInstance;

export const ICON_SIZE = 56;
const LABEL_MAX_WIDTH = 150;
const GROUP_PADDING = { top: 40, left: 20, bottom: 20, right: 20 };
const OVERLAY_PADDING = { top: 34, side: 14 };

const ELK_DIRECTION: Record<Direction, string> = { right: 'RIGHT', down: 'DOWN', left: 'LEFT', up: 'UP' };
const SIDES: Record<Direction, { out: string; in: string }> = {
  right: { out: 'EAST', in: 'WEST' },
  left: { out: 'WEST', in: 'EAST' },
  down: { out: 'SOUTH', in: 'NORTH' },
  up: { out: 'NORTH', in: 'SOUTH' },
};

function nodeLabelLines(e: Element): LabelLine[] {
  const lines: LabelLine[] = wrap(e.name, FONT.name, LABEL_MAX_WIDTH, true).map((text) => ({ text, kind: 'name' as const }));
  if (e.technology) {
    for (const text of wrap(`[${e.technology}]`, FONT.tech, LABEL_MAX_WIDTH)) lines.push({ text, kind: 'tech' });
  }
  return lines;
}

function measure(lines: LabelLine[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const line of lines) {
    const size = line.kind === 'name' ? FONT.name : line.kind === 'group' ? FONT.group : line.kind === 'tech' ? FONT.tech : FONT.edge;
    width = Math.max(width, textWidth(line.text, size, line.kind === 'name' || line.kind === 'group'));
    height += Math.ceil(size * FONT.lineHeight);
  }
  return { width: width + 8, height: height + 4 };
}

function edgeLabelLines(text: string): LabelLine[] {
  return wrap(text, FONT.edge, 130).map((t) => ({ text: t, kind: 'edge' as const }));
}

export interface LayoutOptions {
  direction?: Direction;
  preset?: string;
  /** Needed for preset rules that look at element metadata. */
  model?: Model;
}

/**
 * Lays out a view with ELK layered: nested groups (INCLUDE_CHILDREN), orthogonal routing,
 * labels reserved as part of the layout, and edges attached to ports on the icon itself
 * (never to the icon+label box), so arrows always hit the icon on the expected side.
 */
export async function layoutView(graph: ViewGraph, options: LayoutOptions = {}): Promise<Layout> {
  const direction = options.direction ?? 'right';
  const sides = SIDES[direction];
  const elk = new ELK();

  const labelLines = new Map<string, LabelLine[]>();
  const elkNodes = new Map<string, ElkNode>();

  for (const e of graph.elements) {
    const isGroup = graph.groups.has(e.id);
    const lines: LabelLine[] = isGroup ? [{ text: e.name, kind: 'group' }] : nodeLabelLines(e);
    labelLines.set(e.id, lines);
    const size = measure(lines);
    // Group titles share the header with an optional badge; reserve its width too.
    if (isGroup) size.width += groupBadgeSpace(e);
    const label: ElkLabel = { id: `${e.id}__label`, text: lines.map((l) => l.text).join('\n'), ...size };
    const node: ElkNode = isGroup
      ? {
          id: e.id,
          labels: [label],
          children: [],
          edges: [],
          layoutOptions: {
            'elk.nodeLabels.placement': 'INSIDE V_TOP H_LEFT',
            'elk.padding': `[top=${GROUP_PADDING.top},left=${GROUP_PADDING.left},bottom=${GROUP_PADDING.bottom},right=${GROUP_PADDING.right}]`,
            'elk.nodeSize.constraints': 'NODE_LABELS MINIMUM_SIZE',
            'elk.nodeSize.minimum': `(${size.width + GROUP_PADDING.left * 2}, 80)`,
          },
        }
      : {
          id: e.id,
          width: ICON_SIZE,
          height: ICON_SIZE,
          labels: [label],
          ports: [],
          layoutOptions: {
            'elk.nodeLabels.placement': 'OUTSIDE V_BOTTOM H_CENTER',
            'elk.portConstraints': 'FIXED_SIDE',
            'elk.portAlignment.default': 'CENTER',
            'elk.spacing.portPort': '10',
          },
        };
    elkNodes.set(e.id, node);
  }

  const root: ElkNode = {
    id: '__root',
    children: [],
    edges: [],
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIRECTION[direction],
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.json.shapeCoords': 'ROOT',
      'elk.json.edgeCoords': 'ROOT',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.spacing.nodeNode': '44',
      'elk.spacing.edgeNode': '22',
      'elk.spacing.edgeEdge': '14',
      'elk.spacing.edgeLabel': '6',
      'elk.spacing.labelNode': '8',
      'elk.spacing.componentComponent': '48',
      'elk.edgeLabels.placement': 'CENTER',
      'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
      'elk.layered.mergeEdges': 'false',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
  };

  const rules = options.model ? presetRules(options.preset, graph, options.model) : { overlays: new Set<string>() };
  // Overlay groups are skipped by ELK: their children attach to the closest non-overlay ancestor.
  const elkParent = (id: string): string | undefined => {
    let p = graph.parent.get(id);
    while (p && rules.overlays.has(p)) p = graph.parent.get(p);
    return p;
  };

  for (const e of graph.elements) {
    if (rules.overlays.has(e.id)) continue;
    const parentId = elkParent(e.id);
    const container = parentId ? elkNodes.get(parentId)! : root;
    container.children!.push(elkNodes.get(e.id)!);
  }

  if (rules.partitions) {
    // Partitioning is a per-graph option in ELK: enable it on every level.
    for (const container of [root, ...[...elkNodes.values()].filter((n) => n.children)]) {
      container.layoutOptions!['elk.partitioning.activate'] = 'true';
    }
    for (const [id, partition] of rules.partitions) {
      elkNodes.get(id)!.layoutOptions!['elk.partitioning.partition'] = String(partition);
    }
  }
  for (const id of rules.overlays) {
    // Leave room for the overlay frame and its title around the lifted children.
    const host = elkParent(id);
    const hostNode = host ? elkNodes.get(host)! : root;
    hostNode.layoutOptions!['elk.spacing.nodeNode'] = String(OVERLAY_PADDING.side * 2 + 24);
    hostNode.layoutOptions!['elk.padding'] =
      `[top=${GROUP_PADDING.top + OVERLAY_PADDING.top},left=${GROUP_PADDING.left + OVERLAY_PADDING.side},bottom=${GROUP_PADDING.bottom + OVERLAY_PADDING.side},right=${GROUP_PADDING.right + OVERLAY_PADDING.side}]`;
  }

  // With nested graphs ELK does not enforce partitions against edges that point backwards
  // (e.g. private subnet → NAT in the public subnet). Such edges are given to ELK reversed
  // and flipped back afterwards, which keeps the tier columns intact.
  const reversed = new Set<string>();
  // Edges between the same tier of different overlays (e.g. Aurora writer in AZ A → reader in
  // AZ B) would push one AZ after the other; ELK ignores them and they are routed afterwards.
  const manual = new Set<string>();
  const overlayOf = (id: string) => {
    for (let p = graph.parent.get(id); p; p = graph.parent.get(p)) if (rules.overlays.has(p)) return p;
    return undefined;
  };
  if (rules.partitions) {
    for (const r of graph.relationships) {
      const [a, b] = siblingAncestors(r.source, r.target, elkParent);
      const pa = rules.partitions.get(a) ?? 0, pb = rules.partitions.get(b) ?? 0;
      if (pa > pb) reversed.add(r.id);
      else if (pa === pb && a !== b && overlayOf(r.source) && overlayOf(r.target) && overlayOf(r.source) !== overlayOf(r.target)) manual.add(r.id);
    }
  }

  const edgeLines = new Map<string, LabelLine[]>();
  for (const r of graph.relationships) {
    const text = [r.description, r.protocol].filter(Boolean).join(' · ');
    const lines = text ? edgeLabelLines(text) : [];
    edgeLines.set(r.id, lines);
    if (manual.has(r.id)) continue;
    const [from, to] = reversed.has(r.id) ? [r.target, r.source] : [r.source, r.target];
    const sources = [portFor(elkNodes.get(from)!, `${r.id}__out`, sides.out, graph.groups.has(from))];
    const targets = [portFor(elkNodes.get(to)!, `${r.id}__in`, sides.in, graph.groups.has(to))];
    const edge: ElkExtendedEdge = {
      id: r.id,
      sources,
      targets,
      labels: lines.length ? [{ id: `${r.id}__label`, text, ...measure(lines) }] : [],
    };
    root.edges!.push(edge);
  }

  // Overlay frames are drawn after layout; if two of them collide, widen the spacing of
  // their host graph and lay out again (a few passes at most).
  let result = await elk.layout(structuredClone(root));
  for (let pass = 0; pass < 3 && rules.overlays.size; pass++) {
    const overlap = overlayOverlap(result, rules.overlays, graph);
    if (overlap.size === 0) break;
    for (const [host, amount] of overlap) {
      const hostNode = host ? elkNodes.get(host)! : root;
      const current = Number(hostNode.layoutOptions!['elk.spacing.nodeNode'] ?? 44);
      hostNode.layoutOptions!['elk.spacing.nodeNode'] = String(Math.ceil(current + amount + 8));
    }
    result = await elk.layout(structuredClone(root));
  }

  const nodes: PlacedNode[] = [];
  const visit = (n: ElkNode, depth: number, parent?: string) => {
    for (const child of n.children ?? []) {
      const lbl = child.labels?.[0];
      const isGroup = graph.groups.has(child.id);
      nodes.push({
        id: child.id,
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? 0,
        height: child.height ?? 0,
        isGroup,
        depth,
        parent,
        label: {
          x: lbl?.x ?? 0,
          y: lbl?.y ?? 0,
          width: lbl?.width ?? 0,
          height: lbl?.height ?? 0,
          lines: labelLines.get(child.id) ?? [],
        },
      });
      visit(child, depth + 1, child.id);
    }
  };
  visit(result, 0);
  placeOverlays(nodes, rules.overlays, graph, labelLines);

  const edges: PlacedEdge[] = [];
  const collectEdges = (n: ElkNode) => {
    for (const e of (n.edges ?? []) as ElkExtendedEdge[]) {
      const section = e.sections?.[0];
      if (!section) continue;
      const points: Point[] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({ x: p.x, y: p.y }));
      if (reversed.has(e.id)) points.reverse();
      const rel = graph.relationships.find((r) => r.id === e.id)!;
      const lbl = e.labels?.[0];
      const lines = edgeLines.get(e.id) ?? [];
      const label: PlacedLabel | undefined =
        lbl && lines.length ? { x: lbl.x ?? 0, y: lbl.y ?? 0, width: lbl.width ?? 0, height: lbl.height ?? 0, lines } : undefined;
      edges.push({ id: e.id, source: rel.source, target: rel.target, points: simplifyPolyline(points), label });
    }
    for (const child of n.children ?? []) collectEdges(child);
  };
  collectEdges(result);
  for (const r of graph.relationships) {
    if (!manual.has(r.id)) continue;
    const lines = edgeLines.get(r.id) ?? [];
    edges.push(routeBetweenRows(r.id, r.source, r.target, nodes, lines));
  }

  return { width: result.width ?? 0, height: result.height ?? 0, nodes, edges };
}

function portFor(node: ElkNode, id: string, side: string, isGroup: boolean): string {
  // Groups keep free attachment points; icons get one port per edge end on a fixed side.
  if (isGroup) return node.id;
  node.ports!.push({ id, width: 1, height: 1, layoutOptions: { 'elk.port.side': side } });
  return id;
}

/** Frames overlay groups around their (already placed) descendants and fixes parent/depth links. */
function placeOverlays(nodes: PlacedNode[], overlays: Set<string>, graph: ViewGraph, labelLines: Map<string, LabelLine[]>) {
  const elementOf = new Map(graph.elements.map((e) => [e.id, e]));
  if (overlays.size === 0) return;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const descendants = (id: string) => nodes.filter((n) => {
    for (let p = graph.parent.get(n.id); p; p = graph.parent.get(p)) if (p === id) return true;
    return false;
  });
  // Innermost overlays first, so nested overlays are framed before their parents.
  const depthOf = (id: string) => { let d = 0; for (let p = graph.parent.get(id); p; p = graph.parent.get(p)) d++; return d; };
  for (const id of [...overlays].sort((a, b) => depthOf(b) - depthOf(a))) {
    const inner = descendants(id);
    if (inner.length === 0) continue;
    const x1 = Math.min(...inner.map((n) => n.x)) - OVERLAY_PADDING.side;
    const y1 = Math.min(...inner.map((n) => n.y)) - OVERLAY_PADDING.top;
    const x2 = Math.max(...inner.map((n) => Math.max(n.x + n.width, n.label.x + n.label.width))) + OVERLAY_PADDING.side;
    const y2 = Math.max(...inner.map((n) => Math.max(n.y + n.height, n.label.y + n.label.height))) + OVERLAY_PADDING.side;
    const lines = labelLines.get(id) ?? [];
    const size = measure(lines);
    size.width += groupBadgeSpace(elementOf.get(id)!);
    const host = graph.parent.get(id);
    const overlay: PlacedNode = {
      id, x: x1, y: y1, width: x2 - x1, height: y2 - y1, isGroup: true, depth: 0, parent: host,
      label: { x: x1, y: y1, width: size.width, height: size.height, lines },
    };
    nodes.push(overlay);
    byId.set(id, overlay);
  }
  // Recompute parents (logical hierarchy) and depths now that overlays exist.
  for (const n of nodes) n.parent = graph.parent.get(n.id);
  const depth = (n: PlacedNode): number => (n.parent && byId.get(n.parent) ? depth(byId.get(n.parent)!) + 1 : 0);
  for (const n of nodes) n.depth = depth(n);
}

/** The two distinct ancestors (or selves) of a and b that share the same parent in the ELK tree. */
function siblingAncestors(a: string, b: string, parentOf: (id: string) => string | undefined): [string, string] {
  const chain = (id: string) => {
    const out = [id];
    for (let p = parentOf(id); p; p = parentOf(p)) out.push(p);
    return out;
  };
  const ca = chain(a), cb = chain(b);
  const setB = new Set(cb);
  const common = ca.find((x) => setB.has(x));
  const below = (c: string[]) => (common ? c[c.indexOf(common) - 1] ?? c[0]! : c[c.length - 1]!);
  return [below(ca), below(cb)];
}

/**
 * Routes an edge ELK skipped between two nodes in different rows of the same column
 * (e.g. Aurora writer in AZ A → reader in AZ B): a "C" around their east sides, so the
 * line never crosses the labels drawn under the icons.
 */
function routeBetweenRows(id: string, source: string, target: string, nodes: PlacedNode[], lines: LabelLine[]): PlacedEdge {
  const s = nodes.find((n) => n.id === source)!, t = nodes.find((n) => n.id === target)!;
  const sy = s.y + s.height / 2, ty = t.y + t.height / 2;
  const x = Math.max(s.x + s.width, t.x + t.width) + 18;
  const points: Point[] = [{ x: s.x + s.width, y: sy }, { x, y: sy }, { x, y: ty }, { x: t.x + t.width, y: ty }];
  let label: PlacedLabel | undefined;
  if (lines.length) {
    const size = measure(lines);
    label = { x: x + 6, y: (sy + ty) / 2 - size.height / 2, ...size, lines };
  }
  return { id, source, target, points: simplifyPolyline(points), label };
}

/** Vertical/horizontal overlap between sibling overlay frames, per host group, after a layout pass. */
function overlayOverlap(result: ElkNode, overlays: Set<string>, graph: ViewGraph): Map<string | undefined, number> {
  const boxes = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  const visit = (n: ElkNode) => {
    for (const c of n.children ?? []) {
      for (let p = graph.parent.get(c.id); p; p = graph.parent.get(p)) {
        if (!overlays.has(p)) continue;
        const lbl = c.labels?.[0];
        const b = boxes.get(p) ?? { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
        b.x1 = Math.min(b.x1, (c.x ?? 0) - OVERLAY_PADDING.side);
        b.y1 = Math.min(b.y1, (c.y ?? 0) - OVERLAY_PADDING.top);
        b.x2 = Math.max(b.x2, (c.x ?? 0) + (c.width ?? 0) + OVERLAY_PADDING.side, lbl ? (lbl.x ?? 0) + (lbl.width ?? 0) : -Infinity);
        b.y2 = Math.max(b.y2, (c.y ?? 0) + (c.height ?? 0) + OVERLAY_PADDING.side, lbl ? (lbl.y ?? 0) + (lbl.height ?? 0) + OVERLAY_PADDING.side : -Infinity);
        boxes.set(p, b);
      }
      visit(c);
    }
  };
  visit(result);
  const out = new Map<string | undefined, number>();
  const ids = [...boxes.keys()];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = boxes.get(ids[i]!)!, b = boxes.get(ids[j]!)!;
      const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
      const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
      if (ox <= 0 || oy <= 0) continue;
      const host = graph.parent.get(ids[i]!);
      out.set(host, Math.max(out.get(host) ?? 0, Math.min(ox, oy)));
    }
  return out;
}
