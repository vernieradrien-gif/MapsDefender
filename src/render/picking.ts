import type { Building, Vec2 } from '../game/types';
import { distanceToPolygon, pointInPolygon } from '../geo/geometry';

// Bâtiment sous le doigt, tel qu'il est dessiné : un bâtiment en pseudo-3D
// occupe à l'écran son emprise au sol, ses murs et son toit (décalé vers le
// haut selon sa hauteur). Le plus proche de la caméra (le plus au sud) gagne.
// Une maison ne fait que quelques pixels quand la carte n'est pas zoomée : à
// défaut d'un bâtiment exactement sous le doigt, on prend le plus proche à
// portée de doigt (`tolerance`, en pixels).

/** Projection d'un point au sol, élevé de `height` mètres, en pixels à l'écran. */
export type ScreenProjection = (p: Vec2, height: number) => Vec2;

export function buildingAtScreen(
  buildings: readonly Building[],
  project: ScreenProjection,
  topHeight: (b: Building) => number,
  screen: Vec2,
  tolerance = 0,
): Building | null {
  const candidates = buildings
    .map((b) => ({ b, depth: Math.max(...b.footprint.map((p) => p.y)) }))
    .sort((x, y) => y.depth - x.depth);
  let nearest: Building | null = null;
  let nearestDistance = tolerance;
  for (const { b } of candidates) {
    const top = topHeight(b);
    // Emprise au sol, à mi-hauteur et au niveau du toit : couvre aussi les murs.
    for (const h of [top, top / 2, 0]) {
      const outline = b.footprint.map((p) => project(p, h));
      if (pointInPolygon(screen, outline)) return b;
      const d = distanceToPolygon(screen, outline);
      if (d < nearestDistance) {
        nearest = b;
        nearestDistance = d;
      }
    }
  }
  return nearest;
}
