import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse as parseYaml } from 'yaml';
import type { Diagnostic, Element, GroupStyle, Model, Relationship } from './types.ts';

/** Namespace for Trazo-specific fields inside CALM `metadata`. */
export const TRAZO_NS = 'trazo';

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../schemas/calm-1.2');
const SCHEMA_FILES = ['calm', 'core', 'interface', 'control', 'flow', 'evidence', 'units'];

let validator: ReturnType<Ajv2020['compile']> | undefined;

function getValidator() {
  if (validator) return validator;
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  let root: object | undefined;
  for (const name of SCHEMA_FILES) {
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, `${name}.json`), 'utf8'));
    if (name === 'calm') root = schema;
    else ajv.addSchema(schema);
  }
  validator = ajv.compile(root!);
  return validator;
}

/** Validates a parsed document against the official CALM 1.2 meta-schema. */
export function validateCalm(doc: unknown): Diagnostic[] {
  const validate = getValidator();
  if (validate(doc)) return [];
  return (validate.errors ?? []).map((e) => ({
    level: 'error' as const,
    message: `CALM schema: ${e.instancePath || '/'} ${e.message ?? ''}`.trim(),
  }));
}

type Json = Record<string, unknown>;

/** CALM allows metadata as an object or as an array of objects. */
function trazoMeta(metadata: unknown): Json {
  const blocks = Array.isArray(metadata) ? metadata : metadata ? [metadata] : [];
  const merged: Json = {};
  for (const block of blocks) {
    const ns = (block as Json)?.[TRAZO_NS];
    if (ns && typeof ns === 'object') Object.assign(merged, ns);
  }
  return merged;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export interface LoadResult {
  model: Model;
  diagnostics: Diagnostic[];
}

export function loadCalm(text: string): LoadResult {
  const doc = parseYaml(text) as Json;
  const diagnostics = validateCalm(doc);
  const model: Model = {
    elements: new Map(),
    relationships: [],
    deployedIn: new Map(),
    composedOf: new Map(),
  };

  for (const raw of (doc.nodes as Json[] | undefined) ?? []) {
    const id = str(raw['unique-id']);
    if (!id) continue;
    const meta = trazoMeta(raw.metadata);
    const element: Element = {
      id,
      name: str(raw.name) ?? id,
      description: str(raw.description),
      nodeType: str(raw['node-type']) ?? 'service',
      technology: str(meta.technology),
      icon: str(meta.icon),
      c4: str(meta.c4) as Element['c4'],
      groupStyle: str(meta['group-style']) as GroupStyle | undefined,
      tier: typeof meta.tier === 'number' ? meta.tier : undefined,
    };
    if (model.elements.has(id)) {
      diagnostics.push({ level: 'error', message: `Duplicate node unique-id "${id}"` });
    }
    model.elements.set(id, element);
  }

  const known = (id: string, where: string) => {
    if (model.elements.has(id)) return true;
    diagnostics.push({ level: 'error', message: `${where} references unknown node "${id}"` });
    return false;
  };

  const setParent = (map: Map<string, string>, kind: string, container: string, nodes: string[]) => {
    if (!known(container, kind)) return;
    for (const child of nodes) {
      if (!known(child, kind)) continue;
      const previous = map.get(child);
      if (previous && previous !== container) {
        diagnostics.push({
          level: 'warning',
          message: `"${child}" is ${kind} both "${previous}" and "${container}"; using "${previous}"`,
        });
        continue;
      }
      map.set(child, container);
    }
  };

  for (const raw of (doc.relationships as Json[] | undefined) ?? []) {
    const id = str(raw['unique-id']) ?? `rel-${model.relationships.length}`;
    const type = (raw['relationship-type'] ?? {}) as Json;
    const meta = trazoMeta(raw.metadata);
    const description = str(raw.description) ?? str(meta.label);
    const protocol = str(raw.protocol) ?? str(meta.protocol);

    if (type.connects) {
      const c = type.connects as Json;
      const source = str((c.source as Json)?.node);
      const target = str((c.destination as Json)?.node);
      if (source && target && known(source, id) && known(target, id)) {
        model.relationships.push({ id, source, target, description, protocol });
      }
    } else if (type.interacts) {
      const i = type.interacts as Json;
      const actor = str(i.actor);
      const nodes = (i.nodes as string[] | undefined) ?? [];
      if (actor && known(actor, id)) {
        nodes.forEach((target, n) => {
          if (known(target, id)) {
            const rel: Relationship = { id: nodes.length > 1 ? `${id}#${n}` : id, source: actor, target, description, protocol };
            model.relationships.push(rel);
          }
        });
      }
    } else if (type['deployed-in']) {
      const d = type['deployed-in'] as Json;
      setParent(model.deployedIn, 'deployed-in', str(d.container) ?? '', (d.nodes as string[]) ?? []);
    } else if (type['composed-of']) {
      const d = type['composed-of'] as Json;
      setParent(model.composedOf, 'composed-of', str(d.container) ?? '', (d.nodes as string[]) ?? []);
    }
  }

  for (const [label, map] of [['deployed-in', model.deployedIn], ['composed-of', model.composedOf]] as const) {
    for (const start of map.keys()) {
      const seen = new Set<string>();
      for (let cur: string | undefined = start; cur; cur = map.get(cur)) {
        if (seen.has(cur)) {
          diagnostics.push({ level: 'error', message: `Cycle in ${label} hierarchy at "${start}"` });
          map.delete(start);
          break;
        }
        seen.add(cur);
      }
    }
  }

  return { model, diagnostics };
}
