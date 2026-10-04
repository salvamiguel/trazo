import { parse as parseYaml } from 'yaml';
import type { Diagnostic, Direction, Element, Hierarchy, Model, Relationship, View } from './types.ts';

const DIRECTIONS: Direction[] = ['right', 'down', 'left', 'up'];
const HIERARCHIES: Hierarchy[] = ['deployment', 'composition', 'none'];

export function loadView(id: string, text: string): { view: View; diagnostics: Diagnostic[] } {
  const raw = (parseYaml(text) ?? {}) as Record<string, unknown>;
  const diagnostics: Diagnostic[] = [];
  const layout = (raw.layout ?? {}) as Record<string, unknown>;
  const direction = (layout.direction as Direction) ?? 'right';
  const hierarchy = (raw.hierarchy as Hierarchy) ?? 'deployment';
  if (!DIRECTIONS.includes(direction)) diagnostics.push({ level: 'error', message: `View ${id}: invalid direction "${direction}"` });
  if (!HIERARCHIES.includes(hierarchy)) diagnostics.push({ level: 'error', message: `View ${id}: invalid hierarchy "${hierarchy}"` });
  return {
    view: {
      id,
      title: typeof raw.title === 'string' ? raw.title : undefined,
      preset: typeof raw.preset === 'string' ? raw.preset : undefined,
      hierarchy,
      include: Array.isArray(raw.include) ? raw.include.map(String) : [],
      direction,
    },
    diagnostics,
  };
}

/** The slice of the model a view draws, with parents resolved for its hierarchy. */
export interface ViewGraph {
  elements: Element[];
  /** element id -> parent id inside this view. */
  parent: Map<string, string>;
  /** ids of elements drawn as groups (they have children in this view). */
  groups: Set<string>;
  relationships: Relationship[];
  diagnostics: Diagnostic[];
}

export function projectView(model: Model, view: View): ViewGraph {
  const diagnostics: Diagnostic[] = [];
  const parents =
    view.hierarchy === 'deployment' ? model.deployedIn : view.hierarchy === 'composition' ? model.composedOf : new Map<string, string>();

  const visible = new Set<string>();
  if (view.include.length === 0) {
    for (const id of model.elements.keys()) visible.add(id);
  } else {
    for (const id of view.include) {
      if (!model.elements.has(id)) {
        diagnostics.push({ level: 'warning', message: `View ${view.id}: unknown element "${id}" ignored` });
        continue;
      }
      for (let cur: string | undefined = id; cur; cur = parents.get(cur)) visible.add(cur);
    }
  }

  const parent = new Map<string, string>();
  const groups = new Set<string>();
  for (const id of visible) {
    const p = parents.get(id);
    if (p && visible.has(p)) {
      parent.set(id, p);
      groups.add(p);
    }
  }

  // With the full model, containers that only exist to group (no children here) are hidden
  // when they belong to the other hierarchy, e.g. a C4 system in a deployment view.
  const otherParents = view.hierarchy === 'deployment' ? model.composedOf : model.deployedIn;
  const otherContainers = new Set(otherParents.values());
  // A box with a group style is still drawn as a group while empty (e.g. a VPC just added in the editor).
  for (const id of visible) {
    if (model.elements.get(id)?.groupStyle && !otherContainers.has(id)) groups.add(id);
  }
  const elements = [...visible]
    .filter((id) => groups.has(id) || !(view.include.length === 0 && otherContainers.has(id) && !parents.has(id) && !hasEdges(model, id)))
    .map((id) => model.elements.get(id)!);
  const shown = new Set(elements.map((e) => e.id));

  const relationships = model.relationships.filter((r) => shown.has(r.source) && shown.has(r.target));
  return { elements, parent, groups, relationships, diagnostics };
}

function hasEdges(model: Model, id: string) {
  return model.relationships.some((r) => r.source === id || r.target === id);
}
