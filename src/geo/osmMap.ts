import type { GameConfig } from '../config';
import type { Area, Building, Street, Vec2 } from '../game/types';
import { hashString, toBuilding } from './buildings';
import { clipPolygonToRect, clipPolylineToRect, douglasPeucker, interiorPoint, polygonArea } from './geometry';
import { assembleMap, expand, type MapSource } from './mapBuilder';
import { extractFeatures, overpassQuery, type GeoBox, type OverpassResponse } from './osm';
import { localProjection, type LatLon } from './projection';

// Carte de jeu à partir d'un lieu (géocodé par Nominatim ou position GPS) et
// de la réponse Overpass correspondante. Fonctions pures : le réseau est
// interrogé ailleurs (script d'import, ou appli via osmClient).

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export interface OsmPlace {
  /** Identifiant de la carte (ex. « villagexpo »). */
  id: string;
  /** Nom affiché. */
  name: string;
  center: LatLon;
  /** Rayon choisi (m) ; par défaut places.defaultRadius. La zone de jeu suit le rayon. */
  radius?: number;
  /** Texte d'où dérive la graine (adresse normalisée et rayon) ; par défaut les coordonnées. */
  seedKey?: string;
  /** Adresse précise (avec numéro) : la base est le bâtiment au point géocodé. */
  precise?: boolean;
  /** Base choisie par le joueur : le bâtiment à ce point (m, repère de la carte), prioritaire sur `precise`. */
  baseAt?: Vec2;
}

/** Zone de jeu (m), centrée sur le lieu, à la taille du rayon. */
export function playZone(config: GameConfig, radius = config.places.defaultRadius) {
  const k = radius / config.places.defaultRadius;
  const w = (config.osm.zoneWidth * k) / 2;
  const h = (config.osm.zoneHeight * k) / 2;
  return { minX: -w, minY: -h, maxX: w, maxY: h };
}

function geoBox(place: OsmPlace, margin: number, config: GameConfig): GeoBox {
  const projection = localProjection(place.center);
  const area = expand(playZone(config, place.radius), margin);
  const nw = projection.toLatLon({ x: area.minX, y: area.minY });
  const se = projection.toLatLon({ x: area.maxX, y: area.maxY });
  return { south: se.lat, west: nw.lon, north: nw.lat, east: se.lon };
}

/** Emprise géographique à demander à Overpass : la zone de jeu, son décor et les abords du réseau. */
export function queryBox(place: OsmPlace, config: GameConfig): GeoBox {
  return geoBox(place, Math.max(config.osm.decorMargin, config.osm.graphMargin), config);
}

/** Requête Overpass d'un lieu : rues sur les abords du réseau, décor sur la zone de décor seulement. */
export function placeQuery(place: OsmPlace, config: GameConfig): string {
  return overpassQuery(queryBox(place, config), {
    timeout: config.places.overpassTimeout,
    decorBox: geoBox(place, config.osm.decorMargin, config),
  });
}

/** Graine stable dérivée du lieu et de la taille de la zone. */
export function placeSeed(place: OsmPlace, config: GameConfig): number {
  if (place.seedKey) return hashString(place.seedKey);
  const { lat, lon } = place.center;
  const zone = playZone(config, place.radius);
  return hashString(`${lat.toFixed(5)},${lon.toFixed(5)},${zone.maxX * 2}x${zone.maxY * 2}`);
}

/** Quartier réel : rues, bâtiments et surfaces projetés et découpés à la zone de décor. */
export function osmMapSource(place: OsmPlace, response: OverpassResponse, config: GameConfig): MapSource {
  const rules = config.osm;
  const features = extractFeatures(response, localProjection(place.center));
  const zone = playZone(config, place.radius);
  const decor = expand(zone, rules.decorMargin);

  const widthOf = (highway: string) => rules.streetWidths[highway] ?? rules.streetWidths.residential ?? 8;
  const streets: Street[] = features.streets.flatMap((s) =>
    clipPolylineToRect(s.points, decor).map((points) => ({ points: douglasPeucker(points, rules.drawTolerance), width: widthOf(s.highway) })),
  );
  // Réseau : les rues entières, le graphe les découpe à ses abords.
  const network: Street[] = features.streets.map((s) => ({ points: s.points, width: widthOf(s.highway) }));

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
    network,
    buildings,
    areas,
    center: { x: 0, y: 0 },
    ...(place.baseAt ? { baseAt: place.baseAt } : place.precise ? { baseAt: { x: 0, y: 0 } } : {}),
    attribution: OSM_ATTRIBUTION,
  };
}

export function buildOsmMap(place: OsmPlace, response: OverpassResponse, config: GameConfig) {
  return assembleMap(osmMapSource(place, response, config), config);
}
