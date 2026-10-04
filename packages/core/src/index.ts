export * from './model/types.ts';
export { loadCalm, validateCalm, TRAZO_NS } from './model/calm.ts';
export { loadView, projectView, type ViewGraph } from './model/view.ts';
export { parseWorkspace, type Workspace, type WorkspaceSources } from './workspace-core.ts';
export { layoutView, ICON_SIZE } from './layout/elk.ts';
export { measureLayout, type QualityMetrics } from './layout/metrics.ts';
export type * from './layout/types.ts';
export { renderSvg } from './render/svg.ts';
export {
  getIcon,
  iconIds,
  iconIndex,
  isIconSetLoaded,
  loadIconSets,
  missingIconSets,
  onIconSetsChange,
  registerIconSet,
  resolveIconId,
  ICON_PREFIXES,
  type IconIndex,
} from './icons/registry.ts';
export { GROUP_ICONS, ensureModelIcons, modelIconRefs } from './icons/groups.ts';
export { CURATED, type CuratedIcon } from './icons/curated.ts';
export { THEMES, type ThemeName } from './render/theme.ts';
export { exportDrawio } from './export/drawio.ts';

import { layoutView } from './layout/elk.ts';
import { ensureModelIcons } from './icons/groups.ts';
import { projectView } from './model/view.ts';
import type { Model, View } from './model/types.ts';

/** Convenience: project + layout one view of a model, loading the icon sets it draws. */
export async function layoutModelView(model: Model, view: View) {
  await ensureModelIcons(model);
  const graph = projectView(model, view);
  const layout = await layoutView(graph, { direction: view.direction, preset: view.preset, model });
  return { graph, layout };
}
