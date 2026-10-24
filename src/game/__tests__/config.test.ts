import { describe, expect, it } from 'vitest';
import { loadConfig, validateConfig } from '../../config';
import { testConfig } from './helpers';

describe('configuration (fidélité au cahier des charges)', () => {
  const config = loadConfig();

  it('est valide', () => {
    expect(validateConfig(config)).toEqual([]);
  });

  it('respecte les valeurs du cahier des charges', () => {
    expect(config.economy.startMoney).toBe(200);
    expect(config.base.hp).toBe(20);
    expect(config.waves.total).toBe(30);
    expect(config.waves.hpGrowth).toBe(1.12);
    expect(config.waves.prepSeconds).toBe(10);
    expect(config.economy.waveBonusBase).toBe(10);
    expect(config.economy.waveBonusPerWave).toBe(2);
    expect(config.simulation.stepsPerSecond).toBe(60);
    expect(config.simulation.speeds).toEqual([1, 2, 3]);
  });

  it('contient les 2 tourelles et les 3 Gloutons du jalon 1', () => {
    const towers = Object.fromEntries(config.towers.map((t) => [t.id, t]));
    expect(towers.bulles?.cost).toBe(50);
    expect(towers.ballons?.cost).toBe(100);
    // Lance-bulles (ex-Mitrailleuse) : cadence rapide, faible dégât, une cible.
    // Lance-ballons (ex-Canon) : lent, dégâts de zone.
    expect(towers.bulles!.fireInterval).toBeLessThan(towers.ballons!.fireInterval);
    expect(towers.bulles!.damage).toBeLessThan(towers.ballons!.damage);
    expect(towers.bulles!.splashRadius).toBe(0);
    expect(towers.ballons!.splashRadius).toBeGreaterThan(0);

    const enemies = Object.fromEntries(config.enemies.map((e) => [e.id, e]));
    expect(enemies.glouton?.hp).toBe(20);
    expect(enemies.filou?.hp).toBe(12);
    expect(enemies.bouboule?.hp).toBe(60);
    expect(enemies.filou!.speed).toBeGreaterThan(enemies.glouton!.speed);
    for (const e of config.enemies) {
      expect(e.reward).toBeGreaterThanOrEqual(5);
      expect(e.reward).toBeLessThanOrEqual(40);
    }
  });

  it('signale les erreurs', () => {
    const bad = testConfig((c) => {
      c.towers[0]!.cost = 0;
      c.waves.composition.push({ enemy: 'licorne', fromWave: 1, weight: 1 });
    });
    const errors = validateConfig(bad).join('\n');
    expect(errors).toMatch(/cost/);
    expect(errors).toMatch(/licorne/);
  });
});
