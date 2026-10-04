import { memo, useEffect, useSyncExternalStore } from 'react';
import { getIcon, iconIndex, loadIconSets, missingIconSets, onIconSetsChange, type IconIndex } from '@trazo/core';

let version = 0;
onIconSetsChange(() => version++);
const subscribe = (fn: () => void) => onIconSetsChange(fn);

/** Re-renders the caller whenever a full icon set finishes loading. */
export function useIconSets(): number {
  return useSyncExternalStore(subscribe, () => version);
}

let indexValue: IconIndex | undefined;
const indexListeners = new Set<() => void>();
const subscribeIndex = (fn: () => void) => {
  indexListeners.add(fn);
  return () => indexListeners.delete(fn);
};

/** The search index of every icon pack; loads on first `wanted` and is undefined until then. */
export function useIconIndex(wanted: boolean): IconIndex | undefined {
  const value = useSyncExternalStore(subscribeIndex, () => indexValue);
  useEffect(() => {
    if (!wanted || indexValue) return;
    void iconIndex().then((index) => {
      indexValue = index;
      for (const fn of indexListeners) fn();
    });
  }, [wanted]);
  return value;
}

/** Draws a registry icon inline, loading its pack on first use; monochrome icons follow the CSS text colour. */
export const IconGlyph = memo(function IconGlyph({ icon, size = 28 }: { icon: string | undefined; size?: number }) {
  useIconSets();
  const data = getIcon(icon);
  useEffect(() => {
    if (data || !icon) return;
    const missing = missingIconSets([icon]);
    if (missing.length) void loadIconSets(missing);
  }, [data, icon]);
  if (!data) return <span className="glyph-missing" style={{ width: size, height: size }} />;
  return <svg width={size} height={size} viewBox={data.viewBox} aria-hidden dangerouslySetInnerHTML={{ __html: data.body }} />;
});
