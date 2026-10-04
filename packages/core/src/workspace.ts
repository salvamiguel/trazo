import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadCalm } from './model/calm.ts';
import { loadView } from './model/view.ts';
import type { Diagnostic, Model, View } from './model/types.ts';

export const MODEL_FILE = 'architecture.calm.yaml';

export interface Workspace {
  model: Model;
  views: View[];
  diagnostics: Diagnostic[];
}

/** A workspace is a folder with one CALM model and any number of `views/*.view.yaml`. */
export function loadWorkspace(dir: string): Workspace {
  const modelPath = join(dir, MODEL_FILE);
  if (!existsSync(modelPath)) throw new Error(`No ${MODEL_FILE} in ${dir}`);
  const { model, diagnostics } = loadCalm(readFileSync(modelPath, 'utf8'));
  const views: View[] = [];
  const viewDir = join(dir, 'views');
  if (existsSync(viewDir)) {
    for (const file of readdirSync(viewDir).filter((f) => f.endsWith('.view.yaml')).sort()) {
      const loaded = loadView(basename(file, '.view.yaml'), readFileSync(join(viewDir, file), 'utf8'));
      views.push(loaded.view);
      diagnostics.push(...loaded.diagnostics);
    }
  }
  if (views.length === 0) views.push({ id: 'default', hierarchy: 'deployment', include: [], direction: 'right' });
  return { model, views, diagnostics };
}
