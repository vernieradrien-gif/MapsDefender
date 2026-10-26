import type { MapRulesConfig } from '../config';
import { distance, distanceToPolyline, pointInPolygon } from './path';
import type { GameMap } from './types';

/**
 * Vérifie qu'une carte est jouable ; renvoie la liste des problèmes trouvés.
 * Sert pour la carte fixe et servira pour les cartes générées (jalon 4).
 */
export function validateMap(map: GameMap, rules: MapRulesConfig): string[] {
  const errors: string[] = [];

  if (map.paths.length === 0) errors.push('aucun chemin');
  for (const path of map.paths) {
    if (path.points.length < 2) {
      errors.push(`chemin ${path.id} : moins de 2 points`);
      continue;
    }
    const end = path.points[path.points.length - 1]!;
    if (distance(end, map.base) > rules.baseMaxDistanceFromPathEnd) {
      errors.push(`chemin ${path.id} : ne se termine pas sur la base`);
    }
    if (path.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      errors.push(`chemin ${path.id} : coordonnée invalide`);
    }
  }

  if (map.slots.length < rules.minSlots) {
    errors.push(`pas assez d'emplacements (${map.slots.length} < ${rules.minSlots})`);
  }

  const ids = new Set<number>();
  const roofs = new Set<number>();
  const buildings = new Map(map.buildings.map((b) => [b.id, b]));
  for (const slot of map.slots) {
    if (ids.has(slot.id)) errors.push(`emplacement ${slot.id} en double`);
    ids.add(slot.id);

    const { minX, minY, maxX, maxY } = map.bounds;
    if (slot.x < minX || slot.x > maxX || slot.y < minY || slot.y > maxY) {
      errors.push(`emplacement ${slot.id} hors de la zone affichée`);
    }
    if (slot.kind === 'roof') {
      const building = slot.buildingId === null ? undefined : buildings.get(slot.buildingId);
      if (!building) errors.push(`emplacement ${slot.id} : bâtiment introuvable`);
      else if (!pointInPolygon(slot, building.footprint)) errors.push(`emplacement ${slot.id} hors de son toit`);
      if (building && building.id === map.baseBuildingId) errors.push(`emplacement ${slot.id} sur la base`);
      if (slot.buildingId !== null && roofs.has(slot.buildingId)) errors.push(`deux emplacements sur le bâtiment ${slot.buildingId}`);
      if (slot.buildingId !== null) roofs.add(slot.buildingId);
    } else {
      if (distance(slot, map.base) < rules.slotMinDistanceFromPath) {
        errors.push(`socle ${slot.id} trop proche de la base`);
      }
      for (const street of map.streets) {
        const d = distanceToPolyline(slot, street.points);
        if (d < rules.slotMinDistanceFromPath) {
          errors.push(`socle ${slot.id} trop proche d'une rue (${d.toFixed(1)} m)`);
          break;
        }
      }
      if (map.buildings.some((b) => pointInPolygon(slot, b.footprint))) {
        errors.push(`socle ${slot.id} posé dans un bâtiment`);
      }
    }
  }

  // Chaque bâtiment a son emplacement, même collé à son voisin ; les socles gardent leurs distances.
  for (const pad of map.slots) {
    if (pad.kind !== 'pad') continue;
    for (const other of map.slots) {
      if (other.id !== pad.id && (other.kind === 'roof' || other.id > pad.id) && distance(pad, other) < rules.slotMinSpacing) {
        errors.push(`emplacements ${pad.id} et ${other.id} trop proches`);
      }
    }
  }
  return errors;
}
