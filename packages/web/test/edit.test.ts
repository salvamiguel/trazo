import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseWorkspace, type WorkspaceSources } from '@trazo/core';
import { addNode, addRelationship, deleteNode, deleteRelationship, freshViewId, renameView, reverseRelationship, setInView, setParent, setPin, updateNode, updateRelationship } from '../src/edit.ts';

const dir = new URL('../../../examples/aws-pagos/', import.meta.url);
const read = (f: string) => readFileSync(new URL(f, dir), 'utf8');
const base: WorkspaceSources = {
  model: read('architecture.calm.yaml'),
  views: { 'infra-aws': read('views/infra-aws.view.yaml'), 'contenedores-c4': read('views/contenedores-c4.view.yaml') },
};

const errorsOf = (s: WorkspaceSources) => parseWorkspace(s).diagnostics.filter((d) => d.level === 'error');
const changedLines = (a: string, b: string) => {
  const x = new Set(a.split('\n'));
  return b.split('\n').filter((l) => !x.has(l));
};

describe('edits on the CALM model', () => {
  it('round-trips the example without touching a line', () => {
    expect(updateNode(base, 'clientes', {}).model).toBe(base.model);
  });

  it('adds an element inside a group and lists it in a view with an include list', () => {
    const { sources, id } = addNode(base, 'contenedores-c4', { name: 'Caché sesiones', 'node-type': 'database', technology: 'ElastiCache', icon: 'aws/elastic-cache' }, 'private-a', 'deployed-in');
    expect(id).toBe('cache-sesiones');
    expect(errorsOf(sources)).toEqual([]);
    const ws = parseWorkspace(sources);
    expect(ws.model.elements.get(id)?.technology).toBe('ElastiCache');
    expect(ws.model.deployedIn.get(id)).toBe('private-a');
    expect(ws.views.find((v) => v.id === 'contenedores-c4')?.include).toContain(id);
    // Nothing else is reformatted: the only existing line that changes is the subnet's list.
    expect(changedLines(sources.model, base.model)).toEqual(['      deployed-in: { container: private-a, nodes: [sg-payments, aurora-writer] }']);
  });

  it('connects elements, with interacts for actors', () => {
    const a = addRelationship(base, 'orders-api', 'cola-pagos', { description: 'Encola', protocol: 'AMQP' });
    expect(errorsOf(a.sources)).toEqual([]);
    const rel = parseWorkspace(a.sources).model.relationships.find((r) => r.id === a.id);
    expect(rel).toMatchObject({ source: 'orders-api', target: 'cola-pagos', description: 'Encola', protocol: 'AMQP' });
    const b = addRelationship(base, 'clientes', 'pasarela');
    expect(b.sources.model).toContain('interacts: { actor: clientes, nodes: [pasarela] }');
  });

  it('updates, reverses and deletes a relationship', () => {
    let s = updateRelationship(base, 'r-repl', { protocol: 'TCP', description: 'Réplica' });
    s = reverseRelationship(s, 'r-repl');
    const rel = parseWorkspace(s).model.relationships.find((r) => r.id === 'r-repl');
    expect(rel).toMatchObject({ source: 'aurora-reader', target: 'aurora-writer', protocol: 'TCP', description: 'Réplica' });
    expect(errorsOf(s)).toEqual([]);
    s = deleteRelationship(s, 'r-repl');
    expect(parseWorkspace(s).model.relationships.some((r) => r.id === 'r-repl')).toBe(false);
  });

  it('updates fields and clears empty metadata', () => {
    const s = updateNode(base, 'secretos', { name: 'Secretos', icon: '' });
    const el = parseWorkspace(s).model.elements.get('secretos');
    expect(el?.name).toBe('Secretos');
    expect(el?.icon).toBeUndefined();
    expect(changedLines(base.model, s.model)).toEqual(['    name: Secretos']);
  });

  it('moves an element between groups and refuses cycles', () => {
    let s = setParent(base, 'payments-api', 'private-b', 'deployed-in');
    let m = parseWorkspace(s).model;
    expect(m.deployedIn.get('payments-api')).toBe('private-b');
    // sg-payments is now empty, so its relationship is gone
    expect(s.model).not.toContain('d-sg-payments');
    s = setParent(s, 'vpc', 'private-b', 'deployed-in');
    m = parseWorkspace(s).model;
    expect(m.deployedIn.get('vpc')).toBe('eu-west-1');
    s = setParent(s, 'payments-api', undefined, 'deployed-in');
    expect(parseWorkspace(s).model.deployedIn.has('payments-api')).toBe(false);
    expect(errorsOf(s)).toEqual([]);
  });

  it('deletes an element, its relationships, and keeps its children', () => {
    const s = deleteNode(base, 'sg-payments');
    const m = parseWorkspace(s).model;
    expect(m.elements.has('sg-payments')).toBe(false);
    expect(m.deployedIn.get('payments-api')).toBe('private-a');
    const t = deleteNode(base, 'payments-api');
    const ws = parseWorkspace(t);
    expect(ws.model.relationships.some((r) => r.source === 'payments-api' || r.target === 'payments-api')).toBe(false);
    expect(ws.views.find((v) => v.id === 'contenedores-c4')?.include).not.toContain('payments-api');
    expect(errorsOf(t)).toEqual([]);
  });
});

describe('views', () => {
  it('shows and hides elements in a view with an include list', () => {
    let s = setInView(base, 'contenedores-c4', 'secretos', true);
    expect(parseWorkspace(s).views.find((v) => v.id === 'contenedores-c4')?.include).toContain('secretos');
    s = setInView(s, 'contenedores-c4', 'secretos', false);
    expect(parseWorkspace(s).views.find((v) => v.id === 'contenedores-c4')?.include).not.toContain('secretos');
    // A view without a list shows everything and is left alone.
    expect(setInView(base, 'infra-aws', 'secretos', false)).toEqual(base);
  });

  it('keeps an emptied view empty instead of showing everything', () => {
    const s = { ...base, views: { solo: 'title: Solo\ninclude: [clientes]\n' } };
    const view = parseWorkspace(setInView(s, 'solo', 'clientes', false)).views[0]!;
    expect(view.includeAll).toBe(false);
    expect(view.include).toEqual([]);
  });

  it('renames a view and finds free ids', () => {
    expect(parseWorkspace(renameView(base, 'infra-aws', 'Red de pagos')).views.find((v) => v.id === 'infra-aws')?.title).toBe('Red de pagos');
    expect(freshViewId(base, 'Infra AWS')).toBe('infra-aws-2');
  });
});

describe('pins', () => {
  const sources = { model: 'nodes: []\nrelationships: []\n', views: { v: 'title: V\nlayout:\n  direction: right\n' } };

  it('writes, replaces and removes layout.pinned in the view', () => {
    let s = setPin(sources, 'v', 'b', { side: 'below', of: 'a' });
    expect(s.views.v).toBe('title: V\nlayout:\n  direction: right\n  pinned:\n    b: { below: a }\n');
    s = setPin(s, 'v', 'b', { side: 'right-of', of: 'c' });
    expect(s.views.v).toContain('b: { right-of: c }');
    s = setPin(s, 'v', 'b', undefined);
    expect(s.views.v).toBe(sources.views.v);
  });

  it('drops pins that mention a deleted element', () => {
    const model = 'nodes:\n  - unique-id: a\n    node-type: service\n    name: A\n    description: ""\nrelationships: []\n';
    let s = setPin({ ...sources, model }, 'v', 'b', { side: 'below', of: 'a' });
    s = setPin(s, 'v', 'c', { side: 'above', of: 'd' });
    const after = deleteNode(s, 'a');
    expect(after.views.v).not.toContain('b:');
    expect(after.views.v).toContain('c: { above: d }');
  });
});
