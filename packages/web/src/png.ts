/** Rasterises a rendered diagram SVG to PNG in the browser. */

/** Width and height declared on the root <svg>. */
export function svgSize(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const num = (attr: string) => Number(new RegExp(`\\s${attr}="([\\d.]+)"`).exec(root)?.[1] ?? 0);
  return { width: num('width'), height: num('height') };
}

/**
 * Twice the diagram size by default, so it stays sharp on high-density screens and in slides;
 * large diagrams are scaled down to stay under the canvas limits browsers enforce.
 */
export function pngScale(width: number, height: number, wanted = 2, maxSide = 8192, maxArea = 32_000_000): number {
  if (!width || !height) return wanted;
  return Math.min(wanted, maxSide / width, maxSide / height, Math.sqrt(maxArea / (width * height)));
}

export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const { width, height } = svgSize(svg);
  const k = pngScale(width, height, scale);
  const img = new Image();
  img.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('El navegador no pudo dibujar el SVG.'));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * k);
  canvas.height = Math.round(height * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador no permite crear imágenes.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear el PNG.'))), 'image/png'),
  );
}
