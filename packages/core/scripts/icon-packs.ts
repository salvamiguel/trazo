/**
 * Builds the official cloud icon packs into Iconify JSON sets under `packages/core/icons/`:
 *
 *   aws.json    AWS Architecture Icons (services, resources, groups, categories) from `aws-icons`
 *   azure.json  Azure Architecture Icons V24 from `@squinch/pack-azure`
 *   index.json  names, titles and categories of every set, for search without loading the sets
 *   core.json   the always-loaded subset: fallback glyphs, group badges and the curated library icons
 *
 * Run `pnpm --filter @trazo/core icons` after bumping either package. The output is committed so
 * the CLI, tests and the web app need no build step; a scheduled job can re-run this to pick up
 * new AWS or Azure releases.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IconSet, SVG, cleanupSVG, runSVGO } from '@iconify/tools';
import type { IconifyJSON } from '@iconify/types';
import { getIconData } from '@iconify/utils';
import { CORE_GLYPHS, CURATED, GROUP_ICONS, GROUP_ICONS_DARK } from '../src/icons/curated.ts';
import { resolveIconId } from '../src/icons/refs.ts';

const require = createRequire(import.meta.url);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const pkgDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

/** Per-icon search metadata: [title, category]. */
type IndexEntry = [string, string];
type SetIndex = { title: string; license: string; icons: Record<string, IndexEntry>; aliases: Record<string, string> };

function addSvg(set: IconSet, name: string, content: string) {
  const svg = new SVG(content);
  cleanupSVG(svg);
  // Keep shapes and colours exactly as published; only strip editor noise and shorten paths.
  runSVGO(svg, { keepShapes: true });
  set.fromSVG(name, svg);
}

const words = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
/** `AmazonAPIGateway` → `Amazon-API-Gateway`, for the few files published without a <title>. */
const fromFile = (file: string) =>
  file
    .replace(/\.svg$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ---- AWS ---------------------------------------------------------------------------------

/**
 * Short names used in models (`aws/eks`) for the long official names. Anything not listed
 * still works by its official slug (`aws/elastic-kubernetes-service`).
 */
const AWS_ALIASES: Record<string, string> = {
  ec2: 'ec2',
  ecs: 'elastic-container-service',
  eks: 'elastic-kubernetes-service',
  ecr: 'elastic-container-registry',
  s3: 'simple-storage-service',
  glacier: 'simple-storage-service-glacier',
  efs: 'efs',
  ebs: 'elastic-block-store',
  elb: 'elastic-load-balancing',
  alb: 'elastic-load-balancing-application-load-balancer',
  nlb: 'elastic-load-balancing-network-load-balancer',
  'api-gateway': 'api-gateway',
  route53: 'route-53',
  waf: 'waf',
  vpc: 'virtual-private-cloud',
  'nat-gateway': 'vpc-nat-gateway',
  'internet-gateway': 'vpc-internet-gateway',
  'transit-gateway': 'transit-gateway',
  elasticache: 'elasticache',
  'elastic-cache': 'elasticache',
  documentdb: 'documentdb',
  opensearch: 'opensearch-service',
  'open-search': 'opensearch-service',
  msk: 'managed-streaming-for-apache-kafka',
  mq: 'mq',
  sqs: 'simple-queue-service',
  sns: 'simple-notification-service',
  ses: 'simple-email-service',
  iam: 'identity-and-access-management',
  kms: 'key-management-service',
  xray: 'x-ray',
  'step-functions': 'step-functions',
  'certificate-manager': 'certificate-manager',
  config: 'config',
  'lake-formation': 'lake-formation',
  cloudwatch: 'cloudwatch',
  quicksight: 'quick-suite',
  codepipeline: 'codepipeline',
  codebuild: 'codebuild',
  codedeploy: 'codedeploy',
  cognito: 'cognito',
};

function buildAws(): { json: IconifyJSON; index: SetIndex } {
  const root = join(pkgDir('aws-icons'), 'icons');
  const set = new IconSet({ prefix: 'aws', icons: {} });
  const icons: Record<string, IndexEntry> = {};
  const serviceCategory = new Map<string, string>();

  const read = (dir: string) =>
    readdirSync(join(root, dir))
      .filter((f) => f.endsWith('.svg'))
      .sort()
      .map((f) => {
        const content = readFileSync(join(root, dir, f), 'utf8');
        const title = /<title>([^<]*)<\/title>/.exec(content)?.[1];
        return { file: f, content, title: title ?? '', fallback: fromFile(f) };
      });

  // Resources carry their category in the title; services borrow it from their resources.
  const resources = read('resource');
  for (const r of resources) {
    const m = /^Icon-Resource\/([^/]+)\/Res_(.+?)_(?:\d+)(?:_(Light|Dark))?$/.exec(r.title);
    const [, cat, rest, variant] = m ?? [, 'Resources', r.fallback, undefined];
    const service = slug(rest!.split('_')[0]!.replace(/^(AWS|Amazon)-/, ''));
    if (!serviceCategory.has(service)) serviceCategory.set(service, words(cat!));
    const name = slug(rest!.replace(/^(AWS|Amazon)-/, '').replace(/_/g, '-')) + (variant === 'Dark' ? '-dark' : '');
    if (set.exists(name)) continue;
    addSvg(set, name, r.content);
    icons[name] = [words(rest!) + (variant === 'Dark' ? ' (oscuro)' : ''), words(cat!)];
  }

  for (const s of read('architecture-service')) {
    const m = /Arch_(.+?)_\d+$/.exec(s.title);
    const full = m ? m[1]! : s.fallback;
    const name = slug(full.replace(/^(AWS|Amazon)-/, ''));
    // Services win over a resource that happened to take the same slug.
    if (set.exists(name)) set.remove(name);
    addSvg(set, name, s.content);
    icons[name] = [words(full), serviceCategory.get(name) ?? 'Servicios'];
  }

  for (const g of read('architecture-group')) {
    const m = /Icon-Architecture-Group\/\d+\/(.+?)_\d+(?:_(Dark))?$/.exec(g.title);
    const full = m ? m[1]! : g.fallback;
    const name = `group-${slug(full)}${m?.[2] ? '-dark' : ''}`;
    addSvg(set, name, g.content);
    icons[name] = [words(full) + (m?.[2] ? ' (oscuro)' : ''), 'Grupos'];
  }

  for (const c of read('category')) {
    const m = /Category\/\d+\/(.+?)_\d+$/.exec(c.title);
    const full = m ? m[1]! : c.fallback;
    const name = `category-${slug(full)}`;
    addSvg(set, name, c.content);
    icons[name] = [words(full), 'Categorías'];
  }

  const aliases: Record<string, string> = {};
  for (const [alias, target] of Object.entries(AWS_ALIASES)) {
    if (!set.exists(target)) throw new Error(`aws alias ${alias} → ${target}: no such icon`);
    if (alias !== target) {
      set.setAlias(alias, target);
      aliases[alias] = target;
    }
  }
  const json = set.export();
  json.info = {
    name: 'AWS Architecture Icons',
    author: { name: 'Amazon Web Services', url: 'https://aws.amazon.com/architecture/icons/' },
    license: { title: 'AWS architecture icon terms' },
  };
  return { json, index: { title: 'AWS', license: 'AWS architecture icon terms', icons, aliases } };
}

// ---- Azure -------------------------------------------------------------------------------

const AZURE_ALIASES: Record<string, string> = {
  aks: 'kubernetes-services',
  'app-service': 'app-services',
  functions: 'function-apps',
  'function-app': 'function-apps',
  'sql-db': 'sql-database',
  cosmosdb: 'azure-cosmos-db',
  'cosmos-db': 'azure-cosmos-db',
  storage: 'storage-accounts',
  'storage-account': 'storage-accounts',
  'key-vault': 'key-vaults',
  vnet: 'virtual-networks',
  'virtual-network': 'virtual-networks',
  'app-gateway': 'application-gateways',
  'application-gateway': 'application-gateways',
  'load-balancer': 'load-balancers',
  firewall: 'firewalls',
  'front-door': 'front-door-and-cdn-profiles',
  apim: 'api-management-services',
  'api-management': 'api-management-services',
  'service-bus': 'azure-service-bus',
  openai: 'azure-openai',
  redis: 'cache-redis',
  'container-apps': 'worker-container-app',
  'log-analytics': 'log-analytics-workspaces',
  subscription: 'subscriptions',
  'resource-group': 'resource-groups',
  bastion: 'bastions',
  'nat-gateway': 'nat',
  'dns-zone': 'dns-zones',
  'managed-identity': 'entra-managed-identities',
};

function buildAzure(): { json: IconifyJSON; index: SetIndex } {
  const dir = pkgDir('@squinch/pack-azure');
  const pack = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8')) as {
    release: string;
    icons: Record<string, { file: string; title: string; category: string }>;
  };
  const set = new IconSet({ prefix: 'azure', icons: {} });
  const icons: Record<string, IndexEntry> = {};
  for (const [name, meta] of Object.entries(pack.icons).sort(([a], [b]) => a.localeCompare(b))) {
    addSvg(set, name, readFileSync(join(dir, 'icons', meta.file), 'utf8'));
    icons[name] = [meta.title, meta.category];
  }
  const aliases: Record<string, string> = {};
  for (const [alias, target] of Object.entries(AZURE_ALIASES)) {
    if (!set.exists(target)) throw new Error(`azure alias ${alias} → ${target}: no such icon`);
    if (alias === target) continue;
    set.setAlias(alias, target);
    aliases[alias] = target;
  }
  const json = set.export();
  json.info = {
    name: `Azure Architecture Icons ${pack.release}`,
    author: { name: 'Microsoft', url: 'https://learn.microsoft.com/en-us/azure/architecture/icons/' },
    license: { title: 'Microsoft icon terms: architecture diagrams, training and documentation' },
  };
  return { json, index: { title: 'Azure', license: 'Microsoft icon terms', icons, aliases } };
}

// ---- Search index for the bundled Iconify sets -------------------------------------------

function iconifyIndex(pkg: string, title: string): SetIndex {
  const json = JSON.parse(readFileSync(join(pkgDir(pkg), 'icons.json'), 'utf8')) as IconifyJSON & {
    categories?: Record<string, string[]>;
  };
  const category = new Map<string, string>();
  for (const [cat, names] of Object.entries(json.categories ?? {})) for (const n of names) category.set(n, cat);
  const icons: Record<string, IndexEntry> = {};
  for (const name of Object.keys(json.icons)) icons[name] = [words(name), category.get(name) ?? ''];
  const aliases: Record<string, string> = {};
  for (const [name, a] of Object.entries(json.aliases ?? {})) aliases[name] = a.parent;
  return { title, license: json.info?.license.title ?? '', icons, aliases };
}

mkdirSync(OUT, { recursive: true });
const aws = buildAws();
const azure = buildAzure();
writeFileSync(join(OUT, 'aws.json'), JSON.stringify(aws.json));
writeFileSync(join(OUT, 'azure.json'), JSON.stringify(azure.json));
const index = {
  aws: aws.index,
  azure: azure.index,
  logos: iconifyIndex('@iconify-json/logos', 'Logos'),
  tabler: iconifyIndex('@iconify-json/tabler', 'Tabler'),
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

// Core subset: every icon the library shows up front and every glyph the renderer falls back to.
const full: Record<string, IconifyJSON> = {
  aws: aws.json,
  azure: azure.json,
  logos: JSON.parse(readFileSync(join(pkgDir('@iconify-json/logos'), 'icons.json'), 'utf8')),
  tabler: JSON.parse(readFileSync(join(pkgDir('@iconify-json/tabler'), 'icons.json'), 'utf8')),
};
const wanted = [
  ...CORE_GLYPHS,
  ...Object.values(GROUP_ICONS),
  ...Object.values(GROUP_ICONS_DARK),
  ...Object.values(CURATED).flatMap((list) => list.map(([ref]) => resolveIconId(ref))),
] as string[];
const subsets: Record<string, IconifyJSON> = {};
for (const id of new Set(wanted)) {
  const [prefix, name] = id.split(':') as [string, string];
  const src = full[prefix];
  if (!src || !getIconData(src, name)) throw new Error(`core subset: ${id} does not exist`);
  const sub = (subsets[prefix] ??= { prefix, icons: {}, aliases: {}, width: src.width, height: src.height });
  // Copy aliases with their parents, so short names such as aws:eks resolve in the subset too.
  let cur = name;
  while (src.aliases?.[cur]) {
    sub.aliases![cur] = src.aliases[cur]!;
    cur = src.aliases[cur]!.parent;
  }
  sub.icons[cur] = src.icons[cur]!;
}
writeFileSync(join(OUT, 'core.json'), JSON.stringify(Object.values(subsets)));
console.log(`core: ${new Set(wanted).size} icons`);
for (const [prefix, s] of Object.entries(index)) console.log(`${prefix}: ${Object.keys(s.icons).length} icons, ${Object.keys(s.aliases).length} aliases`);
