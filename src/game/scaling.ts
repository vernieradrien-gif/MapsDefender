import type { GameConfig, MapScalingConfig } from '../config';
import { distance } from './path';
import type { MapPath } from './types';

// Adaptation à la carte (§ 3 « Adaptation à la carte ») : nombre de virus par
// vague et argent de départ proportionnels à la longueur moyenne des itinéraires.

export function pathLength(path: MapPath): number {
  let total = 0;
  for (let i = 1; i < path.points.length; i++) total += distance(path.points[i - 1]!, path.points[i]!);
  return total;
}

export function averageRouteLength(paths: readonly MapPath[]): number {
  if (paths.length === 0) return 0;
  return paths.reduce((sum, p) => sum + pathLength(p), 0) / paths.length;
}

/** Facteur de carte = longueur moyenne / longueur de référence, borné. */
export function mapFactor(paths: readonly MapPath[], scaling: MapScalingConfig): number {
  const k = averageRouteLength(paths) / scaling.referenceRouteLength;
  return Math.min(scaling.maxFactor, Math.max(scaling.minFactor, k));
}

/** Argent de départ adapté à la carte (arrondi à 5 près). */
export function scaledStartMoney(config: GameConfig, factor: number): number {
  return Math.round((config.economy.startMoney * factor) / 5) * 5;
}
