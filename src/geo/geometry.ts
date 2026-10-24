import { distance, distanceToSegment, pointInPolygon } from '../game/path';
import type { Vec2 } from '../game/types';

// Géométrie plane pour la construction des cartes (bâtiments, parcs, emplacements).

export { pointInPolygon };

/** Rectangle orienté : centre, axe principal unitaire `u`, demi-longueur et demi-largeur. */
export function orientedRect(center: Vec2, u: Vec2, halfLength: number, halfWidth: number): Vec2[] {
  const v = { x: -u.y, y: u.x };
  const corner = (a: number, b: number): Vec2 => ({
    x: center.x + u.x * a * halfLength + v.x * b * halfWidth,
    y: center.y + u.y * a * halfLength + v.y * b * halfWidth,
  });
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}

/** Polygone régulier approchant un cercle ou une ellipse. */
export function ellipse(center: Vec2, rx: number, ry: number, segments = 20): Vec2[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return { x: center.x + Math.cos(a) * rx, y: center.y + Math.sin(a) * ry };
  });
}

export function polygonArea(poly: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(poly: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

/** Distance d'un point à un polygone (0 s'il est dedans). */
export function distanceToPolygon(p: Vec2, poly: readonly Vec2[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, distanceToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!));
  }
  return best;
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (o: Vec2, p: Vec2, q: Vec2) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Distance entre deux segments (0 s'ils se croisent). */
export function segmentDistance(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  );
}

/** Distance entre une polyligne et un polygone (0 si elle le traverse ou y entre). */
export function polylineToPolygonDistance(line: readonly Vec2[], poly: readonly Vec2[]): number {
  if (line.length > 0 && pointInPolygon(line[0]!, poly)) return 0;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    for (let j = 0; j < poly.length; j++) {
      best = Math.min(best, segmentDistance(line[i - 1]!, line[i]!, poly[j]!, poly[(j + 1) % poly.length]!));
      if (best === 0) return 0;
    }
  }
  return best;
}

/** Les deux polygones convexes se chevauchent-ils, en gardant un écart `margin` ? (axes séparateurs) */
export function convexOverlap(a: readonly Vec2[], b: readonly Vec2[], margin = 0): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const len = distance(p, q);
      if (len === 0) continue;
      const nx = -(q.y - p.y) / len;
      const ny = (q.x - p.x) / len;
      const [minA, maxA] = project(a, nx, ny);
      const [minB, maxB] = project(b, nx, ny);
      if (maxA + margin <= minB || maxB + margin <= minA) return false;
    }
  }
  return true;
}

function project(poly: readonly Vec2[], nx: number, ny: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * nx + p.y * ny;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return [min, max];
}
