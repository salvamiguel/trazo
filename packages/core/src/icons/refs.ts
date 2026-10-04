/** Short Trazo references that are not `<set>/<name>` of an official pack. */
const ALIASES: Record<string, string> = {
  'aws/aws': 'logos:aws',
  'azure/azure': 'logos:microsoft-azure',
  'k8s/kubernetes': 'logos:kubernetes',
  'cncf/argocd': 'cncf:argo',
  'cncf/argo-cd': 'cncf:argo',
  'cncf/gatekeeper': 'cncf:opa',
  'cncf/ingress-nginx': 'logos:nginx',
  'hashicorp/terraform': 'logos:terraform-icon',
  'ai/openai': 'logos:openai-icon',
  'ai/anthropic': 'logos:anthropic-icon',
};

/**
 * Model reference → Iconify id. `aws/<name>` and `azure/<name>` are the official architecture
 * icons (by official slug or short alias such as `aws/eks`), `k8s/<kind>` the Kubernetes resource
 * icons (`k8s/deployment`, `k8s/svc`) and `cncf/<project>` cloud native project logos;
 * `prefix:name` is any loaded set; anything else is looked up in the `logos` set.
 */
export function resolveIconId(ref: string): string {
  if (ALIASES[ref]) return ALIASES[ref];
  if (ref.includes(':')) return ref;
  const [provider, name] = ref.split('/');
  if ((provider === 'aws' || provider === 'azure' || provider === 'k8s' || provider === 'cncf') && name) return `${provider}:${name}`;
  return `logos:${name ?? provider}`;
}
