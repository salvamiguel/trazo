export * from './model/types.ts';
export { loadCalm, validateCalm, TRAZO_NS } from './model/calm.ts';
export { loadView, projectView, type ViewGraph } from './model/view.ts';
export { loadWorkspace, MODEL_FILE, type Workspace } from './workspace.ts';
export { layoutView, ICON_SIZE } from './layout/elk.ts';
export { measureLayout, type QualityMetrics } from './layout/metrics.ts';
export type * from './layout/types.ts';
export { renderSvg } from './render/svg.ts';
export { THEMES, type ThemeName } from './render/theme.ts';
export { exportDrawio } from './export/drawio.ts';

import { layoutView } from './layout/elk.ts';
import { projectView } from './model/view.ts';
import type { Model, View } from './model/types.ts';

/** Convenience: project + layout one view of a model. */
export async function layoutModelView(model: Model, view: View) {
  const graph = projectView(model, view);
  const layout = await layoutView(graph, { direction: view.direction, preset: view.preset, model });
  return { graph, layout };
}
