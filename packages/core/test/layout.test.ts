import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { layoutModelView, parseWorkspace } from '../src/index.ts';
import { loadWorkspace } from '../src/workspace.ts';
import { measureLayout } from '../src/layout/metrics.ts';
import { simplifyPolyline } from '../src/layout/polyline.ts';
import { exportDrawio } from '../src/export/drawio.ts';
import { renderSvg } from '../src/render/svg.ts';

const ws = loadWorkspace(join(import.meta.dirname, '../../../examples/aws-pagos'));

describe.each(ws.views.map((v) => [v.id, v] as const))('view %s', (_id, view) => {
  it('meets the layout quality bar', async () => {
    const { layout } = await layoutModelView(ws.model, view);
    const m = measureLayout(layout);
    expect(m.labelOverlaps).toBe(0);
    expect(m.edgesThroughNodes).toBe(0);
    expect(m.misalignedEndpoints).toBe(0);
    // AZ rows keep model order (A above B) and cross-AZ edges are routed outside ELK, which
    // costs a few crossings and bends until the obstacle-aware router (libavoid) lands.
    expect(m.crossings).toBeLessThanOrEqual(4);
    expect(m.maxBendsPerEdge).toBeLessThanOrEqual(6);
  });

  it('keeps every node inside its parent group', async () => {
    const { layout } = await layoutModelView(ws.model, view);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const n of layout.nodes) {
      const p = n.parent && byId.get(n.parent);
      if (!p) continue;
      expect(n.x).toBeGreaterThanOrEqual(p.x);
      expect(n.y).toBeGreaterThanOrEqual(p.y);
      expect(n.x + n.width).toBeLessThanOrEqual(p.x + p.width);
      expect(n.y + n.height).toBeLessThanOrEqual(p.y + p.height);
    }
  });

  it('is deterministic', async () => {
    const a = await layoutModelView(ws.model, view);
    const b = await layoutModelView(ws.model, view);
    expect(renderSvg(a.layout, ws.model)).toBe(renderSvg(b.layout, ws.model));
  });

  it('exports a well-formed draw.io file with containers and waypoints', async () => {
    const { layout } = await layoutModelView(ws.model, view);
    const xml = exportDrawio(layout, ws.model, view.id);
    expect(XMLValidator.validate(xml)).toBe(true);
    const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml);
    const cells: Record<string, string>[] = doc.mxfile.diagram.mxGraphModel.root.mxCell;
    const ids = cells.map((c) => c.id);
    cells.forEach((c, i) => {
      if (c.parent) expect(ids.indexOf(c.parent)).toBeLessThan(i);
      if (c.edge) {
        expect(ids).toContain(c.source);
        expect(ids).toContain(c.target);
      }
    });
    expect(cells.filter((c) => c.edge).length).toBe(layout.edges.length);
    const badges = cells.filter((c) => c.id?.endsWith('-badge'));
    expect(cells.filter((c) => c.vertex).length).toBe(layout.nodes.length + badges.length);
    // AWS groups use draw.io's native group shapes; the rest carry an image badge.
    if (view.id === 'infra-aws') {
      const vpc = cells.find((c) => c.id === 't-vpc')!;
      expect(vpc.style).toContain('grIcon=mxgraph.aws4.group_vpc2');
      expect(badges.map((b) => b.parent)).toContain('t-sg-payments');
    }
  });
});

describe('aws-infra preset', () => {
  it('draws availability zones as rows across subnet-tier columns', async () => {
    const view = ws.views.find((v) => v.id === 'infra-aws')!;
    const { layout } = await layoutModelView(ws.model, view);
    const box = (id: string) => layout.nodes.find((n) => n.id === id)!;
    const [azA, azB] = [box('az-a'), box('az-b')];
    // Rows follow the model order: AZ A first, then AZ B.
    expect(azA.y + azA.height).toBeLessThanOrEqual(azB.y);
    const publicRight = Math.max(box('public-a').x + box('public-a').width, box('public-b').x + box('public-b').width);
    const privateLeft = Math.min(box('private-a').x, box('private-b').x);
    expect(publicRight).toBeLessThan(privateLeft);
  });
});

describe('aws-infra preset after edits', () => {
  it('keeps AZ rows apart when an element moves to the other AZ', async () => {
    const dir = join(import.meta.dirname, '../../../examples/aws-pagos');
    const read = (f: string) => readFileSync(join(dir, f), 'utf8');
    const model = read('architecture.calm.yaml')
      .replace('nodes: [payments-api] }', 'nodes: [] }')
      .replace('nodes: [orders-api, aurora-reader] }', 'nodes: [orders-api, aurora-reader, payments-api] }');
    const edited = parseWorkspace({ model, views: { 'infra-aws': read('views/infra-aws.view.yaml') } });
    const { layout } = await layoutModelView(edited.model, edited.views[0]!);
    const box = (id: string) => layout.nodes.find((n) => n.id === id)!;
    expect(box('az-a').y + box('az-a').height).toBeLessThanOrEqual(box('az-b').y);
    expect(layout.height).toBeLessThan(1600);
  });
});

describe('simplifyPolyline', () => {
  it('drops duplicate and collinear points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }];
    expect(simplifyPolyline(pts)).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]);
  });

  it('folds a tiny jog without moving the endpoints', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 2, y: 20 }, { x: 2, y: 40 }, { x: 30, y: 40 }];
    const out = simplifyPolyline(pts);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 30, y: 40 });
    expect(out.length).toBe(3);
  });
});
