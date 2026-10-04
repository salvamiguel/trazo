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
  const infra = preset ? INFRA[preset] : undefined;
  if (!infra) {
    return { partitions: explicit.size ? propagate(explicit, graph) : undefined, overlays: new Set() };
  }

  const style = (id: string) => model.elements.get(id)?.groupStyle;
  const tierOf = infra.subnetTiers(graph, model);
  const lastTier = Math.max(0, ...tierOf.values()) + 1;
  const subnetTier = (id: string): number | undefined => {
    for (let cur: string | undefined = id; cur; cur = graph.parent.get(cur)) {
      const t = tierOf.get(cur);
      if (t !== undefined) return t;
    }
    return undefined;
  };

  // Leaves are whatever has no children here, including a group box that is still empty.
  const parentsInView = new Set(graph.parent.values());
  const leaves = graph.elements.filter((e) => !parentsInView.has(e.id));
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

  // Tiers: edge services → subnets in tier order → regional/external services.
  const leafTiers = new Map<string, number>();
  for (const e of leaves) leafTiers.set(e.id, explicit.get(e.id) ?? subnetTier(e.id) ?? (reachesSubnet(e.id) ? 0 : lastTier));

  // Availability zones are rows across the subnet-tier columns, not boxes in the flow.
  const overlays = new Set(graph.elements.filter((e) => style(e.id) === infra.az && parentsInView.has(e.id)).map((e) => e.id));
  return { partitions: propagate(leafTiers, graph), overlays };
}

interface InfraPreset {
  /** Group style drawn as availability-zone rows. */
  az: string;
  /** Column (1, 2, …) of every subnet in the view. */
  subnetTiers: (graph: ViewGraph, model: Model) => Map<string, number>;
}

const INFRA: Record<string, InfraPreset> = {
  // AWS: public subnets, then private ones.
  'aws-infra': {
    az: 'aws-az',
    subnetTiers: (graph, model) => {
      const tiers = new Map<string, number>();
      for (const e of graph.elements) {
        const s = model.elements.get(e.id)?.groupStyle;
        if (s === 'aws-subnet-public') tiers.set(e.id, 1);
        if (s === 'aws-subnet-private') tiers.set(e.id, 2);
      }
      return tiers;
    },
  },
  // Azure: subnets have no public/private kind, so each VNet's subnets are columns in model
  // order (gateway / frontend subnets are usually declared first); `tier` overrides it.
  'azure-infra': {
    az: 'azure-az',
    subnetTiers: (graph, model) => {
      const tiers = new Map<string, number>();
      const inView = new Set(graph.elements.map((e) => e.id));
      const count = new Map<string | undefined, number>();
      for (const el of model.elements.values()) {
        if (el.groupStyle !== 'azure-subnet' || !inView.has(el.id)) continue;
        const vnet = graph.parent.get(el.id);
        const n = (count.get(vnet) ?? 0) + 1;
        count.set(vnet, n);
        tiers.set(el.id, el.tier ?? n);
      }
      return tiers;
    },
  },
};

/** Gives every group the lowest partition among its descendants, so siblings compare correctly. */
function propagate(leafPartitions: Map<string, number>, graph: ViewGraph): Map<string, number> {
  const result = new Map<string, number>();
  const parentsInView = new Set(graph.parent.values());
  for (const e of graph.elements) {
    if (parentsInView.has(e.id)) continue;
    const p = leafPartitions.get(e.id) ?? 0;
    for (let cur: string | undefined = e.id; cur; cur = graph.parent.get(cur)) {
      result.set(cur, Math.min(result.get(cur) ?? Infinity, p));
    }
  }
  return result;
}
