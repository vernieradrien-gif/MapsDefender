import type { WavesConfig } from '../config';
import type { Rng } from './rng';

export interface WavePlan {
  number: number;
  /** Identifiants des ennemis, dans l'ordre d'apparition. */
  enemies: string[];
  /** Secondes entre deux apparitions. */
  spawnInterval: number;
  hpMultiplier: number;
}

/** Multiplicateur de PV : hpGrowth^(vague − 1). */
export function hpMultiplier(wave: number, waves: WavesConfig): number {
  return Math.pow(waves.hpGrowth, wave - 1);
}

/** PV d'un ennemi à une vague donnée : PV de base × hpGrowth^(vague − 1), arrondi. */
export function scaledHp(baseHp: number, multiplier: number): number {
  return Math.max(1, Math.round(baseHp * multiplier));
}

export function waveEnemyCount(wave: number, waves: WavesConfig): number {
  return Math.max(1, Math.round(waves.countBase + waves.countPerWave * (wave - 1)));
}

export function waveSpawnInterval(wave: number, waves: WavesConfig): number {
  return Math.max(
    waves.spawnIntervalMin,
    waves.spawnIntervalStart + waves.spawnIntervalPerWave * (wave - 1),
  );
}

/**
 * Répartit `count` ennemis entre les types disponibles à cette vague,
 * proportionnellement à leur poids (méthode du plus fort reste).
 */
export function waveComposition(wave: number, count: number, waves: WavesConfig): Map<string, number> {
  const eligible = waves.composition.filter((c) => c.fromWave <= wave);
  const totalWeight = eligible.reduce((sum, c) => sum + c.weight, 0);
  const result = new Map<string, number>();
  if (eligible.length === 0 || totalWeight <= 0) return result;

  const shares = eligible.map((c, index) => {
    const exact = (count * c.weight) / totalWeight;
    return { enemy: c.enemy, index, floor: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let remaining = count - shares.reduce((sum, s) => sum + s.floor, 0);
  const byRest = [...shares].sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const share of byRest) {
    if (remaining <= 0) break;
    share.floor += 1;
    remaining -= 1;
  }
  for (const share of shares) {
    result.set(share.enemy, (result.get(share.enemy) ?? 0) + share.floor);
  }
  return result;
}

/** Plan complet d'une vague ; l'ordre d'apparition est mélangé avec le générateur à graine. */
export function buildWavePlan(wave: number, waves: WavesConfig, rng: Rng): WavePlan {
  const count = waveEnemyCount(wave, waves);
  const enemies: string[] = [];
  for (const [enemy, n] of waveComposition(wave, count, waves)) {
    for (let i = 0; i < n; i++) enemies.push(enemy);
  }
  rng.shuffle(enemies);
  return {
    number: wave,
    enemies,
    spawnInterval: waveSpawnInterval(wave, waves),
    hpMultiplier: hpMultiplier(wave, waves),
  };
}
