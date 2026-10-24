import type { Game } from '../game';
import { PreparedPath } from '../path';

/**
 * Joueur automatique simple pour les tests : remplit les emplacements les
 * mieux placés (plus grande longueur de chemin à portée) dès qu'il peut payer.
 * `pattern` donne le type de tour à poser, emplacement après emplacement.
 */
export function createGreedyBot(game: Game, pattern: string[]) {
  const coverage = new Map<number, number>();
  const maxRange = Math.max(...game.config.towers.map((t) => t.range));
  for (const slot of game.map.slots) {
    let covered = 0;
    for (const p of game.map.paths) {
      const path = new PreparedPath(p.points);
      for (let d = 0; d <= path.length; d += 2) {
        const s = path.sample(d);
        if (Math.hypot(s.x - slot.x, s.y - slot.y) <= maxRange) covered += 2;
      }
    }
    coverage.set(slot.id, covered);
  }
  const order = [...game.map.slots].sort((a, b) => coverage.get(b.id)! - coverage.get(a.id)!);
  let placed = 0;

  return function act(): void {
    while (placed < order.length) {
      const slot = order[placed]!;
      const type = pattern[placed % pattern.length]!;
      const result = game.placeTower(slot.id, type);
      if (result !== 'ok') return;
      placed++;
    }
  };
}

export interface RunStats {
  maxEnemies: number;
  minMoney: number;
  steps: number;
}

/** Joue une partie jusqu'au bout (ou jusqu'à `maxSeconds`). */
export function playToEnd(game: Game, act: () => void, maxSeconds = 3600): RunStats {
  const dt = 1 / 60;
  const stats: RunStats = { maxEnemies: 0, minMoney: game.money, steps: 0 };
  while (!game.isOver && stats.steps < maxSeconds * 60) {
    if (stats.steps % 30 === 0) act();
    game.step(dt);
    game.drainEvents();
    stats.steps++;
    stats.maxEnemies = Math.max(stats.maxEnemies, game.enemies.length);
    stats.minMoney = Math.min(stats.minMoney, game.money);
    for (const e of game.enemies) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp)) {
        throw new Error(`état invalide pour l'ennemi ${e.id}`);
      }
    }
  }
  return stats;
}
