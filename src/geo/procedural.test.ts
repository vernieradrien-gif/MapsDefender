import { describe, expect, it } from 'vitest';
import { testConfig } from '../game/__tests__/helpers';
import { createBot, playGame } from '../game/bots';
import { Game } from '../game/game';
import { validateMap } from '../game/mapValidation';
import { generateDistrict, simulationDistricts } from './procedural';

const config = testConfig();

describe('quartiers types de la simulation', () => {
  const specs = simulationDistricts();

  it('20 cartes : grilles, dense, rural, diagonales, de 1 à 4 entrées', () => {
    expect(specs).toHaveLength(20);
    expect(new Set(specs.map((s) => s.kind))).toEqual(new Set(['grille', 'dense', 'rural', 'diagonales']));
    expect(new Set(specs.map((s) => s.entries))).toEqual(new Set([1, 2, 3, 4]));
  });

  it('chaque carte est jouable, avec autant d’entrées que prévu', () => {
    for (const spec of specs) {
      const { map } = generateDistrict(spec, config);
      expect(map.entries.length, spec.id).toBe(spec.entries);
      expect(map.paths.length, spec.id).toBeGreaterThanOrEqual(spec.entries);
      expect(validateMap(map, config.mapRules), spec.id).toEqual([]);
    }
  });

  it('les zones rurales manquent de toits : des socles complètent', () => {
    const rural = specs.filter((s) => s.kind === 'rural').map((s) => generateDistrict(s, config).map);
    expect(rural.every((m) => m.slots.some((s) => s.kind === 'pad'))).toBe(true);
  });

  it('est déterministe', () => {
    const spec = specs[3]!;
    expect(generateDistrict(spec, config)).toEqual(generateDistrict(spec, config));
  });

  it('le bon joueur va plus loin que le joueur moyen', () => {
    const { map } = generateDistrict(specs[1]!, config);
    const wave = (level: 'moyen' | 'bon') => {
      const game = new Game(map, config, { seed: 3 });
      return playGame(game, createBot(game, level, 1)).wave;
    };
    expect(wave('bon')).toBeGreaterThan(wave('moyen'));
  });
});
