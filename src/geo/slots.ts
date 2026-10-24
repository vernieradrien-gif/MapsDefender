import type { MapRulesConfig } from '../config';
import { PreparedPath, distanceToPolyline } from '../game/path';
import type { Area, Bounds, Building, MapPath, Street, TowerSlot, Vec2 } from '../game/types';
import { distanceToPolygon, polygonCentroid } from './geometry';

export interface SlotInput {
  paths: readonly MapPath[];
  streets: readonly Street[];
  buildings: readonly Building[];
  areas: readonly Area[];
  bounds: Bounds;
  base: Vec2;
  /** Socles placés à la main par le concepteur de la carte (posés en premier s'ils sont valides). */
  designedPads?: readonly Vec2[];
}

/**
 * Place les emplacements de tourelles (§ 4 étape 8 du cahier des charges) :
 * 0. les socles prévus par le concepteur de la carte, s'il y en a ;
 * 1. sur les toits des bâtiments proches du chemin (les plus proches d'abord) ;
 * 2. des socles au sol là où un tronçon du chemin n'a aucun emplacement à proximité ;
 * 3. encore des socles si le total reste sous le minimum.
 */
export function placeTowerSlots(input: SlotInput, rules: MapRulesConfig): TowerSlot[] {
  const slots: TowerSlot[] = [];
  const add = (slot: Omit<TowerSlot, 'id'>) => slots.push({ id: slots.length + 1, ...slot });
  const farFromSlots = (p: Vec2) => slots.every((s) => Math.hypot(s.x - p.x, s.y - p.y) >= rules.slotMinSpacing);
  const pathDistance = (p: Vec2) => Math.min(...input.paths.map((path) => distanceToPolyline(p, path.points)));
  const { minX, minY, maxX, maxY } = input.bounds;
  const inBounds = (p: Vec2) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;

  // Socle valable : au sol libre, assez loin des rues, de l'eau, de la base et des autres emplacements.
  const padOk = (p: Vec2) =>
    inBounds(p) &&
    farFromSlots(p) &&
    Math.hypot(p.x - input.base.x, p.y - input.base.y) >= rules.slotMinSpacing &&
    input.streets.every((s) => distanceToPolyline(p, s.points) >= rules.slotMinDistanceFromPath) &&
    input.buildings.every((b) => distanceToPolygon(p, b.footprint) >= rules.padClearance) &&
    input.areas.every((a) => a.kind === 'park' || distanceToPolygon(p, a.polygon) >= rules.padClearance);

  // 0. Socles prévus à la main.
  for (const spot of input.designedPads ?? []) {
    if (padOk(spot)) add({ x: spot.x, y: spot.y, kind: 'pad', elevation: rules.padElevation, buildingId: null });
  }

  // 1. Toits.
  const roofs = input.buildings
    .map((building) => ({ building, center: polygonCentroid(building.footprint) }))
    .map((r) => ({ ...r, distance: pathDistance(r.center) }))
    .filter((r) => r.distance <= rules.roofMaxDistanceFromPath && inBounds(r.center))
    .filter((r) => Math.hypot(r.center.x - input.base.x, r.center.y - input.base.y) >= rules.slotMinSpacing)
    .sort((a, b) => a.distance - b.distance);
  for (const { building, center } of roofs) {
    if (slots.length >= rules.maxSlots) break;
    if (!farFromSlots(center)) continue;
    add({ x: center.x, y: center.y, kind: 'roof', elevation: building.height, buildingId: building.id });
  }

  const padCandidates = (path: MapPath) => {
    const prepared = new PreparedPath(path.points);
    const out: { at: Vec2; options: Vec2[] }[] = [];
    for (let d = rules.padStep / 2; d < prepared.length; d += rules.padStep) {
      const s = prepared.sample(d);
      const o = rules.padOffsetFromPath;
      out.push({
        at: { x: s.x, y: s.y },
        options: [
          { x: s.x - s.dirY * o, y: s.y + s.dirX * o },
          { x: s.x + s.dirY * o, y: s.y - s.dirX * o },
        ],
      });
    }
    return out;
  };

  // 2. Socles dans les trous de couverture.
  for (const path of input.paths) {
    for (const { at, options } of padCandidates(path)) {
      if (slots.length >= rules.maxSlots) break;
      const covered = slots.some((s) => Math.hypot(s.x - at.x, s.y - at.y) <= rules.padCoverageRadius);
      if (covered) continue;
      const spot = options.find(padOk);
      if (spot) add({ ...spot, kind: 'pad', elevation: rules.padElevation, buildingId: null });
    }
  }

  // 3. Minimum garanti.
  for (const path of input.paths) {
    for (const { options } of padCandidates(path)) {
      for (const spot of options) {
        if (slots.length >= rules.minSlots) return slots;
        if (padOk(spot)) add({ ...spot, kind: 'pad', elevation: rules.padElevation, buildingId: null });
      }
    }
  }
  return slots;
}
