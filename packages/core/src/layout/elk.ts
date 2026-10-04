import { createRequire } from 'node:module';
import type { ELK as ElkInstance, ELKConstructorArguments, ElkExtendedEdge, ElkNode, ElkLabel } from 'elkjs/lib/elk-api.js';
import type { ViewGraph } from '../model/view.ts';
import type { Direction, Element } from '../model/types.ts';
import { FONT, textWidth, wrap } from './text.ts';
import type { Layout, LabelLine, PlacedEdge, PlacedLabel, PlacedNode, Point } from './types.ts';
import { simplifyPolyline } from './polyline.ts';
import { computePartitions } from './presets.ts';
import type { Model } from '../model/types.ts';

// elkjs ships CommonJS; load it explicitly so ESM and the typings agree.
const ELK = createRequire(import.meta.url)('elkjs/lib/elk.bundled.js') as new (args?: ELKConstructorArguments) => ElkInstance;

export const ICON_SIZE = 56;
const LABEL_MAX_WIDTH = 150;
const GROUP_PADDING = { top: 40, left: 20, bottom: 20, right: 20 };

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

  const partitions = options.model ? computePartitions(options.preset, graph, options.model) : undefined;
  if (partitions) {
    root.layoutOptions!['elk.partitioning.activate'] = 'true';
    for (const [id, partition] of partitions) {
      elkNodes.get(id)!.layoutOptions!['elk.partitioning.partition'] = String(partition);
    }
  }

  for (const e of graph.elements) {
    const parentId = graph.parent.get(e.id);
    const container = parentId ? elkNodes.get(parentId)! : root;
    container.children!.push(elkNodes.get(e.id)!);
  }

  const edgeLines = new Map<string, LabelLine[]>();
  for (const r of graph.relationships) {
    const text = [r.description, r.protocol].filter(Boolean).join(' · ');
    const lines = text ? edgeLabelLines(text) : [];
    edgeLines.set(r.id, lines);
    const sources = [portFor(elkNodes.get(r.source)!, `${r.id}__out`, sides.out, graph.groups.has(r.source))];
    const targets = [portFor(elkNodes.get(r.target)!, `${r.id}__in`, sides.in, graph.groups.has(r.target))];
    const edge: ElkExtendedEdge = {
      id: r.id,
      sources,
      targets,
      labels: lines.length ? [{ id: `${r.id}__label`, text, ...measure(lines) }] : [],
    };
    root.edges!.push(edge);
  }

  const result = await elk.layout(root);

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

  const edges: PlacedEdge[] = [];
  const collectEdges = (n: ElkNode) => {
    for (const e of (n.edges ?? []) as ElkExtendedEdge[]) {
      const section = e.sections?.[0];
      if (!section) continue;
      const points: Point[] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({ x: p.x, y: p.y }));
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

  return { width: result.width ?? 0, height: result.height ?? 0, nodes, edges };
}

function portFor(node: ElkNode, id: string, side: string, isGroup: boolean): string {
  // Groups keep free attachment points; icons get one port per edge end on a fixed side.
  if (isGroup) return node.id;
  node.ports!.push({ id, width: 1, height: 1, layoutOptions: { 'elk.port.side': side } });
  return id;
}
