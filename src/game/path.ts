import type { Vec2 } from './types';

export interface PathSample {
  x: number;
  y: number;
  /** Direction unitaire du segment courant. */
  dirX: number;
  dirY: number;
}

/**
 * Polyligne prête pour le suivi de chemin : longueurs cumulées précalculées,
 * échantillonnage par distance parcourue.
 */
export class PreparedPath {
  readonly points: readonly Vec2[];
  readonly length: number;
  private readonly cumulative: number[];

  constructor(points: readonly Vec2[]) {
    if (points.length < 2) {
      throw new Error('Un chemin doit avoir au moins 2 points');
    }
    this.points = points;
    this.cumulative = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += distance(points[i - 1]!, points[i]!);
      this.cumulative.push(total);
    }
    if (total <= 0) {
      throw new Error('Un chemin doit avoir une longueur non nulle');
    }
    this.length = total;
  }

  /** Position et direction à une distance donnée depuis l'entrée (bornée à [0, longueur]). */
  sample(dist: number, out: PathSample = { x: 0, y: 0, dirX: 1, dirY: 0 }): PathSample {
    const d = Math.min(Math.max(dist, 0), this.length);
    const i = this.segmentIndex(d);
    const a = this.points[i]!;
    const b = this.points[i + 1]!;
    const segStart = this.cumulative[i]!;
    const segLen = this.cumulative[i + 1]! - segStart;
    const t = segLen > 0 ? (d - segStart) / segLen : 0;
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    if (segLen > 0) {
      out.dirX = (b.x - a.x) / segLen;
      out.dirY = (b.y - a.y) / segLen;
    }
    return out;
  }

  /** Index du segment contenant la distance d (recherche dichotomique). */
  private segmentIndex(d: number): number {
    let lo = 0;
    let hi = this.cumulative.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cumulative[mid]! <= d) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Distance d'un point à un segment [a, b]. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distance(p, a);
  const t = Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0), 1);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Distance d'un point à une polyligne. */
export function distanceToPolyline(p: Vec2, points: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distanceToSegment(p, points[i - 1]!, points[i]!));
  }
  return best;
}

/** Le point est-il à l'intérieur du polygone ? (règle pair-impair) */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
