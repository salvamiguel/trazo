import { loadCalm } from './model/calm.ts';
import { loadView } from './model/view.ts';
import type { Diagnostic, Model, View } from './model/types.ts';

export interface Workspace {
  model: Model;
  views: View[];
  diagnostics: Diagnostic[];
}

/** Source texts of a workspace: the CALM model and each `<id>.view.yaml`. Works anywhere (no fs). */
export interface WorkspaceSources {
  model: string;
  views: Record<string, string>;
}

export function parseWorkspace(sources: WorkspaceSources): Workspace {
  let loaded;
  try {
    loaded = loadCalm(sources.model);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      model: { elements: new Map(), relationships: [], deployedIn: new Map(), composedOf: new Map() },
      views: [],
      diagnostics: [{ level: 'error', message: `YAML: ${message}` }],
    };
  }
  const { model, diagnostics } = loaded;
  const views: View[] = [];
  for (const id of Object.keys(sources.views).sort()) {
    try {
      const v = loadView(id, sources.views[id]!);
      views.push(v.view);
      diagnostics.push(...v.diagnostics);
    } catch (err) {
      diagnostics.push({ level: 'error', message: `View ${id}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
  if (views.length === 0) views.push({ id: 'default', hierarchy: 'deployment', include: [], direction: 'right' });
  return { model, views, diagnostics };
}
