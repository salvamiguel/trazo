import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseWorkspace, type WorkspaceSources } from '@trazo/core';
import { addNode, addRelationship, deleteNode, deleteRelationship, reverseRelationship, setParent, updateNode, updateRelationship } from '../src/edit.ts';

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
