/** What the shape library offers: curated entries per category, plus search over every icon. */
import { iconIds, type GroupStyle } from '@trazo/core';

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
}

export interface CatalogSection {
  id: string;
  title: string;
  entries: CatalogEntry[];
}

const shape = (label: string, preview: string, nodeType: string): CatalogEntry => ({ key: `shape:${label}`, label, preview, nodeType });

const group = (label: string, groupStyle: GroupStyle, nodeType: string, preview: string): CatalogEntry => ({
  key: `group:${groupStyle}`,
  label,
  preview,
  nodeType,
  groupStyle,
});

/** A logo from the `logos` set; `ref` is what goes in the model. */
const logo = (label: string, name: string, nodeType = 'service', ref = name): CatalogEntry => ({
  key: `logos:${name}`,
  label,
  icon: ref,
  preview: `logos:${name}`,
  nodeType,
  technology: label,
});

const AWS: Array<[string, string, string?]> = [
  ['lambda', 'Lambda'], ['ec2', 'EC2'], ['ecs', 'ECS'], ['eks', 'EKS'], ['fargate', 'Fargate'],
  ['api-gateway', 'API Gateway'], ['elb', 'Load Balancer'], ['cloudfront', 'CloudFront'], ['route53', 'Route 53'],
  ['waf', 'WAF'], ['shield', 'Shield'], ['vpc', 'VPC'], ['s3', 'S3', 'data-asset'], ['glacier', 'Glacier', 'data-asset'],
  ['rds', 'RDS', 'database'], ['aurora', 'Aurora', 'database'], ['dynamodb', 'DynamoDB', 'database'],
  ['elasticache', 'ElastiCache', 'database'], ['documentdb', 'DocumentDB', 'database'], ['neptune', 'Neptune', 'database'],
  ['redshift', 'Redshift', 'database'], ['keyspaces', 'Keyspaces', 'database'], ['timestream', 'Timestream', 'database'],
  ['sqs', 'SQS'], ['sns', 'SNS'], ['eventbridge', 'EventBridge'], ['kinesis', 'Kinesis'], ['msk', 'MSK'], ['mq', 'Amazon MQ'],
  ['step-functions', 'Step Functions'], ['appsync', 'AppSync'], ['cognito', 'Cognito'], ['iam', 'IAM'], ['kms', 'KMS'],
  ['secrets-manager', 'Secrets Manager'], ['certificate-manager', 'Certificate Manager'], ['cloudwatch', 'CloudWatch'],
  ['cloudtrail', 'CloudTrail'], ['xray', 'X-Ray'], ['systems-manager', 'Systems Manager'], ['config', 'Config'],
  ['athena', 'Athena'], ['glue', 'Glue'], ['lake-formation', 'Lake Formation'], ['quicksight', 'QuickSight'],
  ['open-search', 'OpenSearch'], ['ses', 'SES'], ['codepipeline', 'CodePipeline'], ['codebuild', 'CodeBuild'],
  ['codedeploy', 'CodeDeploy'], ['cloudformation', 'CloudFormation'], ['amplify', 'Amplify'], ['backup', 'Backup'], ['batch', 'Batch'],
];

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
  {
    id: 'groups',
    title: 'Grupos',
    entries: [
      group('AWS Cloud', 'aws-cloud', 'ecosystem', 'tabler:brand-aws'),
      group('Cuenta AWS', 'aws-account', 'ecosystem', 'tabler:user-square'),
      group('Región', 'aws-region', 'ecosystem', 'tabler:flag'),
      group('VPC', 'aws-vpc', 'network', 'tabler:cloud-lock'),
      group('Zona de disponibilidad', 'aws-az', 'network', 'tabler:layout-rows'),
      group('Subnet pública', 'aws-subnet-public', 'network', 'tabler:lock-open'),
      group('Subnet privada', 'aws-subnet-private', 'network', 'tabler:lock'),
      group('Security group', 'aws-security-group', 'network', 'tabler:shield-lock'),
      group('Clúster Kubernetes', 'k8s-cluster', 'system', 'logos:kubernetes'),
      group('Namespace', 'k8s-namespace', 'system', 'tabler:folder'),
      group('Límite de sistema', 'system', 'system', 'tabler:box-margin'),
      group('Grupo', 'generic', 'system', 'tabler:square-dashed'),
    ],
  },
  {
    id: 'aws',
    title: 'AWS',
    entries: AWS.map(([name, label, type]) => logo(label, `aws-${name}`, type, `aws/${name}`)),
  },
  {
    id: 'k8s',
    title: 'Kubernetes y CNCF',
    entries: [
      logo('Kubernetes', 'kubernetes', 'system', 'k8s/kubernetes'),
      logo('Helm', 'helm', 'service', 'cncf/helm'),
      logo('Argo CD', 'argo-icon', 'service', 'cncf/argocd'),
      logo('Flux', 'flux'),
      logo('Docker', 'docker-icon'),
      logo('Prometheus', 'prometheus'),
      logo('Grafana', 'grafana'),
      logo('OpenTelemetry', 'opentelemetry-icon'),
      logo('Envoy', 'envoy-icon'),
      logo('Linkerd', 'linkerd'),
      logo('NGINX', 'nginx'),
      logo('Kong', 'kong-icon'),
    ],
  },
  {
    id: 'ai',
    title: 'IA',
    entries: [
      logo('Claude', 'anthropic-icon', 'service', 'ai/anthropic'),
      logo('OpenAI', 'openai-icon', 'service', 'ai/openai'),
      logo('Gemini', 'google-gemini-icon'),
      logo('Mistral', 'mistral-ai-icon'),
      logo('Hugging Face', 'hugging-face-icon'),
      logo('LangChain', 'langchain-icon'),
      logo('Meta Llama', 'meta-icon'),
      logo('NVIDIA', 'nvidia'),
      logo('PyTorch', 'pytorch-icon'),
      logo('TensorFlow', 'tensorflow'),
    ],
  },
  {
    id: 'iac',
    title: 'IaC y DevOps',
    entries: [
      logo('Terraform', 'terraform-icon', 'service', 'hashicorp/terraform'),
      logo('Vault', 'vault-icon'),
      logo('Consul', 'consul'),
      logo('Nomad', 'nomad-icon'),
      logo('Pulumi', 'pulumi-icon'),
      logo('Ansible', 'ansible'),
      logo('GitHub Actions', 'github-actions'),
      logo('GitLab', 'gitlab-icon'),
      logo('Jenkins', 'jenkins'),
      logo('SonarQube', 'sonarqube'),
    ],
  },
  {
    id: 'data',
    title: 'Datos y mensajería',
    entries: [
      logo('PostgreSQL', 'postgresql', 'database'),
      logo('MySQL', 'mysql-icon', 'database'),
      logo('MongoDB', 'mongodb-icon', 'database'),
      logo('Redis', 'redis', 'database'),
      logo('Cassandra', 'cassandra', 'database'),
      logo('Elasticsearch', 'elasticsearch', 'database'),
      logo('Kafka', 'kafka-icon'),
      logo('RabbitMQ', 'rabbitmq-icon'),
      logo('Snowflake', 'snowflake-icon', 'database'),
      logo('Databricks', 'databricks-icon'),
    ],
  },
  {
    id: 'cloud',
    title: 'Otras nubes y SaaS',
    entries: [
      logo('Azure', 'microsoft-azure', 'ecosystem', 'azure/azure'),
      logo('Google Cloud', 'google-cloud', 'ecosystem'),
      logo('Cloud Run', 'google-cloud-run'),
      logo('Okta', 'okta-icon'),
      logo('Auth0', 'auth0-icon'),
      logo('Datadog', 'datadog-icon'),
      logo('Splunk', 'splunk'),
      logo('Sentry', 'sentry-icon'),
    ],
  },
];

const curated = SECTIONS.flatMap((s) => s.entries);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

let all: CatalogEntry[] | undefined;
/** Every icon in the registry as an entry, built on first search. */
function everything(): CatalogEntry[] {
  if (all) return all;
  const seen = new Set(curated.map((e) => e.preview));
  const extra = iconIds()
    .filter((id) => !seen.has(id))
    .map((id): CatalogEntry => {
      const name = id.split(':')[1]!;
      const label = name.replace(/-icon$/, '').replace(/-/g, ' ');
      return { key: id, label, icon: id, preview: id, nodeType: 'service', technology: id.startsWith('logos:') ? label : undefined };
    });
  all = [...curated, ...extra];
  return all;
}

/** Curated matches first, then the rest of the registry; brand logos before generic glyphs. */
export function searchCatalog(query: string, limit = 60): CatalogEntry[] {
  const q = norm(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/);
  const score = (e: CatalogEntry) => {
    const hay = norm(`${e.label} ${e.preview}`);
    if (!words.every((w) => hay.includes(w))) return -1;
    let s = curated.includes(e) ? 100 : 0;
    if (norm(e.label).startsWith(q)) s += 20;
    if (e.preview.startsWith('logos:')) s += 10;
    return s;
  };
  return everything()
    .map((e) => [score(e), e] as const)
    .filter(([s]) => s >= 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map(([, e]) => e);
}
