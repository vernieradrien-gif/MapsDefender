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

  it('contient les 2 tours et les 3 ennemis du jalon 1', () => {
    const towers = Object.fromEntries(config.towers.map((t) => [t.id, t]));
    expect(towers.mitrailleuse?.cost).toBe(50);
    expect(towers.canon?.cost).toBe(100);
    expect(towers.canon?.kind).toBe('shell');
    // Mitrailleuse : cadence rapide, faible dégât ; Canon : lent, dégâts de zone.
    expect(towers.mitrailleuse!.fireInterval).toBeLessThan(towers.canon!.fireInterval);
    expect(towers.mitrailleuse!.damage).toBeLessThan(towers.canon!.damage);

    const enemies = Object.fromEntries(config.enemies.map((e) => [e.id, e]));
    expect(enemies.pieton?.hp).toBe(20);
    expect(enemies.cycliste?.hp).toBe(12);
    expect(enemies.voiture?.hp).toBe(60);
    expect(enemies.cycliste!.speed).toBeGreaterThan(enemies.pieton!.speed);
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
