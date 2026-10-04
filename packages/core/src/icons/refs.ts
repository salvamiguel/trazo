/** Short Trazo references that are not `<set>/<name>` of an official pack. */
const ALIASES: Record<string, string> = {
  'aws/aws': 'logos:aws',
  'azure/azure': 'logos:microsoft-azure',
  'k8s/kubernetes': 'logos:kubernetes',
  'cncf/helm': 'logos:helm',
  'cncf/argocd': 'logos:argo-icon',
  'hashicorp/terraform': 'logos:terraform-icon',
  'ai/openai': 'logos:openai-icon',
  'ai/anthropic': 'logos:anthropic-icon',
};

/**
 * Model reference → Iconify id. `aws/<name>` and `azure/<name>` are the official architecture
 * icons (by official slug or short alias such as `aws/eks`); `prefix:name` is any loaded set;
 * anything else is looked up in the `logos` set.
 */
export function resolveIconId(ref: string): string {
  if (ALIASES[ref]) return ALIASES[ref];
  if (ref.includes(':')) return ref;
  const [provider, name] = ref.split('/');
  if ((provider === 'aws' || provider === 'azure') && name) return `${provider}:${name}`;
  return `logos:${name ?? provider}`;
}
