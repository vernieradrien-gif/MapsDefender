import { distance, distanceToSegment, pointInPolygon } from '../game/path';
import type { Bounds, Vec2 } from '../game/types';

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

/** Aire signée (formule du lacet) : positive si le polygone tourne dans le sens x → y. */
export function signedArea(poly: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonArea(poly: readonly Vec2[]): number {
  return Math.abs(signedArea(poly));
}

/**
 * Normale sortante (unitaire) de l'arête a → b d'un polygone, d'après son
 * sens de parcours : valable aussi pour les polygones non convexes.
 */
export function outwardNormal(a: Vec2, b: Vec2, orientation: number): Vec2 {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (b.y - a.y) / len;
  const ny = -(b.x - a.x) / len;
  return orientation >= 0 ? { x: nx, y: ny } : { x: -nx, y: -ny };
}

export function isConvex(poly: readonly Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = poly[(i + 2) % poly.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** Enveloppe convexe (chaîne monotone d'Andrew). */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

/** Plus petit rectangle orienté contenant le polygone (un côté suit une arête de l'enveloppe). */
export function minimumBoundingRect(poly: readonly Vec2[]): { corners: Vec2[]; area: number } {
  const hull = convexHull(poly);
  let best: { corners: Vec2[]; area: number } = { corners: [...poly], area: Infinity };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const len = distance(a, b);
    if (len === 0) continue;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const pu = p.x * u.x + p.y * u.y;
      const pv = -p.x * u.y + p.y * u.x;
      minU = Math.min(minU, pu);
      maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv);
      maxV = Math.max(maxV, pv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area) {
      const at = (pu: number, pv: number) => ({ x: pu * u.x - pv * u.y, y: pu * u.y + pv * u.x });
      best = { corners: [at(minU, minV), at(maxU, minV), at(maxU, maxV), at(minU, maxV)], area };
    }
  }
  return best;
}

/**
 * Point intérieur d'un polygone, loin des bords : le centre s'il est dedans
 * (cas convexe), sinon le meilleur point d'une grille (formes en L, en U…).
 */
export function interiorPoint(poly: readonly Vec2[]): Vec2 {
  const center = polygonCentroid(poly);
  if (isConvex(poly)) return center;
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const edgeDistance = (p: Vec2) => {
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) d = Math.min(d, distanceToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!));
    return d;
  };
  let best = pointInPolygon(center, poly) ? center : null;
  let bestScore = best ? edgeDistance(best) : -Infinity;
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = { x: minX + (w * (i + 0.5)) / (steps + 1), y: minY + (h * (j + 0.5)) / (steps + 1) };
      if (!pointInPolygon(p, poly)) continue;
      const score = edgeDistance(p);
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
  }
  return best ?? center;
}

/** Simplification de Douglas-Peucker (les extrémités sont gardées). */
export function douglasPeucker(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worst = -1;
    let worstDist = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i]!, points[first]!, points[last]!);
      if (d > worstDist) {
        worst = i;
        worstDist = d;
      }
    }
    if (worst < 0) continue;
    keep[worst] = true;
    stack.push([first, worst], [worst, last]);
  }
  return points.filter((_, i) => keep[i]);
}

/** Découpe une polyligne par un rectangle : renvoie les morceaux intérieurs (Liang-Barsky). */
export function clipPolylineToRect(points: readonly Vec2[], rect: Bounds): Vec2[][] {
  const pieces: Vec2[][] = [];
  let current: Vec2[] = [];
  const same = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const clipped = clipSegment(a, b, rect);
    if (!clipped) {
      if (current.length > 1) pieces.push(current);
      current = [];
      continue;
    }
    const [p, q] = clipped;
    if (current.length > 0 && !same(current[current.length - 1]!, p)) {
      if (current.length > 1) pieces.push(current);
      current = [];
    }
    if (current.length === 0) current.push(p);
    if (!same(current[current.length - 1]!, q)) current.push(q);
    // Le segment sort du rectangle : le morceau s'arrête là.
    if (!same(q, b)) {
      if (current.length > 1) pieces.push(current);
      current = [];
    }
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}

function clipSegment(a: Vec2, b: Vec2, r: Bounds): [Vec2, Vec2] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - r.minX],
    [dx, r.maxX - a.x],
    [-dy, a.y - r.minY],
    [dy, r.maxY - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  const at = (t: number) => (t === 0 ? { x: a.x, y: a.y } : t === 1 ? { x: b.x, y: b.y } : { x: a.x + dx * t, y: a.y + dy * t });
  return [at(t0), at(t1)];
}

/** Découpe un polygone par un rectangle (Sutherland-Hodgman). */
export function clipPolygonToRect(poly: readonly Vec2[], rect: Bounds): Vec2[] {
  type Side = { inside: (p: Vec2) => boolean; cut: (a: Vec2, b: Vec2) => Vec2 };
  const atX = (x: number) => (a: Vec2, b: Vec2) => ({ x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) });
  const atY = (y: number) => (a: Vec2, b: Vec2) => ({ x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), y });
  const sides: Side[] = [
    { inside: (p) => p.x >= rect.minX, cut: atX(rect.minX) },
    { inside: (p) => p.x <= rect.maxX, cut: atX(rect.maxX) },
    { inside: (p) => p.y >= rect.minY, cut: atY(rect.minY) },
    { inside: (p) => p.y <= rect.maxY, cut: atY(rect.maxY) },
  ];
  let out = [...poly];
  for (const side of sides) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]!;
      const prev = input[(i + input.length - 1) % input.length]!;
      if (side.inside(cur)) {
        if (!side.inside(prev)) out.push(side.cut(prev, cur));
        out.push(cur);
      } else if (side.inside(prev)) {
        out.push(side.cut(prev, cur));
      }
    }
    if (out.length === 0) break;
  }
  return out;
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
