import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { loadCalm, validateCalm } from '../src/model/calm.ts';
import { projectView } from '../src/model/view.ts';
import { loadWorkspace } from '../src/workspace.ts';
import { presetRules } from '../src/layout/presets.ts';

const EXAMPLE = join(import.meta.dirname, '../../../examples/aws-pagos');

describe('CALM loading', () => {
  it('loads the example as valid CALM 1.2 without diagnostics', () => {
    const ws = loadWorkspace(EXAMPLE);
    expect(ws.diagnostics).toEqual([]);
    expect(ws.model.elements.get('payments-api')).toMatchObject({ technology: 'Spring Boot on EKS', icon: 'aws/eks', c4: 'container' });
    expect(ws.model.deployedIn.get('payments-api')).toBe('private-a');
    expect(ws.model.composedOf.get('payments-api')).toBe('plataforma-pagos');
    expect(ws.views.map((v) => v.id)).toEqual(['contenedores-c4', 'infra-aws']);
  });

  it('reports official schema violations', () => {
    const doc = parse(`nodes:\n  - unique-id: a\n    node-type: service\n    name: A\n`);
    expect(validateCalm(doc).map((d) => d.message).join()).toMatch(/description/);
  });

  it('reports dangling references and double parents', () => {
    const { diagnostics } = loadCalm(`
nodes:
  - { unique-id: a, node-type: service, name: A, description: a }
  - { unique-id: g1, node-type: network, name: G1, description: g }
  - { unique-id: g2, node-type: network, name: G2, description: g }
relationships:
  - unique-id: r1
    relationship-type: { connects: { source: { node: a }, destination: { node: missing } } }
  - unique-id: d1
    relationship-type: { deployed-in: { container: g1, nodes: [a] } }
  - unique-id: d2
    relationship-type: { deployed-in: { container: g2, nodes: [a] } }
`);
    const text = diagnostics.map((d) => d.message).join('\n');
    expect(text).toMatch(/unknown node "missing"/);
    expect(text).toMatch(/both "g1" and "g2"/);
  });

  it('accepts metadata as an array of objects', () => {
    const { model } = loadCalm(`
nodes:
  - unique-id: a
    node-type: service
    name: A
    description: a
    metadata:
      - owner: team-x
      - trazo: { icon: aws/sqs }
`);
    expect(model.elements.get('a')?.icon).toBe('aws/sqs');
  });
});

describe('views', () => {
  const ws = loadWorkspace(EXAMPLE);
  const view = (id: string) => ws.views.find((v) => v.id === id)!;

  it('one model, two hierarchies: deployment nests by subnet, C4 by system', () => {
    const infra = projectView(ws.model, view('infra-aws'));
    expect(infra.parent.get('payments-api')).toBe('private-a');
    expect(infra.elements.some((e) => e.id === 'plataforma-pagos')).toBe(false);

    const c4 = projectView(ws.model, view('contenedores-c4'));
    expect(c4.parent.get('payments-api')).toBe('plataforma-pagos');
    expect(c4.groups.has('vpc')).toBe(false);
    expect(c4.relationships.every((r) => c4.elements.some((e) => e.id === r.source))).toBe(true);
  });

  it('aws-infra preset puts tiers in order: edge, public, private, regional', () => {
    const graph = projectView(ws.model, view('infra-aws'));
    const { partitions, overlays } = presetRules('aws-infra', graph, ws.model);
    expect(partitions?.get('cloudfront')).toBe(0);
    expect(partitions?.get('public-a')).toBe(1);
    expect(partitions?.get('private-b')).toBe(2);
    expect(partitions?.get('cola-pagos')).toBe(3);
    expect(partitions?.get('vpc')).toBe(1);
    expect([...overlays].sort()).toEqual(['az-a', 'az-b']);
  });
});

it('example model file stays valid YAML for any CALM tool', () => {
  const raw = readFileSync(join(EXAMPLE, 'architecture.calm.yaml'), 'utf8');
  expect(validateCalm(parse(raw))).toEqual([]);
});
