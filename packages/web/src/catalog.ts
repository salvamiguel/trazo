/** What the shape library offers: curated entries per category, plus search over every icon. */
import { CURATED, GROUP_ICONS, resolveIconId, type CuratedIcon, type GroupStyle, type IconIndex } from '@trazo/core';

export interface CatalogEntry {
  key: string;
  label: string;
  /** Trazo icon reference written to metadata.trazo.icon (omitted for plain shapes). */
  icon?: string;
  /** Icon drawn in the library (for groups, the badge icon). */
  preview: string;
  nodeType: string;
  technology?: string;
  groupStyle?: GroupStyle;
  /** Shown under the label in search results (pack and category). */
  hint?: string;
}

export interface CatalogSection {
  id: string;
  title: string;
  entries: CatalogEntry[];
}

/** Group styles with their labels, in the order the inspector lists them. */
export const GROUP_STYLES: Array<[GroupStyle, string, nodeType: string]> = [
  ['aws-cloud', 'AWS Cloud', 'ecosystem'],
  ['aws-account', 'Cuenta AWS', 'ecosystem'],
  ['aws-region', 'Región AWS', 'ecosystem'],
  ['aws-vpc', 'VPC', 'network'],
  ['aws-az', 'Zona de disponibilidad AWS', 'network'],
  ['aws-subnet-public', 'Subnet pública', 'network'],
  ['aws-subnet-private', 'Subnet privada', 'network'],
  ['aws-security-group', 'Security group', 'network'],
  ['azure-management-group', 'Grupo de administración', 'ecosystem'],
  ['azure-subscription', 'Suscripción Azure', 'ecosystem'],
  ['azure-resource-group', 'Grupo de recursos', 'ecosystem'],
  ['azure-region', 'Región Azure', 'ecosystem'],
  ['azure-vnet', 'Red virtual (VNet)', 'network'],
  ['azure-subnet', 'Subred Azure', 'network'],
  ['azure-az', 'Zona de disponibilidad Azure', 'network'],
  ['k8s-cluster', 'Clúster Kubernetes', 'system'],
  ['k8s-namespace', 'Namespace', 'system'],
  ['system', 'Límite de sistema', 'system'],
  ['generic', 'Grupo', 'system'],
];

/** Badge-less groups still need a picture in the library. */
const GROUP_PREVIEW: Partial<Record<GroupStyle, string>> = {
  'aws-az': 'tabler:layout-rows',
  'azure-az': 'tabler:layout-rows',
  system: 'tabler:box-margin',
  generic: 'tabler:square-dashed',
};

const shape = (label: string, preview: string, nodeType: string): CatalogEntry => ({ key: `shape:${label}`, label, preview, nodeType });

const groups = (prefix: string): CatalogEntry[] =>
  GROUP_STYLES.filter(([style]) => (prefix ? style.startsWith(prefix) : !/^(aws|azure)-/.test(style))).map(([style, label, nodeType]) => ({
    key: `group:${style}`,
    label,
    preview: GROUP_PREVIEW[style] ?? GROUP_ICONS[style] ?? 'tabler:square-dashed',
    nodeType,
    groupStyle: style,
  }));

const icon = ([ref, label, nodeType = 'service']: CuratedIcon): CatalogEntry => ({
  key: resolveIconId(ref),
  label,
  icon: ref,
  preview: ref,
  nodeType,
  technology: label,
});

export const SECTIONS: CatalogSection[] = [
  {
    id: 'basic',
    title: 'Básicos',
    entries: [
      shape('Persona', 'tabler:user', 'actor'),
      shape('Sistema', 'tabler:box', 'system'),
      shape('Servicio', 'tabler:server', 'service'),
      shape('Base de datos', 'tabler:database', 'database'),
      shape('App web', 'tabler:browser', 'webclient'),
      shape('App móvil', 'tabler:device-mobile', 'webclient'),
      shape('Datos', 'tabler:file', 'data-asset'),
      shape('Red', 'tabler:network', 'network'),
      shape('Sistema externo', 'tabler:world', 'system'),
    ],
  },
  { id: 'groups', title: 'Grupos', entries: groups('') },
  { id: 'aws', title: 'AWS', entries: CURATED.aws.map(icon) },
  { id: 'groups-aws', title: 'Grupos AWS', entries: groups('aws-') },
  { id: 'azure', title: 'Azure', entries: CURATED.azure.map(icon) },
  { id: 'groups-azure', title: 'Grupos Azure', entries: groups('azure-') },
  { id: 'k8s', title: 'Kubernetes', entries: CURATED.k8s.map(icon) },
  { id: 'cncf', title: 'Controladores y CNCF', entries: CURATED.cncf.map(icon) },
  { id: 'ai', title: 'IA', entries: CURATED.ai.map(icon) },
  { id: 'iac', title: 'IaC y DevOps', entries: CURATED.iac.map(icon) },
  { id: 'data', title: 'Datos y mensajería', entries: CURATED.data.map(icon) },
  { id: 'cloud', title: 'Otras nubes y SaaS', entries: CURATED.cloud.map(icon) },
];

const curated = SECTIONS.flatMap((s) => s.entries);
const curatedKeys = new Set(curated.map((e) => e.key));
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const PACK: Record<string, string> = { aws: 'AWS', azure: 'Azure', k8s: 'Kubernetes', cncf: 'Cloud native', logos: 'Logo', tabler: 'Glifo' };
const NODE_TYPE_BY_CATEGORY: Record<string, string> = {
  Almacenamiento: 'data-asset',
  Database: 'database',
  Databases: 'database',
  Storage: 'data-asset',
  Networking: 'network',
  'Networking Content Delivery': 'network',
};

interface Searchable {
  entry: CatalogEntry;
  /** Normalised text matched against the query: label, aliases, pack, category. */
  hay: string;
  rank: number;
}

let searchable: Searchable[] | undefined;
let builtFrom: IconIndex | undefined;

/** Every icon of every pack as a searchable entry, built once the index has loaded. */
function everything(index: IconIndex | undefined): Searchable[] {
  if (searchable && builtFrom === index) return searchable;
  // Curated entries may use a short alias (aws:eks, k8s:pvc): map those to the indexed icon.
  const indexed = new Map<string, { title: string; category: string; aliases: string[] }>();
  for (const [prefix, set] of Object.entries(index ?? {})) {
    for (const [name, [title, category]] of Object.entries(set.icons)) indexed.set(`${prefix}:${name}`, { title, category, aliases: [] });
    for (const [alias, target] of Object.entries(set.aliases)) {
      const t = indexed.get(`${prefix}:${target}`);
      if (!t) continue;
      t.aliases.push(alias);
      indexed.set(`${prefix}:${alias}`, t);
    }
  }
  const covered = new Set<object>();
  const list: Searchable[] = curated.map((entry) => {
    const meta = indexed.get(entry.key);
    if (meta) covered.add(meta);
    const extra = meta ? `${meta.title} ${meta.category} ${meta.aliases.join(' ')}` : '';
    return { entry, hay: norm(`${entry.label} ${entry.preview} ${entry.icon ?? ''} ${extra}`), rank: 100 };
  });
  for (const [prefix, set] of Object.entries(index ?? {})) {
    const official = prefix === 'aws' || prefix === 'azure' || prefix === 'k8s' || prefix === 'cncf';
    for (const [name, [title, category]] of Object.entries(set.icons)) {
      const id = `${prefix}:${name}`;
      const meta = indexed.get(id)!;
      if (curatedKeys.has(id) || covered.has(meta)) continue;
      // Tiles are narrow: "Amazon SageMaker Canvas" shows as "SageMaker Canvas" (full name in the tooltip).
      const label = prefix === 'logos' ? title.replace(/ icon$/, '') : prefix === 'aws' ? title.replace(/^(Amazon|AWS) /, '') : title;
      const ref = official ? `${prefix}/${name}` : id;
      list.push({
        entry: {
          key: id,
          label,
          icon: ref,
          preview: id,
          nodeType: NODE_TYPE_BY_CATEGORY[category] ?? 'service',
          technology: prefix === 'tabler' ? undefined : label,
          hint: [title !== label ? title : '', PACK[prefix] ?? prefix, category].filter(Boolean).join(' · '),
        },
        hay: norm(`${title} ${name} ${meta.aliases.join(' ')} ${PACK[prefix] ?? ''} ${prefix} ${category}`),
        rank: official ? 15 : prefix === 'logos' ? 10 : 0,
      });
    }
  }
  searchable = list;
  builtFrom = index;
  return list;
}

/**
 * Curated matches first, then the official AWS and Azure packs, brand logos and generic glyphs.
 * Without the index (still loading) only the curated entries are searched.
 */
export function searchCatalog(query: string, index?: IconIndex, limit = 60): CatalogEntry[] {
  const q = norm(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: Array<[number, CatalogEntry]> = [];
  for (const { entry, hay, rank } of everything(index)) {
    if (!words.every((w) => hay.includes(w))) continue;
    const label = norm(entry.label);
    let s = rank;
    if (label === q) s += 40;
    else if (label.startsWith(q)) s += 20;
    else if (hay.split(' ').includes(q)) s += 25;
    scored.push([s, entry]);
  }
  return scored
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map(([, e]) => e);
}
