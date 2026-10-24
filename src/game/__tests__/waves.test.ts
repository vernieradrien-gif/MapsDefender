import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import {
  buildWavePlan,
  hpMultiplier,
  scaledHp,
  waveComposition,
  waveEnemyCount,
  waveSpawnInterval,
} from '../waves';
import { testConfig } from './helpers';

describe('vagues', () => {
  const config = testConfig();
  const waves = config.waves;

  it('PV = base × 1,12^(vague − 1)', () => {
    expect(hpMultiplier(1, waves)).toBe(1);
    expect(hpMultiplier(2, waves)).toBeCloseTo(1.12, 10);
    expect(hpMultiplier(30, waves)).toBeCloseTo(Math.pow(1.12, 29), 10);
    expect(scaledHp(20, hpMultiplier(1, waves))).toBe(20);
    expect(scaledHp(20, hpMultiplier(2, waves))).toBe(22);
    expect(scaledHp(60, hpMultiplier(10, waves))).toBe(Math.round(60 * Math.pow(1.12, 9)));
  });

  it('les PV ne descendent jamais sous 1', () => {
    expect(scaledHp(0.1, 1)).toBe(1);
  });

  it('le nombre d’ennemis croît avec la vague', () => {
    expect(waveEnemyCount(1, waves)).toBe(waves.countBase);
    expect(waveEnemyCount(10, waves)).toBe(Math.round(waves.countBase + waves.countPerWave * 9));
    for (let w = 2; w <= waves.total; w++) {
      expect(waveEnemyCount(w, waves)).toBeGreaterThanOrEqual(waveEnemyCount(w - 1, waves));
    }
  });

  it('l’intervalle d’apparition est borné par le minimum', () => {
    for (let w = 1; w <= 100; w++) {
      expect(waveSpawnInterval(w, waves)).toBeGreaterThanOrEqual(waves.spawnIntervalMin);
    }
    expect(waveSpawnInterval(1, waves)).toBe(waves.spawnIntervalStart);
  });

  it('la composition respecte le total et les vagues d’apparition', () => {
    for (let w = 1; w <= waves.total; w++) {
      const count = waveEnemyCount(w, waves);
      const composition = waveComposition(w, count, waves);
      let sum = 0;
      for (const [enemy, n] of composition) {
        const entry = waves.composition.find((c) => c.enemy === enemy)!;
        expect(entry.fromWave).toBeLessThanOrEqual(w);
        expect(n).toBeGreaterThanOrEqual(0);
        sum += n;
      }
      expect(sum).toBe(count);
    }
  });

  it('seuls les piétons apparaissent à la vague 1', () => {
    const composition = waveComposition(1, 10, waves);
    expect([...composition.keys()]).toEqual(['pieton']);
  });

  it('répartit selon les poids (plus fort reste)', () => {
    const c = waveComposition(5, 7, {
      ...waves,
      composition: [
        { enemy: 'a', fromWave: 1, weight: 4 },
        { enemy: 'b', fromWave: 1, weight: 2 },
        { enemy: 'c', fromWave: 1, weight: 1 },
      ],
    });
    expect(c.get('a')).toBe(4);
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(1);
  });

  it('un plan de vague est déterministe pour une même graine', () => {
    const a = buildWavePlan(12, waves, new Rng(7));
    const b = buildWavePlan(12, waves, new Rng(7));
    const c = buildWavePlan(12, waves, new Rng(8));
    expect(a).toEqual(b);
    expect(a.enemies.length).toBe(waveEnemyCount(12, waves));
    expect([...a.enemies].sort()).toEqual([...c.enemies].sort());
  });
});
