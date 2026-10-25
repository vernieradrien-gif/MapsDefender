import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../events';
import { Game } from '../game';
import { Rng } from '../rng';
import { mapFactor } from '../scaling';
import { heightBonus, sellValue, totalInvested, towerStats, upgradeCost } from '../towers';
import type { GameMap } from '../types';
import { buildWavePlan, waveEnemyCount } from '../waves';
import { newGame, run, straightMap, testConfig } from './helpers';

const eventsOf = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

/** Rue droite de `length` m, terminée par la base. */
function lineMap(length: number): GameMap {
  const map = straightMap();
  map.paths = [{ id: 'p', points: [{ x: 0, y: 0 }, { x: length, y: 0 }] }];
  map.base = { x: length, y: 0 };
  return map;
}

/** Carte droite avec un emplacement sur un toit de `height` m. */
function roofMap(height: number): GameMap {
  const map = straightMap();
  map.buildings.push({
    id: 1,
    footprint: [{ x: 40, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 30 }, { x: 40, y: 30 }],
    height,
    roof: 'flat',
    palette: 0,
  });
  map.slots.push({ id: 3, x: 50, y: 20, kind: 'roof', elevation: height, buildingId: 1 });
  return map;
}

describe('améliorations et revente', () => {
  const config = testConfig();
  const pulve = config.towers.find((t) => t.id === 'pulverisateur')!;

  it('coût d’amélioration = coût × 1,6^niveau, revente à 70 % du total investi', () => {
    expect(upgradeCost(pulve, 1, config.upgrades)).toBe(80);
    expect(upgradeCost(pulve, 2, config.upgrades)).toBe(128);
    expect(upgradeCost(pulve, 3, config.upgrades)).toBe(205);
    expect(totalInvested(pulve, 3, config.upgrades)).toBe(50 + 80 + 128 + 205);
    expect(sellValue(50, config.economy)).toBe(35);
    expect(sellValue(463, config.economy)).toBe(324);
  });

  it('chaque niveau renforce la tourelle', () => {
    const l0 = towerStats(pulve, 0, 0);
    const l3 = towerStats(pulve, 3, 0);
    expect(l3.damage).toBeGreaterThan(l0.damage);
    expect(l3.range).toBeGreaterThan(l0.range);
    expect(l3.fireInterval).toBeLessThan(l0.fireInterval);
  });

  it('3 niveaux au plus ; l’amélioration débite son coût', () => {
    const game = newGame(straightMap(), testConfig(), { startMoney: 1000 });
    game.placeTower(1, 'pulverisateur');
    const tower = game.towerAt(1)!;
    const range0 = tower.range;
    expect(game.nextUpgradeCost(tower)).toBe(80);
    expect(game.upgradeTower(tower.id)).toBe('ok');
    expect(game.money).toBe(1000 - 50 - 80);
    expect(tower.level).toBe(1);
    expect(tower.range).toBeGreaterThan(range0);
    expect(game.upgradeTower(tower.id)).toBe('ok');
    expect(game.upgradeTower(tower.id)).toBe('ok');
    expect(tower.level).toBe(3);
    expect(game.nextUpgradeCost(tower)).toBeNull();
    expect(game.upgradeTower(tower.id)).toBe('max-level');
    expect(game.money).toBe(1000 - 463);
    expect(tower.invested).toBe(463);
    const events = game.drainEvents();
    expect(eventsOf(events, 'towerUpgraded').map((e) => e.level)).toEqual([1, 2, 3]);
  });

  it('refuse une amélioration trop chère sans débiter', () => {
    const game = newGame(straightMap(), testConfig(), { startMoney: 100 });
    game.placeTower(1, 'pulverisateur');
    const tower = game.towerAt(1)!;
    expect(game.upgradeTower(tower.id)).toBe('insufficient-funds');
    expect(game.money).toBe(50);
    expect(tower.level).toBe(0);
    expect(game.upgradeTower(999)).toBe('unknown-tower');
  });

  it('la revente rend 70 % du total investi et libère l’emplacement', () => {
    const game = newGame(straightMap(), testConfig(), { startMoney: 1000 });
    game.placeTower(1, 'diffuseur');
    const tower = game.towerAt(1)!;
    game.upgradeTower(tower.id);
    const invested = 100 + 160;
    expect(game.sellValue(tower)).toBe(Math.floor(invested * 0.7));
    expect(game.sellTower(tower.id)).toBe(182);
    expect(game.money).toBe(1000 - invested + 182);
    expect(game.towerAt(1)).toBeUndefined();
    expect(game.towers).toHaveLength(0);
    expect(eventsOf(game.drainEvents(), 'towerSold')).toHaveLength(1);
    expect(game.sellTower(tower.id)).toBeNull();
    expect(game.placeTower(1, 'pulverisateur')).toBe('ok');
  });
});

describe('bonus de hauteur', () => {
  const config = testConfig();

  it('+1,2 % de portée par mètre de toit, plafonné à +25 %, rien sur un socle', () => {
    expect(heightBonus({ kind: 'roof', elevation: 10 }, config.heightBonus)).toBeCloseTo(0.12, 10);
    expect(heightBonus({ kind: 'roof', elevation: 30 }, config.heightBonus)).toBe(0.25);
    expect(heightBonus({ kind: 'pad', elevation: 30 }, config.heightBonus)).toBe(0);
  });

  it('une tourelle sur un toit de 10 m porte 12 % plus loin que sur un socle', () => {
    const game = newGame(roofMap(10), testConfig(), { startMoney: 1000 });
    const base = config.towers.find((t) => t.id === 'laser')!.range;
    expect(game.previewRange(3, 'laser')).toBeCloseTo(base * 1.12, 6);
    expect(game.previewRange(1, 'laser')).toBeCloseTo(base, 6);
    game.placeTower(3, 'laser');
    game.placeTower(1, 'laser');
    expect(game.towerAt(3)!.range).toBeCloseTo(base * 1.12, 6);
    expect(game.towerAt(1)!.range).toBeCloseTo(base, 6);
    expect(game.towerAt(3)!.heightBonus).toBeCloseTo(0.12, 10);
  });

  it('le bonus de hauteur se cumule avec les améliorations', () => {
    const game = newGame(roofMap(40), testConfig(), { startMoney: 2000 });
    game.placeTower(3, 'pulverisateur');
    const tower = game.towerAt(3)!;
    game.upgradeTower(tower.id);
    const pulve = config.towers.find((t) => t.id === 'pulverisateur')!;
    expect(tower.range).toBeCloseTo(pulve.range * (1 + pulve.perLevel.range) * 1.25, 6);
  });
});

describe('dispositifs sanitaires', () => {
  /** Temps (s) avant que le premier virus atteigne la base. */
  function firstHitTime(game: Game): number {
    game.callNextWave();
    for (let i = 0; i < 60 * 30; i++) {
      game.step(1 / 60);
      if (eventsOf(game.drainEvents(), 'baseHit').length > 0) return game.time;
    }
    return Infinity;
  }

  it('le purificateur ralentit de 40 % les virus dans son champ, sans dégâts', () => {
    const free = firstHitTime(newGame());
    const slowed = newGame();
    slowed.placeTower(1, 'purificateur');
    const time = firstHitTime(slowed);
    expect(free).toBeCloseTo(100 / 28, 1);
    // Le champ couvre environ 78 m des 100 m de la rue.
    expect(time).toBeGreaterThan(free + 1.5);
    expect(slowed.kills).toBe(0);
  });

  it('un virus dans le champ a sa vitesse réduite de 40 %', () => {
    const game = newGame();
    game.placeTower(1, 'purificateur');
    game.callNextWave();
    run(game, 2);
    const enemy = game.enemies.find((e) => Math.abs(e.x - 50) < 25)!;
    expect(enemy.slow).toBeCloseTo(0.4, 10);
    const before = enemy.distance;
    game.step(1 / 60);
    expect(enemy.distance - before).toBeCloseTo((28 * 0.6) / 60, 6);
  });

  it('le laser UV frappe instantanément, sans projectile', () => {
    const game = newGame();
    game.placeTower(1, 'laser');
    game.callNextWave();
    let beams = 0;
    for (let i = 0; i < 120 && beams === 0; i++) {
      game.step(1 / 60);
      beams = eventsOf(game.drainEvents(), 'beam').length;
    }
    expect(beams).toBe(1);
    expect(game.projectiles).toHaveLength(0);
    expect(game.kills).toBe(1);
  });
});

describe('boss', () => {
  const config = testConfig();

  it('un Méga-virus ferme la marche toutes les 10 vagues', () => {
    const rng = new Rng(3);
    for (let w = 1; w <= 30; w++) {
      const plan = buildWavePlan(w, config.waves, rng);
      const bosses = plan.enemies.filter((e) => e === 'megavirus').length;
      expect(bosses).toBe(w % 10 === 0 ? 1 : 0);
      if (bosses) expect(plan.enemies[plan.enemies.length - 1]).toBe('megavirus');
    }
  });

  it('neutralisé, il se divise en 3 Amas qui repartent de sa position', () => {
    const c = testConfig((cfg) => {
      cfg.waves.bossEvery = 1;
      cfg.towers.find((t) => t.id === 'laser')!.damage = 100000;
    });
    const map = lineMap(400);
    map.slots[0] = { id: 1, x: 380, y: 15, kind: 'pad', elevation: 0.6, buildingId: null };
    const game = newGame(map, c, { startMoney: 1000 });
    game.callNextWave();
    expect(eventsOf(game.drainEvents(), 'waveStarted')[0]!.boss).toBe(true);
    // Le laser est posé quand seul le boss reste en route.
    run(game, 6);
    expect(game.enemies.map((e) => e.config.id)).toContain('megavirus');
    game.placeTower(1, 'laser');
    let split: Extract<GameEvent, { type: 'enemySplit' }> | undefined;
    for (let i = 0; i < 60 * 60 && !split; i++) {
      game.step(1 / 60);
      split = eventsOf(game.drainEvents(), 'enemySplit')[0];
    }
    expect(split).toMatchObject({ enemyType: 'megavirus', count: 3 });
    const amas = game.enemies.filter((e) => e.config.id === 'amas' && e.alive);
    expect(amas.length).toBeGreaterThanOrEqual(2);
    for (const a of amas) expect(Math.abs(a.x - split!.x)).toBeLessThan(15);
    // La vague n'est soldée qu'une fois les fragments résolus.
    expect(game.wavesCleared).toBe(0);
    run(game, 60);
    expect(game.wavesCleared).toBe(1);
  });
});

describe('adaptation à la longueur des itinéraires', () => {
  const config = testConfig();

  it('facteur = longueur moyenne / 600 m, borné', () => {
    expect(mapFactor(lineMap(600).paths, config.mapScaling)).toBeCloseTo(1, 10);
    expect(mapFactor(lineMap(780).paths, config.mapScaling)).toBeCloseTo(1.3, 10);
    expect(mapFactor(lineMap(100).paths, config.mapScaling)).toBe(config.mapScaling.minFactor);
    expect(mapFactor(lineMap(5000).paths, config.mapScaling)).toBe(config.mapScaling.maxFactor);
  });

  it('argent de départ et nombre de virus suivent le facteur de carte', () => {
    const reference = new Game(lineMap(600), config);
    expect(reference.startMoney).toBe(200);
    const long = new Game(lineMap(780), config);
    expect(long.mapFactor).toBeCloseTo(1.3, 10);
    expect(long.startMoney).toBe(260);
    expect(waveEnemyCount(1, config.waves, 1.3)).toBe(Math.round(6 * 1.3));
    long.callNextWave();
    run(long, 9);
    expect(long.enemies.length + long.kills).toBe(Math.round(6 * 1.3));
  });
});
