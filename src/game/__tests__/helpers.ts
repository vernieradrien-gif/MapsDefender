import { loadConfig, type GameConfig } from '../../config';
import { Game, type GameOptions } from '../game';
import type { GameMap } from '../types';

/** Copie profonde de la configuration réelle, modifiable par test. */
export function testConfig(mutate?: (c: GameConfig) => void): GameConfig {
  const config = structuredClone(loadConfig());
  mutate?.(config);
  return config;
}

/** Carte minimale : une rue droite de 100 m, deux socles. */
export function straightMap(): GameMap {
  return {
    id: 'test',
    name: 'test',
    seed: 42,
    bounds: { minX: 0, minY: -50, maxX: 100, maxY: 50 },
    base: { x: 100, y: 0 },
    baseBuildingId: null,
    paths: [{ id: 'p', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }],
    entries: [{ x: 0, y: 0, dirX: 1, dirY: 0 }],
    slots: [
      { id: 1, x: 50, y: 15, kind: 'pad', elevation: 0.6, buildingId: null },
      { id: 2, x: 80, y: -15, kind: 'pad', elevation: 0.6, buildingId: null },
    ],
    streets: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 10 }],
    buildings: [],
    areas: [],
    trees: [],
  };
}

/** Avance la partie de `seconds` secondes par pas de 1/60 s. */
export function run(game: Game, seconds: number): void {
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps && !game.isOver; i++) game.step(dt);
}

export function newGame(map = straightMap(), config = testConfig(), options?: GameOptions): Game {
  // Facteur de carte neutre : les tests de la simulation ne dépendent pas de la longueur des chemins.
  return new Game(map, config, { mapFactor: 1, ...options });
}
