import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { diffVersions, listVersions, MAX_VERSIONS, renameVersion, resetHistoryForTests, snapshot, summarize, VERSION_GAP_MS } from '../src/history.ts';
import { addNode, deleteNode } from '../src/edit.ts';
import { pngScale, svgSize } from '../src/png.ts';

const dir = join(import.meta.dirname, '../../../examples/aws-pagos');
const base = {
  model: readFileSync(join(dir, 'architecture.calm.yaml'), 'utf8'),
  views: { 'infra-aws': readFileSync(join(dir, 'views/infra-aws.view.yaml'), 'utf8') },
};
const T0 = Date.UTC(2026, 9, 4, 9, 0);

describe('version history', () => {
  beforeEach(() => resetHistoryForTests());

  it('keeps one version per edit session and skips identical content', async () => {
    expect(await snapshot('ws', base, { now: T0 })).toBeDefined();
    const edited = addNode(base, 'infra-aws', { name: 'Caché', 'node-type': 'database' }).sources;
    expect(await snapshot('ws', edited, { now: T0 + 30_000 })).toBeUndefined();
    expect(await snapshot('ws', edited, { now: T0 + VERSION_GAP_MS })).toBeDefined();
    expect(await snapshot('ws', edited, { now: T0 + 3 * VERSION_GAP_MS, force: true })).toBeUndefined();
    expect((await listVersions('ws')).length).toBe(2);
    expect(await listVersions('other')).toEqual([]);
  });

  it('describes what each version added and removed', async () => {
    const added = addNode(base, 'infra-aws', { name: 'Caché', 'node-type': 'database' });
    const removed = deleteNode(added.sources, 'waf');
    const [a, b] = [{ sources: added.sources, ...summarize(added.sources) }, { sources: removed, ...summarize(removed) }];
    const diff = diffVersions({ sources: base, ...summarize(base) }, a);
    expect(diff.added).toEqual(['Caché']);
    expect(diffVersions(a, b).removed).toEqual([expect.stringMatching(/WAF/)]);
    expect(diffVersions(a, b).relsRemoved).toBeGreaterThan(0);
    const renamed = { ...base, model: base.model.replace('name: Route 53', 'name: DNS') };
    expect(diffVersions({ sources: base, ...summarize(base) }, { sources: renamed, ...summarize(renamed) }).edited).toBe(true);
  });

  it('names the current state and never prunes named versions', async () => {
    const named = await snapshot('ws', base, { now: T0, name: 'Revisión' });
    let s = base;
    for (let i = 1; i <= MAX_VERSIONS + 5; i++) {
      s = { ...s, model: `${s.model}\n# ${i}` };
      await snapshot('ws', s, { now: T0 + i * VERSION_GAP_MS });
    }
    const all = await listVersions('ws');
    expect(all.filter((v) => !v.name).length).toBe(MAX_VERSIONS);
    expect(all.at(-1)!.id).toBe(named!.id);
    await renameVersion(all[0]!, 'Última');
    expect((await snapshot('ws', s, { name: 'Otra' }))!.id).toBe(all[0]!.id);
    expect((await listVersions('ws'))[0]!.name).toBe('Otra');
  });
});

describe('png export', () => {
  it('reads the diagram size and keeps big diagrams inside canvas limits', () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800.5" viewBox="0 0 1200 800.5">')).toEqual({ width: 1200, height: 800.5 });
    expect(pngScale(1200, 800)).toBe(2);
    expect(pngScale(6000, 1000) * 6000).toBeLessThanOrEqual(8192);
    const k = pngScale(6000, 6000);
    expect(6000 * k * 6000 * k).toBeLessThanOrEqual(32_000_000 + 1);
  });
});
