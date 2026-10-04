import { describe, expect, it } from 'vitest';
import { getIcon, iconIndex } from '@trazo/core';
import { SECTIONS, searchCatalog } from '../src/catalog.ts';

describe('catalog', () => {
  it('draws every curated tile from the always-loaded icons', () => {
    for (const e of SECTIONS.flatMap((s) => s.entries)) expect(getIcon(e.preview), e.key).not.toBeNull();
  });

  it('searches the curated tiles while the index loads', () => {
    expect(searchCatalog('eks')[0]?.icon).toBe('aws/eks');
    expect(searchCatalog('sagemaker canvas')).toEqual([]);
  });

  it('finds any official icon by name, short alias or category once the index is there', async () => {
    const index = await iconIndex();
    expect(searchCatalog('sagemaker canvas', index)[0]?.icon).toBe('aws/sagemaker-canvas');
    expect(searchCatalog('aks', index)[0]?.icon).toBe('azure/aks');
    const azureDb = searchCatalog('azure databases', index);
    expect(azureDb.length).toBeGreaterThan(5);
    expect(azureDb.every((e) => e.icon?.startsWith('azure/'))).toBe(true);
  });

  it('finds Kubernetes kinds and controllers once, by kubectl short name or category', async () => {
    const index = await iconIndex();
    const pvc = searchCatalog('pvc', index).map((e) => e.label);
    expect(pvc).toEqual(['PVC']);
    expect(searchCatalog('eks', index).map((e) => e.key)).not.toContain('aws:elastic-kubernetes-service');
    expect(searchCatalog('service mesh', index).map((e) => e.label)).toEqual(expect.arrayContaining(['Istio', 'Linkerd', 'Envoy']));
    expect(searchCatalog('chaos mesh', index)[0]?.icon).toBe('cncf/chaosmesh');
    expect(searchCatalog('bitbucket')[0]?.label).toBe('Bitbucket');
  });
});
