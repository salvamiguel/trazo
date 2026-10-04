import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURATED, GROUP_ICONS, getIcon, isIconSetLoaded, layoutModelView, missingIconSets, resolveIconId } from '../src/index.ts';
import { loadWorkspace } from '../src/workspace.ts';
import { iconIndex } from '../src/icons/registry.ts';

describe('icon packs', () => {
  it('draws every curated icon and group badge from the core subset, without loading a full set', () => {
    const refs = [...Object.values(CURATED).flatMap((l) => l.map(([ref]) => ref)), ...Object.values(GROUP_ICONS)];
    for (const ref of refs) expect(getIcon(ref), ref).not.toBeNull();
    expect(isIconSetLoaded('aws') || isIconSetLoaded('azure') || isIconSetLoaded('logos')).toBe(false);
  });

  it('maps short names to the official AWS and Azure icons', () => {
    expect(resolveIconId('aws/eks')).toBe('aws:eks');
    // Gradient ids are made unique per drawing, so compare without them.
    const shape = (ref: string) => getIcon(ref)!.body.replace(/(id="|url\(#|href="#)[^")]+/g, '$1');
    expect(shape('aws/eks')).toBe(shape('aws/elastic-kubernetes-service'));
    expect(shape('azure/aks')).toBe(shape('azure/kubernetes-services'));
  });

  it('reports the full set an icon outside the subset needs, and draws it once loaded', async () => {
    const ws = loadWorkspace(join(import.meta.dirname, '../../../examples/azure-web'));
    const ref = 'aws/sagemaker-canvas';
    expect(missingIconSets([ref])).toEqual(['aws']);
    expect(getIcon(ref)).toBeNull();
    await layoutModelView(ws.model, ws.views[0]!); // azure example: needs nothing beyond the subset
    expect(isIconSetLoaded('aws')).toBe(false);
    const { loadIconSets } = await import('../src/index.ts');
    await loadIconSets(['aws']);
    expect(getIcon(ref)).not.toBeNull();
    expect(missingIconSets([ref])).toEqual([]);
  });

  it('indexes every pack with titles and categories for search', async () => {
    const index = await iconIndex();
    expect(Object.keys(index).sort()).toEqual(['aws', 'azure', 'cncf', 'k8s', 'logos', 'tabler']);
    expect(Object.keys(index.aws!.icons).length).toBeGreaterThan(700);
    expect(index.azure!.icons['kubernetes-services']).toEqual(['Kubernetes Services', 'Compute']);
    expect(index.aws!.aliases.eks).toBe('elastic-kubernetes-service');
    expect(index.k8s!.icons.deployment).toEqual(['Deployment', 'Workloads']);
    expect(index.k8s!.aliases.svc).toBe('service');
    expect(index.cncf!.icons.istio).toEqual(['Istio', 'Service mesh']);
  });

  it('resolves Kubernetes kinds by name or kubectl short name, and project logos', async () => {
    const { loadIconSets } = await import('../src/index.ts');
    await loadIconSets(['k8s', 'cncf']);
    expect(resolveIconId('k8s/deploy')).toBe('k8s:deploy');
    const shape = (ref: string) => getIcon(ref)!.body;
    expect(shape('k8s/deploy')).toBe(shape('k8s/deployment'));
    expect(shape('k8s/ing')).toBe(shape('k8s/ingress'));
    expect(resolveIconId('cncf/istio')).toBe('cncf:istio');
    expect(resolveIconId('k8s/kubernetes')).toBe('logos:kubernetes');
    expect(getIcon('cncf/istio')!.mono).toBe(false);
  });
});

describe('azure-infra preset', () => {
  it('lays subnets out as columns in model order inside the VNet', async () => {
    const ws = loadWorkspace(join(import.meta.dirname, '../../../examples/azure-web'));
    const { layout } = await layoutModelView(ws.model, ws.views[0]!);
    const box = (id: string) => layout.nodes.find((n) => n.id === id)!;
    const [gw, app, data] = [box('snet-gateway'), box('snet-app'), box('snet-datos')];
    expect(gw.x + gw.width).toBeLessThan(app.x);
    expect(app.x + app.width).toBeLessThan(data.x);
    // Regional services outside the VNet come after it.
    expect(box('key-vault').x).toBeGreaterThan(box('vnet').x + box('vnet').width);
  });
});
