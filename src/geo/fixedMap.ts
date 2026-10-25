import type { MapRulesConfig } from '../config';
import { Rng } from '../game/rng';
import type { Area, AreaKind, Building, EntryMarker, GameMap, Street, Vec2 } from '../game/types';
import { cityPlanting, generateBuildings, generateTrees, type CityStyle } from './city';
import data from './fixed-map.json';
import { ellipse } from './geometry';
import { placeTowerSlots } from './slots';

// Carte de démonstration (jalon 1) : un quartier dessiné à la main (rues, parc,
// place, bâtiment à protéger), bâtiments et arbres générés de façon
// déterministe à partir de la graine. Elle sert de secours si la carte réelle
// est invalide, et de référence pour les tests.

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
  baseBuilding: { rect: [number, number, number, number]; height: number };
  pathStreetWidth: number;
  paths: { id: string; points: Point[] }[];
  streets: { width: number; points: Point[] }[];
  areas: AreaData[];
  pads: Point[];
  style: CityStyle;
}

const toVec = ([x, y]: Point): Vec2 => ({ x, y });

const rectangle = ([x1, y1, x2, y2]: [number, number, number, number]): Vec2[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

function toArea(a: AreaData): Area {
  if ('rect' in a) return { kind: a.kind, polygon: rectangle(a.rect) };
  if ('ellipse' in a) {
    const [x, y, rx, ry] = a.ellipse;
    return { kind: a.kind, polygon: ellipse({ x, y }, rx, ry) };
  }
  const [x, y, r] = a.circle;
  return { kind: a.kind, polygon: ellipse({ x, y }, r, r, 28) };
}

/** Repère d'entrée au début d'un chemin, tourné vers l'intérieur. */
export function entryOf(points: readonly Vec2[]): EntryMarker {
  const [a, b] = points as [Vec2, Vec2];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x, y: a.y, dirX: (b.x - a.x) / len, dirY: (b.y - a.y) / len };
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
  const baseFootprint = rectangle(d.baseBuilding.rect);
  // Le terrain du bâtiment à protéger est réservé avant de bâtir le quartier.
  const reserved = [...areas, { kind: 'plaza' as const, polygon: baseFootprint }];
  const houses = generateBuildings(streets, reserved, d.bounds, d.style, rng);
  const baseBuilding: Building = {
    id: houses.length + 1,
    footprint: baseFootprint,
    height: d.baseBuilding.height,
    roof: 'flat',
    palette: 0,
    kind: 'public',
  };
  const slots = placeTowerSlots(
    { paths, streets, buildings: houses, areas, bounds: d.bounds, base, designedPads: d.pads.map(toVec) },
    rules,
  );
  const buildings = [...houses, baseBuilding];
  const trees = generateTrees(streets, areas, buildings, slots, d.bounds, cityPlanting(d.style), rng);
  return {
    id: d.id,
    name: d.name,
    seed: d.seed,
    bounds: { ...d.bounds },
    base,
    baseBuildingId: baseBuilding.id,
    paths,
    entries: paths.map((p) => entryOf(p.points)),
    slots,
    streets,
    buildings,
    areas,
    trees,
  };
}
