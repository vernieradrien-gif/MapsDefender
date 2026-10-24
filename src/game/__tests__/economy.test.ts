import { describe, expect, it } from 'vitest';
import { canAfford, killScore, victoryScore, waveBonus, waveClearScore } from '../economy';
import { testConfig } from './helpers';

describe('économie', () => {
  const config = testConfig();

  it('bonus de fin de vague = 10 + 2 × numéro de vague', () => {
    expect(waveBonus(1, config.economy)).toBe(12);
    expect(waveBonus(10, config.economy)).toBe(30);
    expect(waveBonus(30, config.economy)).toBe(70);
  });

  it('vérifie si une tour est abordable', () => {
    expect(canAfford(200, 50)).toBe(true);
    expect(canAfford(100, 100)).toBe(true);
    expect(canAfford(99, 100)).toBe(false);
  });

  it('le score des éliminations augmente avec la vague', () => {
    const pieton = config.enemies.find((e) => e.id === 'pieton')!;
    expect(killScore(pieton, 1)).toBe(pieton.score);
    expect(killScore(pieton, 5)).toBe(pieton.score * 5);
    expect(waveClearScore(3, config.score)).toBe(config.score.perWaveCleared * 3);
  });

  it('le bonus de victoire dépend des PV restants', () => {
    expect(victoryScore(20, config.score)).toBe(20 * config.score.perBaseHpOnVictory);
    expect(victoryScore(-3, config.score)).toBe(0);
  });
});
