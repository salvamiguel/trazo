/**
 * Builds the official cloud icon packs into Iconify JSON sets under `packages/core/icons/`:
 *
 *   aws.json    AWS Architecture Icons (services, resources, groups, categories) from `aws-icons`
 *   azure.json  Azure Architecture Icons V24 from `@squinch/pack-azure`
 *   k8s.json    Kubernetes resource and component icons (kubernetes/community) from `@iconify-json/k8s`
 *   cncf.json   logos of CNCF projects and popular Kubernetes controllers, from cncf/artwork and the
 *               projects' own repositories at pinned commits (needs raw.githubusercontent.com)
 *   index.json  names, titles and categories of every set, for search without loading the sets
 *   core.json   the always-loaded subset: fallback glyphs, group badges and the curated library icons
 *
 * Run `pnpm --filter @trazo/core icons` after bumping a package or a pinned commit. The output is committed so
 * the CLI, tests and the web app need no build step; a scheduled job can re-run this to pick up
 * new AWS or Azure releases.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IconSet, SVG, cleanupSVG, runSVGO } from '@iconify/tools';
import type { IconifyJSON } from '@iconify/types';
import { getIconData, iconToSVG } from '@iconify/utils';
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

// ---- Kubernetes ----------------------------------------------------------------------------

/** Official resource icons: title, category and the short names kubectl uses. */
const K8S: Record<string, [title: string, category: string, aliases?: string[]]> = {
  pod: ['Pod', 'Workloads', ['po']],
  deployment: ['Deployment', 'Workloads', ['deploy']],
  replicaset: ['ReplicaSet', 'Workloads', ['rs']],
  statefulset: ['StatefulSet', 'Workloads', ['sts']],
  daemonset: ['DaemonSet', 'Workloads', ['ds']],
  job: ['Job', 'Workloads'],
  cronjob: ['CronJob', 'Workloads', ['cj']],
  horizontalpodautoscaler: ['HorizontalPodAutoscaler', 'Workloads', ['hpa']],
  service: ['Service', 'Red', ['svc']],
  ingress: ['Ingress', 'Red', ['ing']],
  endpoints: ['Endpoints', 'Red', ['ep']],
  networkpolicy: ['NetworkPolicy', 'Red', ['netpol']],
  configmap: ['ConfigMap', 'Configuración', ['cm']],
  secret: ['Secret', 'Configuración'],
  customresourcedefinition: ['CustomResourceDefinition', 'Configuración', ['crd']],
  namespace: ['Namespace', 'Configuración', ['ns']],
  limitrange: ['LimitRange', 'Configuración', ['limits']],
  resourcequota: ['ResourceQuota', 'Configuración', ['quota']],
  persistentvolume: ['PersistentVolume', 'Almacenamiento', ['pv']],
  persistentvolumeclaim: ['PersistentVolumeClaim', 'Almacenamiento', ['pvc']],
  storageclass: ['StorageClass', 'Almacenamiento', ['sc']],
  volume: ['Volume', 'Almacenamiento', ['vol']],
  serviceaccount: ['ServiceAccount', 'Acceso', ['sa']],
  role: ['Role', 'Acceso'],
  rolebinding: ['RoleBinding', 'Acceso', ['rb']],
  clusterrole: ['ClusterRole', 'Acceso', ['c-role']],
  clusterrolebinding: ['ClusterRoleBinding', 'Acceso', ['crb']],
  podsecuritypolicy: ['PodSecurityPolicy', 'Acceso', ['psp']],
  user: ['User', 'Acceso'],
  group: ['Group', 'Acceso'],
  'api-server': ['API server', 'Clúster', ['api']],
  'controller-manager': ['Controller manager', 'Clúster', ['c-m']],
  'cloud-controller-manager': ['Cloud controller manager', 'Clúster', ['c-c-m']],
  scheduler: ['Scheduler', 'Clúster', ['sched']],
  'etcd-cluster': ['etcd', 'Clúster', ['etcd']],
  kubelet: ['kubelet', 'Clúster'],
  'kube-proxy': ['kube-proxy', 'Clúster', ['k-proxy']],
  'worker-node': ['Node', 'Clúster', ['node']],
};

function buildK8s(): { json: IconifyJSON; index: SetIndex } {
  const src = JSON.parse(readFileSync(join(pkgDir('@iconify-json/k8s'), 'icons.json'), 'utf8')) as IconifyJSON;
  const json: IconifyJSON = { prefix: 'k8s', icons: {}, aliases: {}, width: src.width, height: src.height };
  const icons: Record<string, IndexEntry> = {};
  const aliases: Record<string, string> = {};
  for (const [name, [title, category, short = []]] of Object.entries(K8S)) {
    const icon = src.icons[name];
    if (!icon) throw new Error(`k8s: ${name} is not in @iconify-json/k8s`);
    json.icons[name] = icon;
    icons[name] = [title, category];
    for (const a of short) {
      json.aliases![a] = { parent: name };
      aliases[a] = name;
    }
  }
  const missing = Object.keys(src.icons).filter((n) => !K8S[n]);
  if (missing.length) console.warn(`k8s: not listed, left out: ${missing.join(', ')}`);
  json.info = {
    name: 'Kubernetes icons',
    author: { name: 'Kubernetes community', url: 'https://github.com/kubernetes/community/tree/master/icons' },
    license: { title: 'CC BY 4.0', spdx: 'CC-BY-4.0' },
  };
  return { json, index: { title: 'Kubernetes', license: 'CC BY 4.0', icons, aliases } };
}

// ---- Cloud native projects and controllers ------------------------------------------------

/** Repositories the logos come from, pinned so a rebuild is reproducible. */
const REPOS = {
  cncf: 'cncf/artwork/002662490acb2303c7301acc0256c00790e03e9f/projects',
  cncfOther: 'cncf/artwork/002662490acb2303c7301acc0256c00790e03e9f/other',
  eso: 'external-secrets/external-secrets/5c4e28ce42846f0f765adebd028ebb78d9e66d23',
  karpenter: 'aws/karpenter-provider-aws/30c236cafacb3a23fb3a50370d09d71750b56b29',
};

/**
 * name → [title, category, source]. Source is `repo:path` under REPOS, or `devicon:<name>` for
 * projects outside the CNCF that publish no SVG icon of their own.
 */
const CLOUD_NATIVE: Record<string, [title: string, category: string, source: string, recolor?: [from: string, to: string]]> = {
  istio: ['Istio', 'Service mesh', 'cncf:istio/icon/color/istio-icon-color.svg'],
  ztunnel: ['Istio ztunnel', 'Service mesh', 'cncf:istio/ztunnel/icon/color/ztunnel-icon-color.svg'],
  linkerd: ['Linkerd', 'Service mesh', 'cncf:linkerd/icon/color/linkerd-icon-color.svg'],
  envoy: ['Envoy', 'Service mesh', 'cncf:envoy/icon/color/envoy-icon-color.svg'],
  'envoy-gateway': ['Envoy Gateway', 'Ingress y gateways', 'cncf:envoy/envoy-gateway/icon/color/envoy-gateway-icon-color.svg'],
  contour: ['Contour', 'Ingress y gateways', 'cncf:contour/icon/color/contour-icon-color.svg'],
  'emissary-ingress': ['Emissary-ingress', 'Ingress y gateways', 'cncf:emissary-ingress/icon/color/emissary-ingress-icon-color.svg'],
  kgateway: ['kgateway', 'Ingress y gateways', 'cncf:kgateway/icon/color/kgateway-icon-color.svg'],
  traefik: ['Traefik', 'Ingress y gateways', 'devicon:traefikproxy'],
  cilium: ['Cilium', 'Red', 'cncf:cilium/icon/color/cilium_icon-color.svg'],
  coredns: ['CoreDNS', 'Red', 'cncf:coredns/icon/color/coredns-icon-color.svg'],
  metallb: ['MetalLB', 'Red', 'cncf:metallb/icon/color/metallb-icon-color.svg'],
  cni: ['CNI', 'Red', 'cncf:cni/icon/color/cni-icon-color.svg'],
  'cert-manager': ['cert-manager', 'Seguridad', 'cncf:cert-manager/icon/color/cert-manager-icon-color.svg'],
  'external-secrets': ['External Secrets', 'Seguridad', 'eso:assets/eso-round-logo.svg'],
  opa: ['Open Policy Agent', 'Seguridad', 'cncf:open-policy-agent/icon/color/opa-icon-color.svg'],
  kyverno: ['Kyverno', 'Seguridad', 'cncf:kyverno/icon/color/kyverno-icon-color.svg'],
  falco: ['Falco', 'Seguridad', 'cncf:falco/icon/color/falco-icon-color.svg'],
  keycloak: ['Keycloak', 'Seguridad', 'cncf:keycloak/icon/color/keycloak-icon-color.svg'],
  spiffe: ['SPIFFE', 'Seguridad', 'cncf:spiffe/icon/color/spiffe-icon-color.svg'],
  spire: ['SPIRE', 'Seguridad', 'cncf:spire/icon/color/spire-icon-color.svg'],
  kubescape: ['Kubescape', 'Seguridad', 'cncf:kubescape/icon/color/kubescape-icon-color.svg'],
  argo: ['Argo', 'Entrega', 'cncf:argo/icon/color/argo-icon-color.svg'],
  flux: ['Flux', 'Entrega', 'cncf:flux/icon/color/flux-icon-color.svg'],
  flagger: ['Flagger', 'Entrega', 'cncf:flux/flagger/icon/color/flagger-icon-color.svg'],
  helm: ['Helm', 'Entrega', 'cncf:helm/icon/color/helm-icon-color.svg'],
  tekton: ['Tekton', 'Entrega', 'cncf:tekton/icon/color/tekton-icon-color.svg'],
  crossplane: ['Crossplane', 'Entrega', 'cncf:crossplane/icon/color/crossplane-icon-color.svg'],
  kubevela: ['KubeVela', 'Entrega', 'cncf:kubevela/icon/color/kubevela-icon-color.svg'],
  'operator-framework': ['Operator Framework', 'Entrega', 'cncf:operatorframework/icon/color/operatorframework-icon-color.svg'],
  harbor: ['Harbor', 'Entrega', 'cncf:harbor/icon/color/harbor-icon-color.svg'],
  backstage: ['Backstage', 'Entrega', 'cncf:backstage/icon/color/backstage-icon-color.svg'],
  keda: ['KEDA', 'Escalado', 'cncf:keda/icon/print/keda-icon-print.svg'],
  // The repository's icon is white (for its dark site); #5C62B0 is the colour of its full logo.
  karpenter: ['Karpenter', 'Escalado', 'karpenter:website/assets/icons/logo.svg', ['#FFFFFF', '#5C62B0']],
  knative: ['Knative', 'Escalado', 'cncf:knative/icon/color/knative-icon-color.svg'],
  karmada: ['Karmada', 'Escalado', 'cncf:karmada/icon/color/karmada-icon-color.svg'],
  volcano: ['Volcano', 'Escalado', 'cncf:volcano/icon/color/volcano-icon-color.svg'],
  kueue: ['Kueue', 'Escalado', 'cncf:kubernetes/sub-projects/kueue/icon/color/kueue-icon-color.svg'],
  kured: ['Kured', 'Escalado', 'cncf:kured/icon/color/kured-icon-color.svg'],
  prometheus: ['Prometheus', 'Observabilidad', 'cncf:prometheus/icon/color/prometheus-icon-color.svg'],
  thanos: ['Thanos', 'Observabilidad', 'cncf:thanos/icon/color/thanos-icon-color.svg'],
  cortex: ['Cortex', 'Observabilidad', 'cncf:cortex/icon/color/cortex-icon-color.svg'],
  opentelemetry: ['OpenTelemetry', 'Observabilidad', 'cncf:opentelemetry/icon/color/opentelemetry-icon-color.svg'],
  jaeger: ['Jaeger', 'Observabilidad', 'cncf:jaeger/icon/color/jaeger-icon-color.svg'],
  fluentd: ['Fluentd', 'Observabilidad', 'cncf:fluentd/icon/color/fluentd-icon-color.svg'],
  headlamp: ['Headlamp', 'Observabilidad', 'cncf:headlamp/icon/color/headlamp-icon-color.svg'],
  opencost: ['OpenCost', 'Observabilidad', 'cncf:opencost/icon/color/Opencost_Icon_Color.svg'],
  velero: ['Velero', 'Datos', 'cncf:velero/icon/color/velero-icon-color.svg'],
  rook: ['Rook', 'Datos', 'cncf:rook/icon/color/rook-icon-color.svg'],
  longhorn: ['Longhorn', 'Datos', 'cncf:longhorn/icon/color/longhorn-icon-color.svg'],
  strimzi: ['Strimzi', 'Datos', 'cncf:strimzi/icon/color/strimzi-icon-color.svg'],
  vitess: ['Vitess', 'Datos', 'cncf:vitess/icon/color/vitess-icon-color.svg'],
  etcd: ['etcd', 'Datos', 'cncf:etcd/icon/color/etcd-icon-color.svg'],
  nats: ['NATS', 'Datos', 'cncf:nats/icon/color/nats-icon-color.svg'],
  dapr: ['Dapr', 'Datos', 'cncf:dapr/icon/color/dapr-icon-color.svg'],
  containerd: ['containerd', 'Plataforma', 'cncf:containerd/icon/color/containerd-icon-color.svg'],
  'cri-o': ['CRI-O', 'Plataforma', 'cncf:crio/icon/color/crio-icon-color.svg'],
  kubevirt: ['KubeVirt', 'Plataforma', 'cncf:kubevirt/icon/color/kubevirt-icon-color.svg'],
  dragonfly: ['Dragonfly', 'Plataforma', 'cncf:dragonfly/icon/color/dragonfly-icon-color.svg'],
  chaosmesh: ['Chaos Mesh', 'Plataforma', 'cncf:chaosmesh/icon/color/chaosmesh-icon-color.svg'],
  litmus: ['LitmusChaos', 'Plataforma', 'cncf:litmus/icon/color/litmus-icon-color.svg'],
  kserve: ['KServe', 'IA', 'cncf:kserve/icon/color/k-serve-icon-color.svg'],
  'kubeflow-pipelines': ['Kubeflow Pipelines', 'IA', 'cncf:kubeflow-pipelines/icon/color/kubeflow-pipelines-icon-color.svg'],
  'kubeflow-trainer': ['Kubeflow Trainer', 'IA', 'cncf:kubeflow-trainer/icon/color/Kubeflow-Trainer-Logo_icon-color.svg'],
  cncf: ['CNCF', 'Plataforma', 'cncfOther:cncf/icon/color/cncf-icon-color.svg'],
};

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.text();
    if (res.status === 404 || attempt === 4) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

/**
 * Many logos colour their shapes with classes in a <style> block, which the SVG cleanup drops;
 * copy simple class rules (`.a{fill:#fff}`, `.a,.b{…}`) onto the elements as attributes.
 */
function inlineClassStyles(svg: string): string {
  const rules = new Map<string, Array<[string, string]>>();
  for (const [, css] of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const [, selectors, body] of css!.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const decls = body!
        .split(';')
        .map((d) => d.split(':').map((x) => x.trim()) as [string, string])
        .filter(([k, v]) => k && v);
      for (const sel of selectors!.split(',').map((x) => x.trim())) {
        if (/^\.[\w-]+$/.test(sel)) rules.set(sel.slice(1), [...(rules.get(sel.slice(1)) ?? []), ...decls]);
      }
    }
  }
  if (!rules.size) return svg;
  return svg
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<([\w:-]+)([^>]*?)\sclass="([^"]*)"([^>]*)>/g, (_m, tag: string, before: string, cls: string, after: string) => {
      const attrs = new Map<string, string>();
      for (const c of cls.split(/\s+/)) for (const [k, v] of rules.get(c) ?? []) attrs.set(k, v);
      // Attributes already on the element are overridden by class rules, as CSS would.
      let rest = `${before}${after}`;
      for (const k of attrs.keys()) rest = rest.replace(new RegExp(`\\s${k}="[^"]*"`), '');
      const added = [...attrs].map(([k, v]) => ` ${k}="${v}"`).join('');
      return `<${tag}${rest.replace(/\/$/, '')}${added}${rest.endsWith('/') ? '/' : ''}>`;
    });
}

/** Some published logos only set width and height; Iconify needs a viewBox. */
function withViewBox(svg: string): string {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!root || /viewBox=/i.test(root)) return svg;
  const size = (attr: string) => parseFloat(new RegExp(`\\s${attr}="([\\d.]+)`).exec(root)?.[1] ?? '');
  const [w, h] = [size('width'), size('height')];
  if (!w || !h) return svg;
  return svg.replace(root, root.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`));
}

async function buildCloudNative(): Promise<{ json: IconifyJSON; index: SetIndex }> {
  const devicon = JSON.parse(readFileSync(join(pkgDir('@iconify-json/devicon'), 'icons.json'), 'utf8')) as IconifyJSON;
  const set = new IconSet({ prefix: 'cncf', icons: {} });
  const icons: Record<string, IndexEntry> = {};
  const entries = Object.entries(CLOUD_NATIVE);
  const svgs = await Promise.all(
    entries.map(async ([name, [, , source]]) => {
      const [repo, path] = source.split(/:(.*)/) as [string, string];
      if (repo === 'devicon') {
        const data = getIconData(devicon, path);
        if (!data) throw new Error(`cncf ${name}: devicon:${path} does not exist`);
        const { attributes, body } = iconToSVG({ width: devicon.width, height: devicon.height, ...data });
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${attributes.viewBox}">${body}</svg>`;
      }
      return fetchText(`https://raw.githubusercontent.com/${REPOS[repo as keyof typeof REPOS]}/${path}`);
    }),
  );
  entries.forEach(([name, [title, category, , recolor]], i) => {
    try {
      let svg = inlineClassStyles(withViewBox(svgs[i]!));
      if (recolor) svg = svg.replaceAll(recolor[0], recolor[1]);
      addSvg(set, name, svg);
      icons[name] = [title, category];
    } catch (err) {
      // Logos that embed bitmaps or scripts are not usable as vector icons.
      console.warn(`cncf ${name}: skipped, ${err instanceof Error ? err.message : err}`);
    }
  });
  const json = set.export();
  json.info = {
    name: 'Cloud native projects',
    author: { name: 'CNCF and project authors', url: 'https://github.com/cncf/artwork' },
    license: { title: 'Project trademarks; artwork under each project\'s terms (CNCF artwork: CC BY 4.0)' },
  };
  return { json, index: { title: 'Cloud native', license: 'CNCF artwork, CC BY 4.0', icons, aliases: {} } };
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
const k8s = buildK8s();
const cncf = await buildCloudNative();
// No build timestamp, so re-running with the same inputs leaves the committed files untouched.
const writeSet = (file: string, { lastModified: _, ...json }: IconifyJSON) => writeFileSync(join(OUT, file), JSON.stringify(json));
writeSet('aws.json', aws.json);
writeSet('azure.json', azure.json);
writeSet('k8s.json', k8s.json);
writeSet('cncf.json', cncf.json);
const index = {
  aws: aws.index,
  azure: azure.index,
  k8s: k8s.index,
  cncf: cncf.index,
  logos: iconifyIndex('@iconify-json/logos', 'Logos'),
  tabler: iconifyIndex('@iconify-json/tabler', 'Tabler'),
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

// Core subset: every icon the library shows up front and every glyph the renderer falls back to.
const full: Record<string, IconifyJSON> = {
  aws: aws.json,
  azure: azure.json,
  k8s: k8s.json,
  cncf: cncf.json,
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
