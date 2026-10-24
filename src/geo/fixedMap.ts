import type { MapRulesConfig } from '../config';
import { Rng } from '../game/rng';
import type { Area, AreaKind, GameMap, Street, Vec2 } from '../game/types';
import { generateBuildings, generateTrees, type CityStyle } from './city';
import data from './fixed-map.json';
import { ellipse } from './geometry';
import { placeTowerSlots } from './slots';

// Carte fixe du jalon 1 : un quartier dessiné à la main (rues, parc, place),
// bâtiments et arbres générés de façon déterministe à partir de la graine.
// Elle produit la même structure GameMap que produira le générateur OSM (jalon 4).

type Point = [number, number];

type AreaData =
  | { kind: AreaKind; rect: [number, number, number, number] }
  | { kind: AreaKind; ellipse: [number, number, number, number] }
  | { kind: AreaKind; circle: [number, number, number] };

interface FixedMapData {
  id: string;
  name: string;
  seed: number;
  bounds: GameMap['bounds'];
  base: Point;
  pathStreetWidth: number;
  paths: { id: string; points: Point[] }[];
  streets: { width: number; points: Point[] }[];
  areas: AreaData[];
  pads: Point[];
  style: CityStyle;
}

const toVec = ([x, y]: Point): Vec2 => ({ x, y });

function toArea(a: AreaData): Area {
  if ('rect' in a) {
    const [x1, y1, x2, y2] = a.rect;
    return { kind: a.kind, polygon: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }] };
  }
  if ('ellipse' in a) {
    const [x, y, rx, ry] = a.ellipse;
    return { kind: a.kind, polygon: ellipse({ x, y }, rx, ry) };
  }
  const [x, y, r] = a.circle;
  return { kind: a.kind, polygon: ellipse({ x, y }, r, r, 28) };
}

export function createFixedMap(rules: MapRulesConfig): GameMap {
  const d = data as unknown as FixedMapData;
  const paths = d.paths.map((p) => ({ id: p.id, points: p.points.map(toVec) }));
  const streets: Street[] = [
    ...paths.map((p) => ({ points: p.points, width: d.pathStreetWidth })),
    ...d.streets.map((s) => ({ width: s.width, points: s.points.map(toVec) })),
  ];
  const areas = d.areas.map(toArea);
  const base = toVec(d.base);
  const rng = new Rng(d.seed);
  const buildings = generateBuildings(streets, areas, d.bounds, d.style, rng);
  const slots = placeTowerSlots(
    { paths, streets, buildings, areas, bounds: d.bounds, base, designedPads: d.pads.map(toVec) },
    rules,
  );
  const trees = generateTrees(streets, areas, buildings, slots, d.bounds, d.style, rng);
  return {
    id: d.id,
    name: d.name,
    seed: d.seed,
    bounds: { ...d.bounds },
    base,
    paths,
    slots,
    streets,
    buildings,
    areas,
    trees,
  };
}
