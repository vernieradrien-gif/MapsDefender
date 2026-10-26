import type { OsmElement, OverpassResponse } from '../osm';
import { localProjection, type LatLon } from '../projection';

// Réponse Overpass synthétique pour les tests : un quartier en damier autour
// d'un centre, avec une maison au centre (adresse précise) et un grand
// bâtiment un peu plus loin (le plus imposant).

export const FIXTURE_CENTER: LatLon = { lat: 48.85, lon: 2.35 };

export interface GridOptions {
  /** Demi-largeur et demi-hauteur couvertes par les rues (m). */
  halfWidth: number;
  halfHeight: number;
  /** Écart entre deux rues (m) ; les rues passent à ±spacing/2 du centre. */
  spacing: number;
  /** Ajoute des maisons le long des rues. */
  houses?: boolean;
}

export const CENTER_HOUSE_ID = 900001;
export const BIG_BUILDING_ID = 900002;

export function gridResponse(options: GridOptions, center = FIXTURE_CENTER): OverpassResponse {
  const proj = localProjection(center);
  const geo = (pts: [number, number][]) => pts.map(([x, y]) => proj.toLatLon({ x, y }));
  const ring = (cx: number, cy: number, w: number, h: number) =>
    geo([
      [cx - w / 2, cy - h / 2],
      [cx + w / 2, cy - h / 2],
      [cx + w / 2, cy + h / 2],
      [cx - w / 2, cy + h / 2],
      [cx - w / 2, cy - h / 2],
    ]);
  const elements: OsmElement[] = [];
  let id = 1;
  const { halfWidth: hw, halfHeight: hh, spacing: s } = options;
  const lines = (half: number) => {
    const out: number[] = [];
    for (let v = s / 2; v <= half; v += s) out.push(v, -v);
    return out.sort((a, b) => a - b);
  };
  for (const x of lines(hw)) {
    elements.push({ type: 'way', id: id++, tags: { highway: 'residential' }, geometry: geo([[x, -hh], [x, hh]]) });
  }
  for (const y of lines(hh)) {
    elements.push({ type: 'way', id: id++, tags: { highway: 'residential' }, geometry: geo([[-hw, y], [hw, y]]) });
  }
  if (options.houses) {
    // Une maison de chaque côté de chaque rue verticale, tous les 30 m.
    for (const x of lines(hw)) {
      for (let y = -hh + 20; y < hh - 20; y += 30) {
        if (lines(hh).some((ly) => Math.abs(ly - y) < 14)) continue;
        for (const side of [-1, 1]) {
          elements.push({ type: 'way', id: id++, tags: { building: 'house' }, geometry: ring(x + side * 14, y, 10, 9) });
        }
      }
    }
  }
  elements.push({ type: 'way', id: CENTER_HOUSE_ID, tags: { building: 'house' }, geometry: ring(0, 0, 14, 12) });
  elements.push({
    type: 'way',
    id: BIG_BUILDING_ID,
    tags: { building: 'commercial', name: 'Grand magasin' },
    geometry: ring(s, s, 36, 36),
  });
  return { elements };
}
