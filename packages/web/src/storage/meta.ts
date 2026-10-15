/** Reads what the catalog shows about an architecture from its CALM model. */
import { parse } from 'yaml';
import type { ArchitectureMeta } from './types.ts';

type Json = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** `metadata.trazo` at the top of the model; CALM allows metadata as an object or a list of them. */
function trazoMeta(doc: Json): Json {
  const blocks = Array.isArray(doc.metadata) ? doc.metadata : doc.metadata ? [doc.metadata] : [];
  for (const b of blocks) {
    const t = (b as Json | undefined)?.trazo;
    if (t && typeof t === 'object') return t as Json;
  }
  return {};
}

/** `pagos-aws` → `Pagos aws`, for architectures with no title. */
export const titleFromPath = (path: string) => {
  const last = path.split('/').filter(Boolean).pop() ?? path;
  const words = last.replace(/[-_]+/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'Sin título';
};

export function architectureMeta(model: string, views: number, path: string): ArchitectureMeta {
  let doc: Json = {};
  try {
    const parsed = parse(model);
    if (parsed && typeof parsed === 'object') doc = parsed as Json;
  } catch {
    /* an invalid model still gets a card, titled after its folder */
  }
  const t = trazoMeta(doc);
  const tags = Array.isArray(t.tags) ? t.tags.map(str).filter((x): x is string => !!x) : str(t.tags)?.split(/\s*,\s*/) ?? [];
  // Without a title, a leading "# Title: description" comment line is the next best thing.
  const comment = /^#\s*([^:\n]+?)(?::\s*(.+))?$/m.exec(model.split('\n').find((l) => l.startsWith('#')) ?? '');
  return {
    title: str(t.title) ?? str(doc.name) ?? comment?.[1]?.trim() ?? titleFromPath(path),
    description: str(t.description) ?? str(doc.description) ?? comment?.[2]?.trim(),
    owner: str(t.owner),
    domain: str(t.domain),
    status: str(t.status),
    tags,
    elements: Array.isArray(doc.nodes) ? doc.nodes.length : 0,
    views,
  };
}
