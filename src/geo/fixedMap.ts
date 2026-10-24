import type { GameMap, Vec2 } from '../game/types';
import data from './fixed-map.json';

// Carte fixe du jalon 1 : un chemin codé en dur, sans OpenStreetMap.
// Elle produit la même structure GameMap que produira le générateur OSM (jalon 4).

type Point = [number, number];

interface FixedMapData {
  id: string;
  name: string;
  seed: number;
  bounds: GameMap['bounds'];
  base: Point;
  paths: { id: string; points: Point[] }[];
  slots: Point[];
  streets: Point[][];
}

const toVec = ([x, y]: Point): Vec2 => ({ x, y });

export function createFixedMap(): GameMap {
  const d = data as unknown as FixedMapData;
  return {
    id: d.id,
    name: d.name,
    seed: d.seed,
    bounds: { ...d.bounds },
    base: toVec(d.base),
    paths: d.paths.map((p) => ({ id: p.id, points: p.points.map(toVec) })),
    slots: d.slots.map((s, i) => ({ id: i + 1, ...toVec(s) })),
    streets: d.streets.map((street) => street.map(toVec)),
  };
}
