import { distanceToPolyline } from '../game/path';
import type { Rng } from '../game/rng';
import type { Area, Bounds, Building, Street, Tree, TowerSlot, Vec2 } from '../game/types';
import {
  convexOverlap,
  distanceToPolygon,
  orientedRect,
  pointInPolygon,
  polylineToPolygonDistance,
} from './geometry';

// Génère le décor d'un quartier (bâtiments alignés le long des rues, arbres)
// à partir d'un réseau de rues et de zones. Utilisé pour la carte fixe ;
// les cartes OSM (jalon 4) fourniront leurs vrais bâtiments.

export type Range = [number, number];

export interface CityStyle {
  /** Largeur des trottoirs (m). */
  sidewalk: number;
  /** Recul entre le trottoir et la façade (m). */
  frontYard: Range;
  /** Écart minimal entre deux bâtiments (m). */
  gap: number;
  house: { width: Range; depth: Range; height: Range; gableChance: number };
  apartment: { chance: number; width: Range; depth: Range; height: Range };
  paletteCount: number;
  trees: {
    attempts: number;
    parkAttempts: number;
    spacing: number;
    radius: Range;
    paletteCount: number;
  };
}

const pick = (rng: Rng, [min, max]: Range) => rng.range(min, max);

function streetClear(poly: readonly Vec2[], streets: readonly Street[], sidewalk: number): boolean {
  return streets.every(
    (s) => polylineToPolygonDistance(s.points, poly) >= s.width / 2 + sidewalk - 0.01,
  );
}

/** Bâtiments posés lot après lot de chaque côté de chaque rue, sans chevauchement. */
export function generateBuildings(
  streets: readonly Street[],
  areas: readonly Area[],
  bounds: Bounds,
  style: CityStyle,
  rng: Rng,
): Building[] {
  const buildings: Building[] = [];
  const margin = 15;
  const inBounds = (p: Vec2) =>
    p.x > bounds.minX - margin && p.x < bounds.maxX + margin && p.y > bounds.minY - margin && p.y < bounds.maxY + margin;

  for (const street of streets) {
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1]!;
      const b = street.points[i]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length === 0) continue;
      const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      for (const side of [-1, 1]) {
        const n = { x: -u.y * side, y: u.x * side };
        let t = rng.range(0, 4);
        while (t < length) {
          const apartment = rng.next() < style.apartment.chance;
          const spec = apartment ? style.apartment : style.house;
          const width = pick(rng, spec.width);
          const depth = pick(rng, spec.depth);
          const setback = street.width / 2 + style.sidewalk + pick(rng, style.frontYard);
          const along = t + width / 2;
          t += width + style.gap;
          if (along > length) break;
          const center = {
            x: a.x + u.x * along + n.x * (setback + depth / 2),
            y: a.y + u.y * along + n.y * (setback + depth / 2),
          };
          if (!inBounds(center)) continue;
          const footprint = orientedRect(center, u, width / 2, depth / 2);
          if (!streetClear(footprint, streets, style.sidewalk)) continue;
          if (areas.some((area) => convexOverlap(footprint, area.polygon, 2))) continue;
          if (buildings.some((other) => convexOverlap(footprint, other.footprint, style.gap))) continue;
          buildings.push({
            id: buildings.length + 1,
            footprint,
            height: pick(rng, spec.height),
            roof: !apartment && rng.next() < style.house.gableChance ? 'gable' : 'flat',
            palette: Math.floor(rng.next() * style.paletteCount),
          });
        }
      }
    }
  }
  return buildings;
}

/** Arbres dans les jardins et les parcs, à l'écart des rues, bâtiments, eau et emplacements. */
export function generateTrees(
  streets: readonly Street[],
  areas: readonly Area[],
  buildings: readonly Building[],
  slots: readonly TowerSlot[],
  bounds: Bounds,
  style: CityStyle,
  rng: Rng,
): Tree[] {
  const trees: Tree[] = [];
  const cfg = style.trees;
  const parks = areas.filter((a) => a.kind === 'park');
  const blocked = areas.filter((a) => a.kind !== 'park');

  const tryPlace = (p: Vec2, spacing: number) => {
    const radius = pick(rng, cfg.radius);
    if (streets.some((s) => distanceToPolyline(p, s.points) < s.width / 2 + style.sidewalk + radius * 0.6)) return;
    if (buildings.some((b) => distanceToPolygon(p, b.footprint) < radius * 0.7)) return;
    // Les plans d'eau gardent une rive dégagée (allée du parc).
    if (blocked.some((a) => distanceToPolygon(p, a.polygon) < radius + (a.kind === 'water' ? 6 : 0))) return;
    if (slots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 7)) return;
    if (trees.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < spacing)) return;
    trees.push({ x: p.x, y: p.y, radius, palette: Math.floor(rng.next() * cfg.paletteCount) });
  };

  for (const park of parks) {
    const xs = park.polygon.map((p) => p.x);
    const ys = park.polygon.map((p) => p.y);
    for (let i = 0; i < cfg.parkAttempts; i++) {
      const p = { x: rng.range(Math.min(...xs), Math.max(...xs)), y: rng.range(Math.min(...ys), Math.max(...ys)) };
      if (pointInPolygon(p, park.polygon)) tryPlace(p, cfg.spacing * 0.8);
    }
  }
  for (let i = 0; i < cfg.attempts; i++) {
    tryPlace({ x: rng.range(bounds.minX, bounds.maxX), y: rng.range(bounds.minY, bounds.maxY) }, cfg.spacing);
  }
  return trees;
}
