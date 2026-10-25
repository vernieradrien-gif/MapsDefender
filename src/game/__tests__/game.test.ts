import { describe, expect, it } from 'vitest';
import { createFixedMap } from '../../geo/fixedMap';
import type { GameEvent } from '../events';
import { Game } from '../game';
import { createBot, playGame } from '../bots';
import { createGreedyBot, playToEnd } from './bot';
import { newGame, run, straightMap, testConfig } from './helpers';

const eventsOf = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('partie : état initial et pose de tours', () => {
  it('démarre avec 200 d’argent, 20 PV et 10 s de préparation', () => {
    const game = newGame();
    expect(game.money).toBe(200);
    expect(game.baseHp).toBe(20);
    expect(game.wavesLaunched).toBe(0);
    expect(game.nextWaveCountdown).toBe(10);
    expect(game.phase).toBe('running');
  });

  it('installer une tourelle débite son coût', () => {
    const game = newGame();
    expect(game.placeTower(1, 'pulverisateur')).toBe('ok');
    expect(game.money).toBe(150);
    expect(game.towerAt(1)?.config.id).toBe('pulverisateur');
    expect(game.placeTower(2, 'diffuseur')).toBe('ok');
    expect(game.money).toBe(50);
    expect(eventsOf(game.drainEvents(), 'towerPlaced')).toHaveLength(2);
  });

  it('refuse les poses impossibles sans débiter', () => {
    const game = newGame(straightMap(), testConfig((c) => (c.economy.startMoney = 80)));
    expect(game.placeTower(99, 'pulverisateur')).toBe('invalid-slot');
    expect(game.placeTower(1, 'lance-flammes')).toBe('unknown-tower');
    expect(game.placeTower(1, 'diffuseur')).toBe('insufficient-funds');
    expect(game.money).toBe(80);
    expect(game.placeTower(1, 'pulverisateur')).toBe('ok');
    expect(game.placeTower(1, 'pulverisateur')).toBe('occupied');
    expect(game.money).toBe(30);
  });

  it('l’option de debug remplace l’argent de départ', () => {
    expect(newGame(straightMap(), testConfig(), { startMoney: 5000 }).money).toBe(5000);
  });
});

describe('partie : vagues', () => {
  it('la vague 1 part automatiquement après la préparation', () => {
    const game = newGame();
    run(game, 9.9);
    expect(game.wavesLaunched).toBe(0);
    run(game, 0.2);
    expect(game.wavesLaunched).toBe(1);
    expect(eventsOf(game.drainEvents(), 'waveStarted')).toEqual([{ type: 'waveStarted', wave: 1, boss: false }]);
  });

  it('« Vague suivante » lance la vague immédiatement, puis attend la fin des apparitions', () => {
    const config = testConfig();
    const game = newGame(straightMap(), config);
    expect(game.callNextWave()).toBe(true);
    expect(game.wavesLaunched).toBe(1);
    expect(game.canCallNextWave()).toBe(false);
    expect(game.callNextWave()).toBe(false);
    // Les 6 virus de la vague 1 apparaissent toutes les 0,9 s.
    run(game, config.waves.spawnIntervalStart * (config.waves.countBase - 1) + 0.1);
    expect(game.canCallNextWave()).toBe(true);
    expect(game.nextWaveCountdown).toBeCloseTo(config.waves.interWaveSeconds - 0.1, 1);
    expect(game.callNextWave()).toBe(true);
    expect(game.wavesLaunched).toBe(2);
  });

  it('les virus qui atteignent la base lui retirent des PV', () => {
    const game = newGame();
    game.callNextWave();
    // Dernier virus apparu à 4,5 s, arrivé vers 8,1 s ; la vague 2 part à 10,5 s.
    run(game, 9);
    expect(game.baseHp).toBe(20 - 6);
    expect(game.kills).toBe(0);
    const cleared = eventsOf(game.drainEvents(), 'waveCleared');
    expect(cleared).toEqual([{ type: 'waveCleared', wave: 1, bonus: 12 }]);
    expect(game.money).toBe(200 + 12);
  });

  it('neutraliser un virus rapporte des crédits, puis le bonus de fin de vague est versé', () => {
    const game = newGame();
    game.placeTower(1, 'pulverisateur');
    game.callNextWave();
    run(game, 9);
    expect(game.kills).toBe(6);
    expect(game.baseHp).toBe(20);
    const reward = game.config.enemies.find((e) => e.id === 'virus')!.reward;
    expect(game.money).toBe(200 - 50 + 6 * reward + 12);
    expect(game.score).toBeGreaterThan(0);
  });

  it('chaque vague est soldée séparément quand elles se chevauchent', () => {
    const game = newGame();
    game.callNextWave();
    run(game, 4.6);
    expect(game.callNextWave()).toBe(true);
    run(game, 20);
    const cleared = eventsOf(game.drainEvents(), 'waveCleared');
    expect(cleared.map((c) => [c.wave, c.bonus])).toEqual([
      [1, 12],
      [2, 14],
    ]);
  });

  it('le nuage du diffuseur touche plusieurs virus groupés', () => {
    const config = testConfig((c) => {
      c.waves.spawnIntervalStart = 0.02;
      c.waves.spawnIntervalMin = 0.02;
      c.waves.laneOffsetMax = 0;
    });
    const game = newGame(straightMap(), config);
    game.placeTower(1, 'diffuseur');
    game.callNextWave();
    let killsAtFirstExplosion = -1;
    for (let i = 0; i < 600 && killsAtFirstExplosion < 0; i++) {
      game.step(1 / 60);
      if (eventsOf(game.drainEvents(), 'impact').length > 0) killsAtFirstExplosion = game.kills;
    }
    expect(killsAtFirstExplosion).toBeGreaterThan(1);
  });

  it('répartit les ennemis entre plusieurs chemins', () => {
    const map = straightMap();
    map.paths.push({ id: 'q', points: [{ x: 100, y: 100 }, { x: 100, y: 0 }] });
    const game = newGame(map);
    game.callNextWave();
    run(game, 3);
    const used = new Set(game.enemies.map((e) => e.pathIndex));
    expect(used).toEqual(new Set([0, 1]));
  });
});

describe('partie : fin', () => {
  it('défaite quand la base n’a plus de PV, puis la simulation s’arrête', () => {
    const game = newGame(straightMap(), testConfig((c) => (c.base.hp = 3)));
    game.callNextWave();
    run(game, 30);
    expect(game.phase).toBe('defeat');
    expect(game.baseHp).toBe(0);
    const over = eventsOf(game.drainEvents(), 'gameOver');
    expect(over).toHaveLength(1);
    expect(over[0]!.victory).toBe(false);
    const time = game.time;
    game.step(1 / 60);
    expect(game.time).toBe(time);
    expect(game.placeTower(1, 'pulverisateur')).toBe('game-over');
    expect(game.callNextWave()).toBe(false);
  });

  it('victoire après la dernière vague, avec bonus de PV restants', () => {
    const config = testConfig((c) => (c.waves.total = 3));
    const game = newGame(straightMap(), config, { startMoney: 1000 });
    game.placeTower(1, 'pulverisateur');
    game.placeTower(2, 'diffuseur');
    run(game, 300);
    expect(game.phase).toBe('victory');
    expect(game.wavesCleared).toBe(3);
    expect(game.baseHp).toBe(20);
    const over = eventsOf(game.drainEvents(), 'gameOver');
    expect(over).toEqual([{ type: 'gameOver', victory: true, score: game.score }]);
    expect(game.score).toBeGreaterThanOrEqual(20 * config.score.perBaseHpOnVictory);
  });

  it('sans aucune tourelle, la partie sur la carte fixe se termine par une défaite', () => {
    const game = new Game(createFixedMap(testConfig().mapRules), testConfig());
    playToEnd(game, () => {});
    expect(game.phase).toBe('defeat');
  });

  it('une partie complète sur la carte fixe va jusqu’au bout sans état invalide', () => {
    const game = new Game(createFixedMap(testConfig().mapRules), testConfig());
    const stats = playToEnd(game, createGreedyBot(game, ['pulverisateur', 'pulverisateur', 'diffuseur']));
    expect(game.isOver).toBe(true);
    expect(stats.minMoney).toBeGreaterThanOrEqual(0);
    expect(stats.maxEnemies).toBeLessThanOrEqual(150);
    expect(game.wavesLaunched).toBeGreaterThanOrEqual(8);
  });

  it('avec beaucoup d’argent (mode debug), la victoire est atteignable', () => {
    const config = testConfig();
    const game = new Game(createFixedMap(testConfig().mapRules), config, { startMoney: config.debug.startMoney });
    playGame(game, createBot(game, 'bon'));
    expect(game.phase).toBe('victory');
    expect(game.wavesCleared).toBe(30);
  });

  it('même carte et mêmes actions = même partie (déterminisme)', () => {
    const play = () => {
      const game = new Game(createFixedMap(testConfig().mapRules), testConfig());
      playToEnd(game, createGreedyBot(game, ['pulverisateur', 'diffuseur']));
      return [game.phase, game.score, game.money, game.kills, game.time, game.wavesLaunched];
    };
    expect(play()).toEqual(play());
  });
});
