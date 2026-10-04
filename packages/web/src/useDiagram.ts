import { useEffect, useMemo, useState } from 'react';
import {
  exportDrawio,
  layoutModelView,
  measureLayout,
  parseWorkspace,
  renderSvg,
  type Diagnostic,
  type Layout,
  type Model,
  type QualityMetrics,
  type ThemeName,
  type Workspace,
  type WorkspaceSources,
} from '@trazo/core';

export interface DiagramState {
  workspace: Workspace;
  layout?: Layout;
  /** Model the layout was computed from (may trail `workspace.model`). */
  layoutModel?: Model;
  /** View the current layout belongs to; lags behind the selected view while layout runs. */
  layoutView?: string;
  svg?: string;
  metrics?: QualityMetrics;
  diagnostics: Diagnostic[];
  busy: boolean;
}

/** Debounces a value so heavy work (parse + layout) runs once typing pauses. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function useDiagram(sources: WorkspaceSources, viewId: string, theme: ThemeName): DiagramState {
  const debounced = useDebounced(sources, 250);
  const workspace = useMemo(() => parseWorkspace(debounced), [debounced]);
  const view = workspace.views.find((v) => v.id === viewId) ?? workspace.views[0];

  const [result, setResult] = useState<{ layout?: Layout; model?: Model; viewId?: string; extra: Diagnostic[]; error?: string }>({ extra: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!view) return;
    const fatal = workspace.diagnostics.some((d) => d.level === 'error' && d.message.startsWith('YAML'));
    if (fatal) return;
    let cancelled = false;
    setBusy(true);
    layoutModelView(workspace.model, view)
      .then(({ layout, graph }) => {
        if (!cancelled) setResult({ layout, model: workspace.model, viewId: view.id, extra: graph.diagnostics });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult((r) => ({ ...r, error: err instanceof Error ? err.message : String(err) }));
      })
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [workspace, view]);

  const svg = useMemo(
    // Render with the model the layout was computed from: while a new layout runs, the
    // current model may already lack elements the old layout still draws.
    () => (result.layout && result.model ? renderSvg(result.layout, result.model, { theme, title: view?.title ?? view?.id }) : undefined),
    [result.layout, result.model, theme, view],
  );
  const metrics = useMemo(() => (result.layout ? measureLayout(result.layout) : undefined), [result.layout]);
  const diagnostics = [
    ...workspace.diagnostics,
    ...result.extra,
    ...(result.error ? [{ level: 'error' as const, message: `Layout: ${result.error}` }] : []),
  ];
  return { workspace, layout: result.layout, layoutModel: result.model, layoutView: result.viewId, svg, metrics, diagnostics, busy };
}

export function drawioFor(state: DiagramState, name: string): string | undefined {
  return state.layout && state.layoutModel ? exportDrawio(state.layout, state.layoutModel, name) : undefined;
}
