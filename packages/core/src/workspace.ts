import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseWorkspace, type Workspace } from './workspace-core.ts';

export type { Workspace } from './workspace-core.ts';
export const MODEL_FILE = 'architecture.calm.yaml';

/** A workspace is a folder with one CALM model and any number of `views/*.view.yaml`. */
export function loadWorkspace(dir: string): Workspace {
  const modelPath = join(dir, MODEL_FILE);
  if (!existsSync(modelPath)) throw new Error(`No ${MODEL_FILE} in ${dir}`);
  const views: Record<string, string> = {};
  const viewDir = join(dir, 'views');
  if (existsSync(viewDir)) {
    for (const file of readdirSync(viewDir).filter((f) => f.endsWith('.view.yaml'))) {
      views[basename(file, '.view.yaml')] = readFileSync(join(viewDir, file), 'utf8');
    }
  }
  return parseWorkspace({ model: readFileSync(modelPath, 'utf8'), views });
}
