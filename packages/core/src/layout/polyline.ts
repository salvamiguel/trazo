import type { Point } from './types.ts';

const EPS = 0.5;

/**
 * Removes duplicate and collinear points and folds tiny zig-zags (< `jog` px)
 * that orthogonal routers leave behind, keeping the path orthogonal.
 */
export function simplifyPolyline(points: Point[], jog = 3): Point[] {
  let pts = dedupe(points.map((p) => ({ x: round(p.x), y: round(p.y) })));
  pts = removeCollinear(pts);
  // Fold jogs: A -> B -> C -> D where |BC| < jog and AB ∥ CD: shift the short segment away.
  let changed = true;
  while (changed && pts.length >= 4) {
    changed = false;
    for (let i = 1; i < pts.length - 2; i++) {
      const a = pts[i - 1]!, b = pts[i]!, c = pts[i + 1]!, d = pts[i + 2]!;
      const bcLen = Math.abs(b.x - c.x) + Math.abs(b.y - c.y);
      if (bcLen === 0 || bcLen >= jog) continue;
      const abVertical = Math.abs(a.x - b.x) < EPS;
      const cdVertical = Math.abs(c.x - d.x) < EPS;
      if (abVertical !== cdVertical) continue;
      // Shift one of the parallel segments onto the other's line. Endpoints (ports) never move.
      const key = abVertical ? 'x' : 'y';
      if (i + 2 < pts.length - 1) {
        c[key] = b[key];
        d[key] = b[key];
      } else if (i - 1 > 0) {
        a[key] = c[key];
        b[key] = c[key];
      } else {
        continue;
      }
      pts = removeCollinear(dedupe(pts));
      changed = true;
      break;
    }
  }
  return pts;
}

function round(v: number) {
  return Math.round(v * 2) / 2;
}

function dedupe(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || Math.abs(p.x - points[i - 1]!.x) > EPS || Math.abs(p.y - points[i - 1]!.y) > EPS);
}

function removeCollinear(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]!, b = points[i]!, c = points[i + 1]!;
    const collinear = (Math.abs(a.x - b.x) < EPS && Math.abs(b.x - c.x) < EPS) || (Math.abs(a.y - b.y) < EPS && Math.abs(b.y - c.y) < EPS);
    if (!collinear) out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
}
