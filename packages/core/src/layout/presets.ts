import type { Model } from '../model/types.ts';
import type { ViewGraph } from '../model/view.ts';

export interface PresetRules {
  /**
   * ELK partition per node (leaf or group), compared among siblings: a node in partition k
   * always sits after siblings in partition k-1 along the flow direction.
   */
  partitions?: Map<string, number>;
  /**
   * Groups that ELK does not see: their children are laid out by the grandparent and the
   * group is drawn afterwards around them. Used for cross-cutting groupings such as AWS
   * availability zones, which are rows across the subnet-tier columns.
   */
  overlays: Set<string>;
}

export function presetRules(preset: string | undefined, graph: ViewGraph, model: Model): PresetRules {
  const explicit = new Map<string, number>();
  for (const e of graph.elements) {
    const tier = model.elements.get(e.id)?.tier;
    if (tier !== undefined) explicit.set(e.id, tier);
  }
  if (preset !== 'aws-infra') {
    return { partitions: explicit.size ? propagate(explicit, graph) : undefined, overlays: new Set() };
  }

  const style = (id: string) => model.elements.get(id)?.groupStyle;
  const subnetTier = (id: string): number | undefined => {
    for (let cur: string | undefined = id; cur; cur = graph.parent.get(cur)) {
      if (style(cur) === 'aws-subnet-public') return 1;
      if (style(cur) === 'aws-subnet-private') return 2;
    }
    return undefined;
  };

  const leaves = graph.elements.filter((e) => !graph.groups.has(e.id));
  const inSubnet = new Set(leaves.filter((e) => subnetTier(e.id) !== undefined).map((e) => e.id));
  const adjacency = new Map<string, string[]>();
  for (const r of graph.relationships) adjacency.set(r.source, [...(adjacency.get(r.source) ?? []), r.target]);
  const reachesSubnet = (start: string) => {
    const seen = new Set<string>([start]);
    const stack = [start];
    while (stack.length) {
      for (const next of adjacency.get(stack.pop()!) ?? []) {
        if (inSubnet.has(next)) return true;
        if (!seen.has(next)) seen.add(next), stack.push(next);
      }
    }
    return false;
  };

  // Tiers: edge services → public subnets → private subnets → regional/external services.
  const leafTiers = new Map<string, number>();
  for (const e of leaves) leafTiers.set(e.id, explicit.get(e.id) ?? subnetTier(e.id) ?? (reachesSubnet(e.id) ? 0 : 3));

  // Availability zones are rows across the subnet-tier columns, not boxes in the flow.
  const overlays = new Set(graph.elements.filter((e) => style(e.id) === 'aws-az' && graph.groups.has(e.id)).map((e) => e.id));
  return { partitions: propagate(leafTiers, graph), overlays };
}

/** Gives every group the lowest partition among its descendants, so siblings compare correctly. */
function propagate(leafPartitions: Map<string, number>, graph: ViewGraph): Map<string, number> {
  const result = new Map<string, number>();
  for (const e of graph.elements) {
    if (graph.groups.has(e.id)) continue;
    const p = leafPartitions.get(e.id) ?? 0;
    for (let cur: string | undefined = e.id; cur; cur = graph.parent.get(cur)) {
      result.set(cur, Math.min(result.get(cur) ?? Infinity, p));
    }
  }
  return result;
}
