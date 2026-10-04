import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { layoutModelView } from '../src/index.ts';
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
    expect(m.crossings).toBe(0);
    expect(m.maxBendsPerEdge).toBeLessThanOrEqual(4);
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
    expect(cells.filter((c) => c.vertex).length).toBe(layout.nodes.length);
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
