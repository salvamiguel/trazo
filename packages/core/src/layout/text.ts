/**
 * Approximate text metrics for layout without a browser. Average advance widths
 * for a neutral sans-serif (Inter/Helvetica-like); the renderer uses the same font stack.
 */
const NARROW = new Set('iljtf.,:;|!\'()[] ');
const WIDE = new Set('mwMW@%');

export function textWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) units += 0.32;
    else if (WIDE.has(ch)) units += 0.88;
    else if (ch >= 'A' && ch <= 'Z') units += 0.66;
    else units += 0.55;
  }
  return Math.ceil(units * fontSize * (bold ? 1.06 : 1));
}

/** Greedy word wrap to at most `maxWidth`. */
export function wrap(text: string, fontSize: number, maxWidth: number, bold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, fontSize, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export const FONT = {
  family: "Inter, 'Segoe UI', Helvetica, Arial, sans-serif",
  name: 13,
  tech: 11,
  edge: 11,
  group: 12,
  lineHeight: 1.3,
};
