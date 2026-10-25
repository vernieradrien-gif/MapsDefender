import type { GameConfig } from '../config';
import type { Area, Building, Street } from '../game/types';
import { hashString, toBuilding } from './buildings';
import { clipPolygonToRect, clipPolylineToRect, douglasPeucker, interiorPoint, polygonArea } from './geometry';
import { assembleMap, expand, type MapSource } from './mapBuilder';
import { extractFeatures, type GeoBox, type OverpassResponse } from './osm';
import { localProjection, type LatLon } from './projection';

// Carte de jeu à partir d'un lieu (géocodé par Nominatim) et de la réponse
// Overpass correspondante. Fonctions pures : le réseau est interrogé ailleurs
// (script d'import aujourd'hui, appli au jalon 4).

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export interface OsmPlace {
  /** Identifiant de la carte (ex. « villagexpo »). */
  id: string;
  /** Nom affiché. */
  name: string;
  center: LatLon;
}

/** Zone de jeu (m), centrée sur le lieu. */
export function playZone(config: GameConfig) {
  const w = config.osm.zoneWidth / 2;
  const h = config.osm.zoneHeight / 2;
  return { minX: -w, minY: -h, maxX: w, maxY: h };
}

/** Emprise géographique à demander à Overpass : la zone de jeu et son décor. */
export function queryBox(place: OsmPlace, config: GameConfig): GeoBox {
  const projection = localProjection(place.center);
  const decor = expand(playZone(config), config.osm.decorMargin);
  const nw = projection.toLatLon({ x: decor.minX, y: decor.minY });
  const se = projection.toLatLon({ x: decor.maxX, y: decor.maxY });
  return { south: se.lat, west: nw.lon, north: nw.lat, east: se.lon };
}

/** Graine stable dérivée du lieu et de la taille de la zone. */
export function placeSeed(place: OsmPlace, config: GameConfig): number {
  const { lat, lon } = place.center;
  return hashString(`${lat.toFixed(5)},${lon.toFixed(5)},${config.osm.zoneWidth}x${config.osm.zoneHeight}`);
}

/** Quartier réel : rues, bâtiments et surfaces projetés et découpés à la zone de décor. */
export function osmMapSource(place: OsmPlace, response: OverpassResponse, config: GameConfig): MapSource {
  const rules = config.osm;
  const features = extractFeatures(response, localProjection(place.center));
  const zone = playZone(config);
  const decor = expand(zone, rules.decorMargin);

  const streets: Street[] = features.streets.flatMap((s) => {
    const width = rules.streetWidths[s.highway] ?? rules.streetWidths.residential ?? 8;
    return clipPolylineToRect(s.points, decor).map((points) => ({
      points: douglasPeucker(points, rules.drawTolerance),
      width,
    }));
  });

  const buildings: Building[] = [];
  for (const b of features.buildings) {
    const p = interiorPoint(b.ring);
    if (p.x < decor.minX || p.x > decor.maxX || p.y < decor.minY || p.y > decor.maxY) continue;
    const building = toBuilding(buildings.length + 1, b.tags, b.ring, rules, rules.paletteCount);
    if (building) buildings.push(building);
  }

  const areas: Area[] = features.areas.flatMap((a) => {
    const polygon = clipPolygonToRect(a.ring, decor);
    if (polygon.length < 3 || polygonArea(polygon) < 20) return [];
    const closed = douglasPeucker([...polygon, polygon[0]!], rules.drawTolerance).slice(0, -1);
    return closed.length >= 3 ? [{ kind: a.kind, polygon: closed }] : [];
  });
  // Les plans d'eau sont dessinés après les parcs : on garde l'ordre parcs, bois, eau.
  const order = { park: 0, wood: 1, plaza: 2, water: 3 } as const;
  areas.sort((x, y) => order[x.kind] - order[y.kind]);

  return {
    id: place.id,
    name: place.name,
    seed: placeSeed(place, config),
    zone,
    streets,
    buildings,
    areas,
    center: { x: 0, y: 0 },
    attribution: OSM_ATTRIBUTION,
  };
}

export function buildOsmMap(place: OsmPlace, response: OverpassResponse, config: GameConfig) {
  return assembleMap(osmMapSource(place, response, config), config);
}
