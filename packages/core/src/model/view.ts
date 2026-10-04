import { parse as parseYaml } from 'yaml';
import { PIN_SIDES, type Diagnostic, type Direction, type Element, type Hierarchy, type Model, type Pin, type PinSide, type Relationship, type View } from './types.ts';

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
  if (layout.edges !== undefined && !['auto', 'bundled', 'separate'].includes(String(layout.edges))) {
    diagnostics.push({ level: 'warning', message: `View ${id}: layout.edges must be auto, bundled or separate` });
  }
  // layout.pinned: { payments-db: { right-of: payments-api } }
  const pins: Pin[] = [];
  const pinned = layout.pinned;
  if (pinned && typeof pinned === 'object') {
    for (const [el, hint] of Object.entries(pinned as Record<string, unknown>)) {
      const entry = hint && typeof hint === 'object' ? Object.entries(hint as Record<string, unknown>)[0] : undefined;
      if (!entry || !PIN_SIDES.includes(entry[0] as PinSide) || typeof entry[1] !== 'string') {
        diagnostics.push({ level: 'warning', message: `View ${id}: pinned.${el} needs one of ${PIN_SIDES.join(', ')} with an element id` });
        continue;
      }
      pins.push({ id: el, side: entry[0] as PinSide, of: entry[1] });
    }
  }
  return {
    view: {
      id,
      title: typeof raw.title === 'string' ? raw.title : undefined,
      preset: typeof raw.preset === 'string' ? raw.preset : undefined,
      hierarchy,
      include: Array.isArray(raw.include) ? raw.include.map(String) : [],
      // No list means every element; an explicit empty list is a view that starts empty.
      includeAll: !Array.isArray(raw.include),
      direction,
      pins,
      edges: layout.edges === 'bundled' || layout.edges === 'separate' ? layout.edges : undefined,
    },
    diagnostics,
  };
}

/** The slice of the model a view draws, with parents resolved for its hierarchy. */
export interface ViewGraph {
  elements: Element[];
  /** Pins that apply here: both ends shown and in the same group. */
  pins: Pin[];
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
  if (view.includeAll) {
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
    .filter((id) => groups.has(id) || !(view.includeAll && otherContainers.has(id) && !parents.has(id) && !hasEdges(model, id)))
    .map((id) => model.elements.get(id)!);
  const shown = new Set(elements.map((e) => e.id));

  const relationships = model.relationships.filter((r) => shown.has(r.source) && shown.has(r.target));
  const pins = view.pins.filter((pin) => {
    if (!shown.has(pin.id) || !shown.has(pin.of)) return false;
    if (parent.get(pin.id) === parent.get(pin.of) && pin.id !== pin.of) return true;
    diagnostics.push({ level: 'warning', message: `View ${view.id}: ${pin.id} can only be pinned next to an element in its own group, not ${pin.of}` });
    return false;
  });
  return { elements, pins, parent, groups, relationships, diagnostics };
}

function hasEdges(model: Model, id: string) {
  return model.relationships.some((r) => r.source === id || r.target === id);
}
