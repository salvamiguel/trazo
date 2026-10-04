/**
 * Edits on the CALM YAML text, so every change made on the canvas lands in the model
 * the user can read, diff and commit. The yaml Document API keeps comments and styles.
 */
import { isMap, isSeq, parseDocument, type Document, YAMLMap, YAMLSeq } from 'yaml';
import type { GroupStyle, Hierarchy, WorkspaceSources } from '@trazo/core';

export const NODE_TYPES = ['actor', 'system', 'service', 'database', 'network', 'webclient', 'data-asset', 'ecosystem', 'ldap'] as const;
export const PROTOCOLS = ['HTTP', 'HTTPS', 'JDBC', 'AMQP', 'TCP', 'TLS', 'mTLS', 'WebSocket', 'SocketIO', 'LDAP', 'FTP', 'SFTP'] as const;

/** metadata.trazo fields editable from the inspector. */
export interface TrazoFields {
  technology?: string;
  icon?: string;
  'group-style'?: GroupStyle;
  c4?: string;
}

export interface NodeFields extends TrazoFields {
  name?: string;
  description?: string;
  'node-type'?: string;
}

export interface NewNode extends NodeFields {
  name: string;
  'node-type': string;
}

/** No re-wrapping: an edit must only touch the lines it changes. */
const FMT = { lineWidth: 0 } as const;

/** Prints like hand-written CALM: `{ key: value }` maps and `[a, b]` lists. */
function print(doc: Document): string {
  return doc.toString(FMT).replace(/\[ ([^\[\]\n]*?) \]/g, '[$1]');
}

type ContainmentKind = 'deployed-in' | 'composed-of';

export function containmentFor(hierarchy: Hierarchy): ContainmentKind | undefined {
  return hierarchy === 'deployment' ? 'deployed-in' : hierarchy === 'composition' ? 'composed-of' : undefined;
}

function seqOf(doc: Document, key: string): YAMLSeq {
  let seq = doc.get(key);
  if (!isSeq(seq)) {
    seq = new YAMLSeq();
    doc.set(key, seq);
  }
  return seq as YAMLSeq;
}

function items(doc: Document, key: string): YAMLMap[] {
  return seqOf(doc, key).items.filter(isMap) as YAMLMap[];
}

function findNode(doc: Document, id: string): YAMLMap | undefined {
  return items(doc, 'nodes').find((m) => m.get('unique-id') === id);
}

function findRel(doc: Document, id: string): YAMLMap | undefined {
  return items(doc, 'relationships').find((m) => m.get('unique-id') === id);
}

function removeItem(doc: Document, key: string, item: YAMLMap) {
  const seq = seqOf(doc, key);
  seq.items.splice(seq.items.indexOf(item), 1);
}

function typeOf(rel: YAMLMap): { kind: string; body: YAMLMap } | undefined {
  const rt = rel.get('relationship-type');
  if (!isMap(rt)) return undefined;
  const first = rt.items[0];
  const kind = first ? String((first.key as { value?: unknown })?.value ?? first.key) : undefined;
  const body = kind ? rt.get(kind) : undefined;
  return kind && isMap(body) ? { kind, body } : undefined;
}

function strings(seq: unknown): string[] {
  return isSeq(seq) ? seq.items.map((i) => String((i as { value?: unknown })?.value ?? i)) : [];
}

function flowSeq(doc: Document, values: string[]): YAMLSeq {
  const seq = doc.createNode(values) as YAMLSeq;
  seq.flow = true;
  return seq;
}

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'elemento';

/** Every id in use, nodes and relationships alike (CALM ids share one namespace in practice). */
export function usedIds(model: string): Set<string> {
  const doc = parseDocument(model);
  return new Set([...items(doc, 'nodes'), ...items(doc, 'relationships')].map((m) => String(m.get('unique-id'))));
}

function freshId(doc: Document, base: string): string {
  const used = new Set([...items(doc, 'nodes'), ...items(doc, 'relationships')].map((m) => String(m.get('unique-id'))));
  const root = slug(base);
  if (!used.has(root)) return root;
  for (let i = 2; ; i++) if (!used.has(`${root}-${i}`)) return `${root}-${i}`;
}

function trazoMap(doc: Document, node: YAMLMap, create: boolean): YAMLMap | undefined {
  let metadata = node.get('metadata');
  if (isSeq(metadata)) {
    const block = metadata.items.find((b) => isMap(b) && b.has('trazo')) as YAMLMap | undefined;
    if (block) return block.get('trazo') as YAMLMap;
    if (!create) return undefined;
    const fresh = doc.createNode({ trazo: {} }) as YAMLMap;
    metadata.items.push(fresh);
    return fresh.get('trazo') as YAMLMap;
  }
  if (!isMap(metadata)) {
    if (!create) return undefined;
    metadata = doc.createNode({});
    node.set('metadata', metadata);
  }
  let trazo = (metadata as YAMLMap).get('trazo');
  if (!isMap(trazo)) {
    if (!create) return undefined;
    trazo = doc.createNode({});
    (trazo as YAMLMap).flow = true;
    (metadata as YAMLMap).set('trazo', trazo);
  }
  return trazo as YAMLMap;
}

function applyNodeFields(doc: Document, node: YAMLMap, fields: NodeFields) {
  for (const key of ['name', 'description', 'node-type'] as const) {
    if (fields[key] !== undefined) node.set(key, fields[key]);
  }
  for (const key of ['technology', 'icon', 'group-style', 'c4'] as const) {
    if (!(key in fields)) continue;
    const value = fields[key];
    if (value) trazoMap(doc, node, true)!.set(key, value);
    else trazoMap(doc, node, false)?.delete(key);
  }
  // Drop an emptied metadata.trazo so the model stays tidy.
  const metadata = node.get('metadata');
  if (isMap(metadata)) {
    const trazo = metadata.get('trazo');
    if (isMap(trazo) && trazo.items.length === 0) metadata.delete('trazo');
    if (metadata.items.length === 0) node.delete('metadata');
  }
}

/** Parent of `id` through the given containment relationship, if any. */
function parentOf(doc: Document, id: string, kind: ContainmentKind): string | undefined {
  for (const rel of items(doc, 'relationships')) {
    const t = typeOf(rel);
    if (t?.kind === kind && strings(t.body.get('nodes')).includes(id)) return String(t.body.get('container'));
  }
  return undefined;
}

function detach(doc: Document, id: string, kind: ContainmentKind) {
  for (const rel of [...items(doc, 'relationships')]) {
    const t = typeOf(rel);
    if (t?.kind !== kind) continue;
    const nodes = t.body.get('nodes');
    if (!isSeq(nodes)) continue;
    nodes.items = nodes.items.filter((i) => String((i as { value?: unknown })?.value ?? i) !== id);
    if (nodes.items.length === 0) removeItem(doc, 'relationships', rel);
  }
}

function attach(doc: Document, ids: string[], container: string, kind: ContainmentKind) {
  const existing = items(doc, 'relationships').find((rel) => {
    const t = typeOf(rel);
    return t?.kind === kind && String(t.body.get('container')) === container;
  });
  if (existing) {
    const nodes = typeOf(existing)!.body.get('nodes');
    if (isSeq(nodes)) for (const id of ids) nodes.add(doc.createNode(id));
    return;
  }
  const rel = doc.createNode({
    'unique-id': freshId(doc, `${kind === 'deployed-in' ? 'd' : 'c'}-${container}`),
    'relationship-type': { [kind]: { container, nodes: ids } },
  }) as YAMLMap;
  const body = (rel.get('relationship-type') as YAMLMap).get(kind) as YAMLMap;
  body.flow = true;
  seqOf(doc, 'relationships').items.push(rel);
}

function isDescendant(doc: Document, id: string, ancestor: string, kind: ContainmentKind): boolean {
  for (let p = parentOf(doc, id, kind); p; p = parentOf(doc, p, kind)) if (p === ancestor) return true;
  return false;
}

// ---------------------------------------------------------------------------------------
// Public operations: each takes the workspace sources and returns new ones.

export interface AddResult {
  sources: WorkspaceSources;
  id: string;
}

/** Adds an element; nests it in `parent` and lists it in the view when the view has an include list. */
export function addNode(sources: WorkspaceSources, viewId: string, node: NewNode, parent: string | undefined, kind: ContainmentKind | undefined): AddResult {
  const doc = parseDocument(sources.model);
  const id = freshId(doc, node.name);
  const map = doc.createNode({ 'unique-id': id, 'node-type': node['node-type'], name: node.name, description: node.description ?? '' }) as YAMLMap;
  applyNodeFields(doc, map, { technology: node.technology, icon: node.icon, 'group-style': node['group-style'], c4: node.c4 });
  seqOf(doc, 'nodes').items.push(map);
  if (parent && kind) attach(doc, [id], parent, kind);
  return { sources: { model: print(doc), views: includeInView(sources.views, viewId, id) }, id };
}

export function updateNode(sources: WorkspaceSources, id: string, fields: NodeFields): WorkspaceSources {
  const doc = parseDocument(sources.model);
  const node = findNode(doc, id);
  if (!node) return sources;
  applyNodeFields(doc, node, fields);
  return { ...sources, model: print(doc) };
}

/** Moves `id` into `parent` (or to the top level), refusing moves that would create a cycle. */
export function setParent(sources: WorkspaceSources, id: string, parent: string | undefined, kind: ContainmentKind): WorkspaceSources {
  const doc = parseDocument(sources.model);
  if (parent === id || (parent && isDescendant(doc, parent, id, kind))) return sources;
  if (parentOf(doc, id, kind) === parent) return sources;
  detach(doc, id, kind);
  if (parent) attach(doc, [id], parent, kind);
  return { ...sources, model: print(doc) };
}

/** Connects two elements: `interacts` when the source is an actor, `connects` otherwise. */
export function addRelationship(
  sources: WorkspaceSources,
  source: string,
  target: string,
  fields: { description?: string; protocol?: string } = {},
): AddResult {
  const doc = parseDocument(sources.model);
  const id = freshId(doc, `r-${source}-${target}`);
  const actor = findNode(doc, source)?.get('node-type') === 'actor';
  const rel = doc.createNode({
    'unique-id': id,
    ...(fields.description ? { description: fields.description } : {}),
    ...(fields.protocol ? { protocol: fields.protocol } : {}),
    'relationship-type': actor ? { interacts: { actor: source, nodes: [target] } } : { connects: { source: { node: source }, destination: { node: target } } },
  }) as YAMLMap;
  const body = typeOf(rel)!.body;
  body.flow = true;
  seqOf(doc, 'relationships').items.push(rel);
  return { sources: { ...sources, model: print(doc) }, id };
}

export function updateRelationship(sources: WorkspaceSources, id: string, fields: { description?: string; protocol?: string }): WorkspaceSources {
  const doc = parseDocument(sources.model);
  const rel = findRel(doc, id);
  if (!rel) return sources;
  for (const key of ['description', 'protocol'] as const) {
    if (!(key in fields)) continue;
    const value = fields[key];
    if (value) rel.set(key, value);
    else rel.delete(key);
  }
  // Keep unique-id first and relationship-type last, the way the model is written by hand.
  const rt = rel.items.find((p) => String((p.key as { value?: unknown })?.value ?? p.key) === 'relationship-type');
  if (rt) rel.items = [...rel.items.filter((p) => p !== rt), rt];
  return { ...sources, model: print(doc) };
}

/** Swaps the direction of a `connects` relationship. */
export function reverseRelationship(sources: WorkspaceSources, id: string): WorkspaceSources {
  const doc = parseDocument(sources.model);
  const rel = findRel(doc, id);
  const t = rel && typeOf(rel);
  if (!t || t.kind !== 'connects') return sources;
  const src = t.body.get('source');
  t.body.set('source', t.body.get('destination'));
  t.body.set('destination', src);
  return { ...sources, model: print(doc) };
}

export function deleteRelationship(sources: WorkspaceSources, id: string): WorkspaceSources {
  const doc = parseDocument(sources.model);
  const rel = findRel(doc, id);
  if (!rel) return sources;
  removeItem(doc, 'relationships', rel);
  return { ...sources, model: print(doc) };
}

/**
 * Deletes an element and everything that points at it. Its children are not lost:
 * they move up to the deleted element's own container.
 */
export function deleteNode(sources: WorkspaceSources, id: string): WorkspaceSources {
  const doc = parseDocument(sources.model);
  const node = findNode(doc, id);
  if (!node) return sources;
  removeItem(doc, 'nodes', node);

  for (const kind of ['deployed-in', 'composed-of'] as const) {
    const grand = parentOf(doc, id, kind);
    const own = items(doc, 'relationships').find((rel) => {
      const t = typeOf(rel);
      return t?.kind === kind && String(t.body.get('container')) === id;
    });
    const children = own ? strings(typeOf(own)!.body.get('nodes')) : [];
    if (own) removeItem(doc, 'relationships', own);
    detach(doc, id, kind);
    if (grand && children.length) attach(doc, children, grand, kind);
  }

  for (const rel of [...items(doc, 'relationships')]) {
    const t = typeOf(rel);
    if (!t) continue;
    if (t.kind === 'connects') {
      const ends = [t.body.getIn(['source', 'node']), t.body.getIn(['destination', 'node'])].map(String);
      if (ends.includes(id)) removeItem(doc, 'relationships', rel);
    } else if (t.kind === 'interacts') {
      if (String(t.body.get('actor')) === id) {
        removeItem(doc, 'relationships', rel);
        continue;
      }
      const left = strings(t.body.get('nodes')).filter((n) => n !== id);
      if (left.length === 0) removeItem(doc, 'relationships', rel);
      else t.body.set('nodes', flowSeq(doc, left));
    }
  }

  const views = Object.fromEntries(Object.entries(sources.views).map(([v, text]) => [v, excludeFromView(text, id)]));
  return { model: print(doc), views };
}

function includeInView(views: Record<string, string>, viewId: string, id: string): Record<string, string> {
  const text = views[viewId];
  if (text === undefined) return views;
  const doc = parseDocument(text);
  const include = doc.get('include');
  // An empty or missing include list already means "everything".
  if (!isSeq(include) || include.items.length === 0) return views;
  include.add(doc.createNode(id));
  return { ...views, [viewId]: print(doc) };
}

function excludeFromView(text: string, id: string): string {
  const doc = parseDocument(text);
  const include = doc.get('include');
  if (!isSeq(include) || !strings(include).includes(id)) return text;
  include.items = include.items.filter((i) => String((i as { value?: unknown })?.value ?? i) !== id);
  return print(doc);
}
