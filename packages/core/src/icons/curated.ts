/**
 * The icons the shape library offers up front, per section. They are also bundled in the
 * always-loaded core icon subset (`icons/core.json`), so the library and most diagrams draw
 * without fetching a whole icon set. Each entry: [model reference, label, CALM node-type].
 */
export type CuratedIcon = [ref: string, label: string, nodeType?: string];

export const CURATED: Record<'aws' | 'azure' | 'k8s' | 'cncf' | 'ai' | 'iac' | 'data' | 'cloud', CuratedIcon[]> = {
  aws: [
    ['aws/lambda', 'Lambda'], ['aws/ec2', 'EC2'], ['aws/ecs', 'ECS'], ['aws/eks', 'EKS'], ['aws/fargate', 'Fargate'],
    ['aws/ecr', 'ECR'], ['aws/api-gateway', 'API Gateway'], ['aws/alb', 'Application Load Balancer'],
    ['aws/nlb', 'Network Load Balancer'], ['aws/elb', 'Elastic Load Balancing'], ['aws/cloudfront', 'CloudFront'],
    ['aws/route53', 'Route 53'], ['aws/waf', 'WAF'], ['aws/shield', 'Shield'], ['aws/vpc', 'VPC', 'network'],
    ['aws/nat-gateway', 'NAT Gateway', 'network'], ['aws/internet-gateway', 'Internet Gateway', 'network'],
    ['aws/transit-gateway', 'Transit Gateway', 'network'], ['aws/s3', 'S3', 'data-asset'],
    ['aws/glacier', 'S3 Glacier', 'data-asset'], ['aws/efs', 'EFS', 'data-asset'], ['aws/rds', 'RDS', 'database'],
    ['aws/aurora', 'Aurora', 'database'], ['aws/dynamodb', 'DynamoDB', 'database'], ['aws/elasticache', 'ElastiCache', 'database'],
    ['aws/documentdb', 'DocumentDB', 'database'], ['aws/neptune', 'Neptune', 'database'], ['aws/redshift', 'Redshift', 'database'],
    ['aws/opensearch', 'OpenSearch', 'database'], ['aws/sqs', 'SQS'], ['aws/sns', 'SNS'], ['aws/eventbridge', 'EventBridge'],
    ['aws/kinesis', 'Kinesis'], ['aws/msk', 'MSK'], ['aws/mq', 'Amazon MQ'], ['aws/step-functions', 'Step Functions'],
    ['aws/appsync', 'AppSync'], ['aws/bedrock', 'Bedrock'], ['aws/sagemaker', 'SageMaker'], ['aws/cognito', 'Cognito'],
    ['aws/iam', 'IAM'], ['aws/kms', 'KMS'], ['aws/secrets-manager', 'Secrets Manager'],
    ['aws/certificate-manager', 'Certificate Manager'], ['aws/cloudwatch', 'CloudWatch'], ['aws/cloudtrail', 'CloudTrail'],
    ['aws/xray', 'X-Ray'], ['aws/systems-manager', 'Systems Manager'], ['aws/athena', 'Athena'], ['aws/glue', 'Glue'],
    ['aws/lake-formation', 'Lake Formation'], ['aws/quicksight', 'Quick Suite'], ['aws/ses', 'SES'],
    ['aws/codepipeline', 'CodePipeline'], ['aws/codebuild', 'CodeBuild'], ['aws/cloudformation', 'CloudFormation'],
    ['aws/amplify', 'Amplify'], ['aws/backup', 'Backup'], ['aws/batch', 'Batch'], ['aws/users', 'Usuarios', 'actor'],
    ['aws/client', 'Cliente', 'webclient'], ['aws/mobile-client', 'Cliente móvil', 'webclient'],
  ],
  azure: [
    ['azure/app-service', 'App Service'], ['azure/functions', 'Functions'], ['azure/aks', 'AKS'],
    ['azure/container-apps', 'Container Apps'], ['azure/container-instances', 'Container Instances'],
    ['azure/container-registries', 'Container Registry'], ['azure/virtual-machine', 'Virtual Machine'],
    ['azure/front-door', 'Front Door'], ['azure/app-gateway', 'Application Gateway'], ['azure/load-balancer', 'Load Balancer'],
    ['azure/firewall', 'Firewall'], ['azure/vnet', 'Virtual Network', 'network'], ['azure/nat-gateway', 'NAT', 'network'],
    ['azure/bastion', 'Bastion', 'network'], ['azure/dns-zone', 'DNS', 'network'], ['azure/apim', 'API Management'],
    ['azure/sql-db', 'SQL Database', 'database'], ['azure/cosmosdb', 'Cosmos DB', 'database'],
    ['azure/azure-database-postgresql-server', 'PostgreSQL', 'database'], ['azure/redis', 'Cache for Redis', 'database'],
    ['azure/storage-account', 'Storage Account', 'data-asset'], ['azure/service-bus', 'Service Bus'],
    ['azure/event-hubs', 'Event Hubs'], ['azure/event-grid-topics', 'Event Grid'], ['azure/openai', 'Azure OpenAI'],
    ['azure/ai-foundry', 'AI Foundry'], ['azure/key-vault', 'Key Vault'], ['azure/managed-identity', 'Managed Identity'],
    ['azure/users', 'Usuarios', 'actor'], ['azure/monitor', 'Monitor'], ['azure/log-analytics', 'Log Analytics'],
    ['azure/application-insights', 'Application Insights'],
  ],
  k8s: [
    ['k8s/kubernetes', 'Kubernetes', 'system'], ['k8s/pod', 'Pod'], ['k8s/deployment', 'Deployment'],
    ['k8s/statefulset', 'StatefulSet'], ['k8s/daemonset', 'DaemonSet'], ['k8s/replicaset', 'ReplicaSet'], ['k8s/job', 'Job'],
    ['k8s/cronjob', 'CronJob'], ['k8s/hpa', 'HPA'], ['k8s/service', 'Service'],
    ['k8s/ingress', 'Ingress'], ['k8s/netpol', 'NetworkPolicy', 'network'], ['k8s/endpoints', 'Endpoints', 'network'],
    ['k8s/configmap', 'ConfigMap', 'data-asset'], ['k8s/secret', 'Secret', 'data-asset'], ['k8s/pvc', 'PVC', 'data-asset'],
    ['k8s/pv', 'PV', 'data-asset'], ['k8s/storageclass', 'StorageClass', 'data-asset'],
    ['k8s/serviceaccount', 'ServiceAccount', 'actor'], ['k8s/role', 'Role'], ['k8s/rolebinding', 'RoleBinding'],
    ['k8s/crd', 'CRD'], ['k8s/namespace', 'Namespace', 'system'], ['k8s/node', 'Node'],
    ['k8s/api-server', 'API server'], ['k8s/etcd', 'etcd', 'database'], ['k8s/scheduler', 'Scheduler'],
    ['k8s/controller-manager', 'Controller manager'], ['k8s/kubelet', 'kubelet'], ['k8s/kube-proxy', 'kube-proxy'],
  ],
  cncf: [
    ['cncf/istio', 'Istio'], ['cncf/linkerd', 'Linkerd'], ['cncf/envoy', 'Envoy'], ['cncf/cilium', 'Cilium', 'network'],
    ['cncf/ingress-nginx', 'Ingress NGINX'], ['cncf/traefik', 'Traefik'], ['cncf/envoy-gateway', 'Envoy Gateway'],
    ['kong-icon', 'Kong'], ['cncf/contour', 'Contour'], ['cncf/emissary-ingress', 'Emissary-ingress'],
    ['cncf/cert-manager', 'cert-manager'], ['cncf/external-secrets', 'External Secrets'], ['vault-icon', 'Vault'],
    ['cncf/opa', 'OPA Gatekeeper'], ['cncf/kyverno', 'Kyverno'], ['cncf/falco', 'Falco'], ['cncf/argo', 'Argo CD'],
    ['cncf/flux', 'Flux'], ['cncf/helm', 'Helm'], ['cncf/crossplane', 'Crossplane'], ['cncf/tekton', 'Tekton'],
    ['cncf/keda', 'KEDA'], ['cncf/karpenter', 'Karpenter'], ['cncf/knative', 'Knative'], ['cncf/prometheus', 'Prometheus'],
    ['grafana', 'Grafana'], ['cncf/opentelemetry', 'OpenTelemetry'], ['cncf/jaeger', 'Jaeger'], ['cncf/fluentd', 'Fluentd'],
    ['cncf/thanos', 'Thanos'], ['cncf/velero', 'Velero'], ['cncf/coredns', 'CoreDNS', 'network'],
    ['cncf/metallb', 'MetalLB', 'network'], ['cncf/harbor', 'Harbor'], ['cncf/strimzi', 'Strimzi'], ['cncf/dapr', 'Dapr'],
    ['cncf/backstage', 'Backstage'], ['cncf/kserve', 'KServe'], ['docker-icon', 'Docker'], ['cncf/containerd', 'containerd'],
  ],
  ai: [
    ['ai/anthropic', 'Claude'], ['ai/openai', 'OpenAI'], ['google-gemini-icon', 'Gemini'], ['mistral-ai-icon', 'Mistral'],
    ['hugging-face-icon', 'Hugging Face'], ['langchain-icon', 'LangChain'], ['meta-icon', 'Meta Llama'], ['nvidia', 'NVIDIA'],
    ['pytorch-icon', 'PyTorch'], ['tensorflow', 'TensorFlow'],
  ],
  iac: [
    ['hashicorp/terraform', 'Terraform'], ['vault-icon', 'Vault'], ['consul', 'Consul'], ['nomad-icon', 'Nomad'],
    ['pulumi-icon', 'Pulumi'], ['ansible', 'Ansible'], ['github-icon', 'GitHub'], ['github-actions', 'GitHub Actions'],
    ['gitlab-icon', 'GitLab'], ['bitbucket', 'Bitbucket'], ['azure/azure-devops', 'Azure DevOps'],
    ['jenkins', 'Jenkins'], ['sonarqube', 'SonarQube'],
  ],
  data: [
    ['postgresql', 'PostgreSQL', 'database'], ['mysql-icon', 'MySQL', 'database'], ['mongodb-icon', 'MongoDB', 'database'],
    ['redis', 'Redis', 'database'], ['cassandra', 'Cassandra', 'database'], ['elasticsearch', 'Elasticsearch', 'database'],
    ['kafka-icon', 'Kafka'], ['rabbitmq-icon', 'RabbitMQ'], ['snowflake-icon', 'Snowflake', 'database'],
    ['databricks-icon', 'Databricks'],
  ],
  cloud: [
    ['google-cloud', 'Google Cloud', 'ecosystem'], ['google-cloud-run', 'Cloud Run'], ['okta-icon', 'Okta'],
    ['auth0-icon', 'Auth0'], ['datadog-icon', 'Datadog'], ['splunk', 'Splunk'], ['sentry-icon', 'Sentry'],
  ],
};

/**
 * Header icon per group style, as in the AWS and Azure architecture guidelines (availability
 * zones and generic groups have none). `metadata.trazo.icon` on the group overrides it.
 */
export const GROUP_ICONS: Partial<Record<string, string>> = {
  'aws-cloud': 'aws:group-aws-cloud-logo',
  'aws-account': 'aws:group-aws-account',
  'aws-region': 'aws:group-region',
  'aws-vpc': 'aws:group-virtual-private-cloud-vpc',
  'aws-subnet-public': 'aws:group-public-subnet',
  'aws-subnet-private': 'aws:group-private-subnet',
  'aws-security-group': 'tabler:shield-lock',
  'azure-management-group': 'azure:management-groups',
  'azure-subscription': 'azure:subscriptions',
  'azure-resource-group': 'azure:resource-groups',
  'azure-region': 'azure:region-management',
  'azure-vnet': 'azure:virtual-networks',
  'azure-subnet': 'azure:subnet',
  'k8s-cluster': 'logos:kubernetes',
  'k8s-namespace': 'k8s:namespace',
};

/** Dark-theme variants AWS publishes for some group icons. */
export const GROUP_ICONS_DARK: Partial<Record<string, string>> = {
  'aws-cloud': 'aws:group-aws-cloud-logo-dark',
};

/** Monochrome glyphs the core draws with no icon set loaded: node-type fallbacks, group badges, basic shapes. */
export const CORE_GLYPHS = [
  'tabler:user', 'tabler:box', 'tabler:world', 'tabler:server', 'tabler:database', 'tabler:network',
  'tabler:address-book', 'tabler:browser', 'tabler:file', 'tabler:device-mobile', 'tabler:shield-lock',
  'tabler:layout-rows', 'tabler:folder', 'tabler:box-margin', 'tabler:square-dashed', 'tabler:brand-aws',
  'tabler:brand-azure', 'tabler:lock', 'tabler:lock-open', 'tabler:flag', 'tabler:cloud-lock', 'tabler:user-square',
  'tabler:key', 'tabler:sitemap', 'tabler:map-pin', 'logos:aws', 'logos:microsoft-azure', 'logos:kubernetes',
];
