import type { Model } from '../model/types.ts';
import type { ViewGraph } from '../model/view.ts';

/**
 * Preset layout rules expressed as ELK partitions: nodes in partition k always sit in layers
 * after partition k-1. For AWS infrastructure this produces the conventional tier columns
 * (edge → public subnets → private subnets → regional/external services) and stacks the
 * availability zones instead of placing them one after another.
 */
export function computePartitions(preset: string | undefined, graph: ViewGraph, model: Model): Map<string, number> | undefined {
  const explicit = new Map<string, number>();
  for (const e of graph.elements) {
    const tier = model.elements.get(e.id)?.tier;
    if (tier !== undefined) explicit.set(e.id, tier);
  }
  if (preset !== 'aws-infra') return explicit.size ? fillMissing(explicit, graph) : undefined;

  const subnetTier = (id: string): number | undefined => {
    for (let cur: string | undefined = id; cur; cur = graph.parent.get(cur)) {
      const style = model.elements.get(cur)?.groupStyle;
      if (style === 'aws-subnet-public') return 1;
      if (style === 'aws-subnet-private') return 2;
    }
    return undefined;
  };

  const leaves = graph.elements.filter((e) => !graph.groups.has(e.id));
  const inSubnet = new Set(leaves.filter((e) => subnetTier(e.id) !== undefined).map((e) => e.id));
  // Outside the subnets: upstream if it can reach a subnet node, downstream otherwise.
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

  const partitions = new Map<string, number>();
  for (const e of leaves) {
    partitions.set(e.id, explicit.get(e.id) ?? subnetTier(e.id) ?? (reachesSubnet(e.id) ? 0 : 3));
  }
  return partitions;
}

function fillMissing(partitions: Map<string, number>, graph: ViewGraph) {
  for (const e of graph.elements) if (!graph.groups.has(e.id) && !partitions.has(e.id)) partitions.set(e.id, 0);
  return partitions;
}
