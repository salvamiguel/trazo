import { memo } from 'react';
import { getIcon } from '@trazo/core';

/** Draws a registry icon inline; monochrome icons follow the CSS text colour. */
export const IconGlyph = memo(function IconGlyph({ icon, size = 28 }: { icon: string | undefined; size?: number }) {
  const data = getIcon(icon);
  if (!data) return <span className="glyph-missing" style={{ width: size, height: size }} />;
  return <svg width={size} height={size} viewBox={data.viewBox} aria-hidden dangerouslySetInnerHTML={{ __html: data.body }} />;
});
