import type { TowerConfig } from '../config';
import type { Game, Tower } from './game';
import { PreparedPath } from './path';
import { Rng } from './rng';
import { heightBonus, towerStats } from './towers';
import type { TowerSlot } from './types';

// Joueurs automatiques pour l'équilibrage (npm run simulate) et les tests.
// - « moyen » : pose dès qu'il peut, sur un bon emplacement pris un peu au
//   hasard, alterne les tourelles sans réfléchir, améliore de temps en temps ;
// - « bon » : choisit à chaque fois l'action la plus rentable (emplacement,
//   type de tourelle selon la vague, amélioration), quitte à économiser.

export type BotLevel = 'moyen' | 'bon';

/** Mesure de la longueur d'itinéraire à portée d'un point (moyenne par itinéraire, en m). */
export class CoverageSampler {
  private readonly samples: { x: number; y: number }[][];
  private readonly cache = new Map<string, number>();

  constructor(game: Game, private readonly step = 4) {
    this.samples = game.map.paths.map((p) => {
      const path = new PreparedPath(p.points);
      const pts: { x: number; y: number }[] = [];
      for (let d = 0; d <= path.length; d += step) {
        const s = path.sample(d);
        pts.push({ x: s.x, y: s.y });
      }
      return pts;
    });
  }

  at(x: number, y: number, range: number): number {
    const key = `${x.toFixed(1)},${y.toFixed(1)},${range.toFixed(1)}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const r2 = range * range;
    let total = 0;
    for (const pts of this.samples) {
      let n = 0;
      for (const p of pts) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r2) n++;
      total += n * this.step;
    }
    const value = total / Math.max(1, this.samples.length);
    this.cache.set(key, value);
    return value;
  }
}

export function createBot(game: Game, level: BotLevel, seed = 1): () => void {
  return level === 'bon' ? createGoodBot(game) : createAverageBot(game, seed);
}

/** Dégâts par seconde « utiles » d'un type de tourelle, selon la vague. */
function damageValue(config: TowerConfig, damage: number, fireInterval: number, wave: number): number {
  if (config.attack === 'field') return 0;
  const dps = damage / fireInterval;
  if (config.attack === 'beam') return dps * (wave >= 8 ? 1.1 : 0.5); // trop puissant contre les petits virus
  return config.splashRadius > 0 ? dps * 2 : dps;
}

function createGoodBot(game: Game): () => void {
  const sampler = new CoverageSampler(game);
  const slots = game.map.slots;

  const value = (config: TowerConfig, slot: TowerSlot, level: number) => {
    const stats = towerStats(config, level, heightBonus(slot, game.config.heightBonus));
    const covered = sampler.at(slot.x, slot.y, stats.range);
    const wave = Math.max(1, game.wavesLaunched);
    if (config.attack !== 'field') return covered * damageValue(config, stats.damage, stats.fireInterval, wave);
    // Un champ ralentisseur vaut par les tourelles qui tirent dans sa zone.
    let support = 0;
    for (const t of game.towers) {
      if (t.config.attack === 'field') continue;
      if (Math.hypot(t.x - slot.x, t.y - slot.y) < t.range + stats.range * 0.5) {
        support += damageValue(t.config, t.damage, t.fireInterval, wave);
      }
    }
    return covered * support * (stats.slow / (1 - stats.slow)) * 0.35;
  };

  return () => {
    for (let guard = 0; guard < 6; guard++) {
      let best: { score: number; cost: number; run: () => void } | null = null;
      const consider = (score: number, cost: number, run: () => void) => {
        if (score > 0 && (!best || score > best.score)) best = { score, cost, run };
      };
      for (const config of game.config.towers) {
        let bestSlot: TowerSlot | null = null;
        let bestValue = 0;
        for (const slot of slots) {
          if (game.towerAt(slot.id)) continue;
          const v = value(config, slot, 0);
          if (v > bestValue) {
            bestValue = v;
            bestSlot = slot;
          }
        }
        if (bestSlot) {
          const slot = bestSlot;
          consider(bestValue / config.cost, config.cost, () => game.placeTower(slot.id, config.id));
        }
      }
      for (const tower of game.towers) {
        const cost = game.nextUpgradeCost(tower);
        const slot = game.slot(tower.slotId);
        if (cost === null || !slot) continue;
        const gain = value(tower.config, slot, tower.level + 1) - value(tower.config, slot, tower.level);
        consider(gain / cost, cost, () => game.upgradeTower(tower.id));
      }
      const chosen = best as { score: number; cost: number; run: () => void } | null;
      if (!chosen || chosen.cost > game.money) return; // on économise pour la meilleure action
      chosen.run();
    }
  };
}

function createAverageBot(game: Game, seed: number): () => void {
  const rng = new Rng(seed);
  const sampler = new CoverageSampler(game);
  const cycle = ['pulverisateur', 'pulverisateur', 'diffuseur', 'pulverisateur', 'purificateur', 'diffuseur', 'laser'];
  const typical = game.config.towers.find((t) => t.id === 'pulverisateur') ?? game.config.towers[0]!;
  const ranked = [...game.map.slots].sort(
    (a, b) => sampler.at(b.x, b.y, typical.range) - sampler.at(a.x, a.y, typical.range) || a.id - b.id,
  );
  let placed = 0;
  let calls = 0;

  return () => {
    // Un joueur moyen réagit moins vite : il agit une fois sur quatre.
    if (calls++ % 4 !== 0) return;
    const free = ranked.filter((s) => !game.towerAt(s.id));
    const want = game.config.towers.find((t) => t.id === cycle[placed % cycle.length]) ?? typical;
    if (free.length > 0 && game.money >= want.cost) {
      const pool = free.slice(0, Math.max(1, Math.ceil(free.length * 0.5)));
      const slot = pool[Math.floor(rng.next() * pool.length)]!;
      if (game.placeTower(slot.id, want.id) === 'ok') placed++;
      return;
    }
    // De temps en temps, il améliore la tourelle la moins chère à améliorer.
    const upgradable = game.towers
      .map((t) => ({ t, cost: game.nextUpgradeCost(t) }))
      .filter((u): u is { t: Tower; cost: number } => u.cost !== null)
      .sort((a, b) => a.cost - b.cost);
    const cheapest = upgradable[0];
    const saving = free.length > 0 ? want.cost : 0;
    if (cheapest && game.money >= cheapest.cost + saving && rng.next() < 0.3) game.upgradeTower(cheapest.t.id);
  };
}

export interface PlayResult {
  victory: boolean;
  /** Vague atteinte (30 en cas de victoire). */
  wave: number;
  baseHp: number;
  maxEnemies: number;
  towers: number;
  upgrades: number;
  seconds: number;
}

/** Joue une partie jusqu'au bout, l'IA agissant toutes les 0,5 s de jeu. */
export function playGame(game: Game, act: () => void, maxSeconds = 4 * 3600): PlayResult {
  const dt = 1 / 60;
  let maxEnemies = 0;
  let steps = 0;
  while (!game.isOver && steps < maxSeconds * 60) {
    if (steps % 30 === 0) act();
    game.step(dt);
    game.drainEvents();
    steps++;
    if (game.enemies.length > maxEnemies) maxEnemies = game.enemies.length;
  }
  return {
    victory: game.phase === 'victory',
    wave: game.wavesLaunched,
    baseHp: game.baseHp,
    maxEnemies,
    towers: game.towers.length,
    upgrades: game.towers.reduce((s, t) => s + t.level, 0),
    seconds: game.time,
  };
}

