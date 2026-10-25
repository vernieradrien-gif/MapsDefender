import type { OsmRulesConfig } from '../config';
import type { Building, BuildingKind, Landmark, Vec2 } from '../game/types';
import { douglasPeucker, minimumBoundingRect, polygonArea } from './geometry';

// Bâtiments réels (OSM) : usage, hauteur et forme du toit, au plus près des
// données (§ 4 « Rendu » du cahier des charges).

const HOUSE = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'farm', 'villa', 'cabin']);
const APARTMENTS = new Set(['apartments', 'residential', 'dormitory', 'flats']);
const PUBLIC = new Set([
  'school', 'kindergarten', 'college', 'university', 'church', 'chapel', 'cathedral', 'temple', 'mosque',
  'synagogue', 'civic', 'public', 'government', 'townhall', 'hospital', 'fire_station', 'sports_hall',
  'sports_centre', 'train_station', 'library',
]);
const COMMERCIAL = new Set(['commercial', 'retail', 'office', 'supermarket', 'industrial', 'warehouse', 'hotel', 'kiosk']);
const ANNEX = new Set(['garage', 'garages', 'shed', 'carport', 'roof', 'hut', 'service', 'greenhouse', 'outbuilding', 'toilets']);
const PUBLIC_AMENITIES = new Set([
  'school', 'kindergarten', 'college', 'place_of_worship', 'townhall', 'library', 'community_centre',
  'hospital', 'clinic', 'post_office', 'police', 'fire_station', 'theatre', 'cinema', 'arts_centre',
]);
const PUBLIC_NAME =
  /(^|\s)(école|ecole|collège|college|lycée|gymnase|église|eglise|chapelle|mairie|hall|salle|centre|médiathèque|bibliothèque|crèche|poste|stade|piscine|pôle|maison de quartier|temple|mosquée|synagogue)(\s|$)|^saint[- ]/i;

/** Usage du bâtiment d'après ses étiquettes, son nom et, à défaut, sa surface au sol. */
export function classifyBuilding(tags: Record<string, string>, area: number, rules: OsmRulesConfig): BuildingKind {
  const type = tags.building ?? 'yes';
  if (HOUSE.has(type)) return 'house';
  if (APARTMENTS.has(type)) return 'apartments';
  if (PUBLIC.has(type)) return 'public';
  if (COMMERCIAL.has(type)) return 'commercial';
  if (ANNEX.has(type)) return 'annex';
  if (tags.amenity && PUBLIC_AMENITIES.has(tags.amenity)) return 'public';
  if (tags.shop) return 'commercial';
  const name = tags.name ?? '';
  if (/^centre commercial/i.test(name)) return 'commercial';
  if (/^résidence/i.test(name)) return 'apartments';
  if (PUBLIC_NAME.test(name)) return 'public';
  if (area < rules.annexMaxArea) return 'annex';
  if (area < rules.houseMaxArea) return 'house';
  if (area < rules.commercialMinArea) return 'apartments';
  return 'commercial';
}

const WORSHIP = new Set(['church', 'chapel', 'cathedral', 'temple', 'mosque', 'synagogue', 'basilica', 'shrine']);
const SCHOOLS = new Set(['school', 'kindergarten', 'college', 'university']);

/** Bâtiment public reconnaissable (§ 4 « Rendu ») : lieu de culte, mairie, école. */
export function landmarkOf(tags: Record<string, string>): Landmark | null {
  const type = tags.building ?? '';
  const amenity = tags.amenity ?? '';
  const name = tags.name ?? '';
  if (WORSHIP.has(type) || amenity === 'place_of_worship' || /^(église|eglise|chapelle|cathédrale|basilique|temple|mosquée|synagogue)(\s|$)/i.test(name)) {
    return 'worship';
  }
  if (type === 'townhall' || amenity === 'townhall' || /^(mairie|hôtel de ville|hotel de ville)(\s|$)/i.test(name)) return 'townhall';
  if (SCHOOLS.has(type) || SCHOOLS.has(amenity) || /^(école|ecole|collège|college|lycée|lycee|groupe scolaire)(\s|$)/i.test(name)) {
    return 'school';
  }
  return null;
}

/** Construction souterraine (parking, station) : ni dessinée, ni base, ni emplacement. */
export function isUnderground(tags: Record<string, string>): boolean {
  const layer = parseFloat(tags.layer ?? '');
  return (
    tags.location === 'underground' ||
    tags.parking === 'underground' ||
    tags.building === 'underground' ||
    (Number.isFinite(layer) && layer < 0)
  );
}

/** Hauteur des murs : `height`, sinon niveaux × hauteur d'un niveau, sinon valeur par défaut du type. */
export function buildingHeight(tags: Record<string, string>, kind: BuildingKind, rules: OsmRulesConfig): number {
  const height = parseFloat((tags.height ?? '').replace(',', '.'));
  if (Number.isFinite(height) && height > 0) return height;
  const levels = parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(levels) && levels > 0) return Math.max(levels, 1) * rules.levelHeight;
  return rules.defaultHeights[kind];
}

/** Contour nettoyé : sans points en double ni points alignés. */
export function cleanRing(ring: readonly Vec2[], tolerance: number): Vec2[] {
  const dedup = ring.filter((p, i) => {
    const prev = ring[(i + ring.length - 1) % ring.length]!;
    return Math.hypot(p.x - prev.x, p.y - prev.y) > 0.05;
  });
  if (dedup.length < 3) return dedup;
  // Douglas-Peucker sur l'anneau ouvert au point le plus éloigné du premier.
  let far = 0;
  let farDist = -1;
  dedup.forEach((p, i) => {
    const d = Math.hypot(p.x - dedup[0]!.x, p.y - dedup[0]!.y);
    if (d > farDist) {
      far = i;
      farDist = d;
    }
  });
  const first = douglasPeucker([...dedup.slice(0, far + 1)], tolerance);
  const second = douglasPeucker([...dedup.slice(far), dedup[0]!], tolerance);
  return [...first, ...second.slice(1, -1)];
}

/**
 * Bâtiment de jeu à partir d'un contour OSM. Une maison presque rectangulaire
 * prend un toit à deux pans sur son rectangle englobant ; les autres formes
 * gardent leur vraie emprise avec un toit plat.
 */
export function toBuilding(
  id: number,
  tags: Record<string, string>,
  ring: readonly Vec2[],
  rules: OsmRulesConfig,
  paletteCount: number,
): Building | null {
  if (isUnderground(tags)) return null;
  const footprint = cleanRing(ring, rules.footprintTolerance);
  if (footprint.length < 3) return null;
  const area = polygonArea(footprint);
  if (area < rules.buildingMinArea) return null;
  const kind = classifyBuilding(tags, area, rules);
  const landmark = landmarkOf(tags);
  const height = buildingHeight(tags, kind, rules);
  const shape = tags['roof:shape'];
  const rect = minimumBoundingRect(footprint);
  const rectangular = area / rect.area >= rules.gableMinRectangularity;
  // Maisons et lieux de culte presque rectangulaires : toit à deux pans, sauf toit plat déclaré.
  const pitched = kind === 'house' || landmark === 'worship';
  const gable = rectangular && (shape === 'gabled' || (pitched && shape !== 'flat'));
  return {
    id,
    footprint: gable ? rect.corners : footprint,
    height,
    roof: gable ? 'gable' : 'flat',
    palette: hashString(`${id}:${area.toFixed(1)}`) % paletteCount,
    kind,
    ...(landmark ? { landmark } : {}),
    ...(tags.name ? { name: tags.name } : {}),
  };
}

/** Empreinte numérique (FNV-1a 32 bits) d'un texte : graines et variantes stables. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
