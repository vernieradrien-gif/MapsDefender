import { describe, expect, it } from 'vitest';
import { loadConfig, validateConfig } from '../../config';
import { testConfig } from './helpers';

describe('configuration (fidélité au cahier des charges)', () => {
  const config = loadConfig();
  const towers = Object.fromEntries(config.towers.map((t) => [t.id, t]));
  const enemies = Object.fromEntries(config.enemies.map((e) => [e.id, e]));

  it('est valide', () => {
    expect(validateConfig(config)).toEqual([]);
  });

  it('respecte les valeurs du cahier des charges', () => {
    expect(config.economy.startMoney).toBe(200);
    expect(config.base.hp).toBe(20);
    expect(config.waves.total).toBe(30);
    expect(config.waves.prepSeconds).toBe(10);
    expect(config.economy.waveBonusBase).toBe(10);
    expect(config.economy.waveBonusPerWave).toBe(2);
    expect(config.economy.sellRefund).toBe(0.7);
    expect(config.upgrades.maxLevel).toBe(3);
    expect(config.upgrades.costGrowth).toBe(1.6);
    expect(config.waves.bossEvery).toBe(10);
    expect(config.mapScaling.referenceRouteLength).toBe(600);
    expect(config.heightBonus.rangePerMeter).toBe(0.012);
    expect(config.heightBonus.maxBonus).toBe(0.25);
    expect(config.simulation.stepsPerSecond).toBe(60);
    expect(config.simulation.speeds).toEqual([1, 2, 3]);
  });

  it('contient les 4 dispositifs sanitaires avec leurs rôles', () => {
    expect(config.towers.map((t) => t.id).sort()).toEqual(['diffuseur', 'laser', 'pulverisateur', 'purificateur']);
    expect(towers.pulverisateur!.cost).toBe(50);
    expect(towers.diffuseur!.cost).toBe(100);
    expect(towers.laser!.cost).toBe(150);
    expect(towers.purificateur!.cost).toBe(75);
    // Pulvérisateur (ex-Mitrailleuse) : cadence rapide, faible dégât, une cible.
    expect(towers.pulverisateur!.fireInterval).toBeLessThan(towers.diffuseur!.fireInterval);
    expect(towers.pulverisateur!.damage).toBeLessThan(towers.diffuseur!.damage);
    expect(towers.pulverisateur!.splashRadius).toBe(0);
    // Diffuseur (ex-Canon) : capsule qui éclate en nuage, zone, lent.
    expect(towers.diffuseur!.splashRadius).toBeGreaterThan(0);
    // Laser UV (ex-Sniper) : longue portée, gros dégâts, très lent.
    const laser = towers.laser!;
    for (const other of [towers.pulverisateur!, towers.diffuseur!]) {
      expect(laser.range).toBeGreaterThan(other.range);
      expect(laser.damage).toBeGreaterThan(other.damage);
      expect(laser.fireInterval).toBeGreaterThan(other.fireInterval);
    }
    expect(laser.attack).toBe('beam');
    // Purificateur (ex-Ralentisseur) : champ qui ralentit de 40 %.
    expect(towers.purificateur!.attack).toBe('field');
    expect(towers.purificateur!.slow).toBe(0.4);
  });

  it('contient les 5 virus avec leurs rôles', () => {
    expect(config.enemies.map((e) => e.id).sort()).toEqual(['amas', 'blinde', 'megavirus', 'variant', 'virus']);
    expect(enemies.virus!.hp).toBe(20);
    expect(enemies.variant!.hp).toBe(12);
    expect(enemies.amas!.hp).toBe(60);
    expect(enemies.blinde!.hp).toBe(200);
    expect(enemies.megavirus!.hp).toBe(800);
    expect(enemies.variant!.speed).toBeGreaterThan(enemies.virus!.speed);
    expect(enemies.blinde!.speed).toBeLessThan(enemies.virus!.speed);
    expect(enemies.blinde!.baseDamage).toBeGreaterThan(enemies.amas!.baseDamage);
    expect(config.waves.boss).toBe('megavirus');
    expect(enemies.megavirus!.splitInto).toBe('amas');
    expect(enemies.megavirus!.splitCount).toBe(3);
    for (const e of config.enemies) {
      expect(e.reward).toBeGreaterThanOrEqual(5);
      expect(e.reward).toBeLessThanOrEqual(40);
    }
  });

  it('signale les erreurs', () => {
    const bad = testConfig((c) => {
      c.towers[0]!.cost = 0;
      c.waves.composition.push({ enemy: 'licorne', fromWave: 1, weight: 1 });
      c.waves.boss = 'dragon';
      c.economy.sellRefund = 1.5;
      c.enemies.find((e) => e.id === 'megavirus')!.splitInto = 'inconnu';
    });
    const errors = validateConfig(bad).join('\n');
    expect(errors).toMatch(/cost/);
    expect(errors).toMatch(/licorne/);
    expect(errors).toMatch(/dragon/);
    expect(errors).toMatch(/sellRefund/);
    expect(errors).toMatch(/splitInto/);
  });
});
