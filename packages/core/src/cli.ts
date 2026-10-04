#!/usr/bin/env -S npx tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadWorkspace } from './workspace.ts';
import { layoutModelView } from './index.ts';
import { measureLayout } from './layout/metrics.ts';
import { renderSvg } from './render/svg.ts';
import { exportDrawio } from './export/drawio.ts';

const USAGE = `trazo <command> <workspace-dir> [options]

Commands:
  validate   Check the CALM model and views
  render     Lay out every view and write SVG (light + dark) and .drawio

Options:
  --out <dir>    Output directory (default: <workspace>/out)
  --view <id>    Only this view
`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' }, view: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  });
  const [command, dirArg] = positionals;
  if (values.help || !command || !dirArg) {
    process.stdout.write(USAGE);
    process.exit(command ? 1 : 0);
  }
  const dir = resolve(dirArg);
  const ws = loadWorkspace(dir);
  for (const d of ws.diagnostics) console.error(`${d.level}: ${d.message}`);
  const errors = ws.diagnostics.filter((d) => d.level === 'error').length;

  if (command === 'validate') {
    console.log(errors ? `✗ ${errors} error(s)` : `✓ ${ws.model.elements.size} elements, ${ws.model.relationships.length} relationships, ${ws.views.length} view(s)`);
    process.exit(errors ? 1 : 0);
  }
  if (command !== 'render') {
    process.stdout.write(USAGE);
    process.exit(1);
  }
  if (errors) process.exit(1);

  const out = resolve(values.out ?? join(dir, 'out'));
  mkdirSync(out, { recursive: true });
  for (const view of ws.views.filter((v) => !values.view || v.id === values.view)) {
    const { layout, graph } = await layoutModelView(ws.model, view);
    for (const d of graph.diagnostics) console.error(`${d.level}: ${d.message}`);
    const title = view.title ?? view.id;
    writeFileSync(join(out, `${view.id}.light.svg`), renderSvg(layout, ws.model, { theme: 'light', title }));
    writeFileSync(join(out, `${view.id}.dark.svg`), renderSvg(layout, ws.model, { theme: 'dark', title }));
    writeFileSync(join(out, `${view.id}.drawio`), exportDrawio(layout, ws.model, title));
    const m = measureLayout(layout);
    console.log(
      `${view.id}: ${m.nodes} nodes, ${m.edges} edges | crossings ${m.crossings}, bends ${m.bends} (max ${m.maxBendsPerEdge}/edge), ` +
        `label overlaps ${m.labelOverlaps}, edges through icons ${m.edgesThroughNodes}, misaligned arrowheads ${m.misalignedEndpoints}`,
    );
  }
  console.log(`→ ${out}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
