import { describe, expect, it } from 'vitest';
import { createFixedMap } from '../../geo/fixedMap';
import { createBot } from '../bots';
import type { GameEvent } from '../events';
import { Game } from '../game';
import { bonusesFrom, buyUpgrade, canBuy, gemsForScore, NO_BONUSES } from '../progression';
import { newGame, run, straightMap, testConfig } from './helpers';

const config = testConfig();
const progression = config.progression;
const upgrade = (id: string) => progression.upgrades.find((u) => u.id === id)!;
const eventsOf = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('gemmes et améliorations permanentes', () => {
  it('les gemmes dépendent du score, de plus en plus lentement', () => {
    expect(gemsForScore(0, progression)).toBe(0);
    expect(gemsForScore(-50, progression)).toBe(0);
    expect(gemsForScore(10000, progression)).toBe(Math.floor(progression.gemFactor * 100));
    // Quatre fois plus de points : deux fois plus de gemmes.
    expect(gemsForScore(40000, progression)).toBe(Math.floor(progression.gemFactor * 200));
  });

  it('achat niveau par niveau, dans la limite des gemmes et du niveau maximal', () => {
    const degats = upgrade('degats');
    expect(canBuy(degats, {}, 0)).toBe('gems');
    let state = { levels: {}, gems: 1000 };
    for (let i = 0; i < degats.maxLevel; i++) state = buyUpgrade('degats', state.levels, state.gems, progression)!;
    expect(state.levels).toEqual({ degats: degats.maxLevel });
    expect(state.gems).toBe(1000 - degats.costs.reduce((s, c) => s + c, 0));
    expect(canBuy(degats, state.levels, state.gems)).toBe('max');
    expect(buyUpgrade('degats', state.levels, state.gems, progression)).toBeNull();
  });

  it('les améliorations du deuxième rang demandent un prérequis (arbre)', () => {
    const offert = upgrade('offert');
    expect(offert.requires).not.toBeNull();
    expect(canBuy(offert, {}, 1000)).toBe('locked');
    expect(canBuy(offert, { [offert.requires!.id]: offert.requires!.level }, 1000)).toBe('ok');
  });

  it('les effets se cumulent', () => {
    expect(bonusesFrom({}, progression)).toEqual(NO_BONUSES);
    const b = bonusesFrom({ degats: 2, credits: 3, offert: 1, portee: 1 }, progression);
    expect(b.damage).toBeCloseTo(1 + 2 * upgrade('degats').effect, 10);
    expect(b.startMoney).toBe(3 * upgrade('credits').effect);
    expect(b.freeTowers).toBe(1);
    expect(b.range).toBeCloseTo(1 + upgrade('portee').effect, 10);
  });

  it('la partie applique les bonus : dégâts, portée, crédits et Pulvérisateur offert', () => {
    const bonuses = bonusesFrom({ degats: 2, credits: 2, offert: 1, portee: 1 }, progression);
    const plain = newGame();
    const boosted = newGame(straightMap(), testConfig(), { bonuses });
    expect(boosted.startMoney).toBe(plain.startMoney + bonuses.startMoney);
    expect(boosted.costOf('pulverisateur')).toBe(0);
    expect(boosted.placeTower(1, 'pulverisateur')).toBe('ok');
    expect(boosted.money).toBe(boosted.startMoney);
    expect(boosted.freeTowers).toBe(0);
    expect(boosted.towerAt(1)!.invested).toBe(0);
    expect(boosted.costOf('pulverisateur')).toBe(50);
    plain.placeTower(1, 'pulverisateur');
    expect(boosted.towerAt(1)!.damage).toBeCloseTo(plain.towerAt(1)!.damage * bonuses.damage, 10);
    expect(boosted.towerAt(1)!.range).toBeCloseTo(plain.towerAt(1)!.range * bonuses.range, 10);
  });
});

describe('publicités récompensées : effets sur la partie', () => {
  it('« Continuer » remet la base à 10 PV, une seule fois par partie', () => {
    const game = newGame(straightMap(), testConfig((c) => (c.base.hp = 2)));
    game.callNextWave();
    run(game, 30);
    expect(game.phase).toBe('defeat');
    expect(game.canRevive()).toBe(true);
    expect(game.revive(config.ads.continueHp)).toBe(true);
    expect(game.phase).toBe('running');
    expect(game.baseHp).toBe(2); // jamais plus que les PV de départ
    expect(eventsOf(game.drainEvents(), 'revived')).toHaveLength(1);
    run(game, 60);
    expect(game.phase).toBe('defeat');
    expect(game.canRevive()).toBe(false);
    expect(game.revive(10)).toBe(false);
  });

  it('après « Continuer », la vague en cours se solde normalement', () => {
    const c = testConfig((cfg) => (cfg.base.hp = 1));
    const game = newGame(straightMap(), c);
    game.callNextWave();
    run(game, 5);
    expect(game.phase).toBe('defeat');
    game.revive(20);
    game.placeTower(1, 'pulverisateur');
    game.placeTower(2, 'pulverisateur');
    for (let i = 0; i < 60 * 30 && game.wavesCleared === 0 && !game.isOver; i++) game.step(1 / 60);
    expect(game.wavesCleared).toBe(1);
  });

  it('le boost double les gains de la vague suivante, proposé seulement entre deux vagues', () => {
    const game = newGame();
    expect(game.canBoost()).toBe(true);
    expect(game.boostNextWave()).toBe(true);
    expect(game.canBoost()).toBe(false);
    game.placeTower(1, 'pulverisateur');
    game.callNextWave();
    run(game, 1);
    expect(game.canBoost()).toBe(false); // des virus sont en jeu
    const kills: number[] = [];
    for (let i = 0; i < 600; i++) {
      game.step(1 / 60);
      for (const e of eventsOf(game.drainEvents(), 'enemyDefeated')) kills.push(e.reward);
    }
    const reward = config.enemies.find((e) => e.id === 'virus')!.reward;
    expect(kills.length).toBeGreaterThan(0);
    expect(kills.every((r) => r === reward * config.ads.boostMultiplier)).toBe(true);
  });
});

describe('sauvegarde de la partie', () => {
  it('reprendre une partie sauvegardée donne exactement la même suite', () => {
    const map = createFixedMap(config.mapRules);
    const original = new Game(map, config, { seed: 4 });
    const bot = createBot(original, 'bon');
    for (let i = 0; i < 60 * 90; i++) {
      if (i % 30 === 0) bot();
      original.step(1 / 60);
    }
    original.drainEvents();
    const saved = JSON.parse(JSON.stringify(original.snapshot()));
    const copy = Game.restore(map, config, saved);
    const state = (g: Game) => [
      g.phase,
      g.money,
      g.baseHp,
      g.score,
      g.kills,
      g.wavesLaunched,
      g.wavesCleared,
      g.enemies.length,
      g.towers.map((t) => `${t.slotId}:${t.config.id}:${t.level}`).join(','),
      g.enemies.map((e) => `${e.id}:${e.x.toFixed(6)}:${e.y.toFixed(6)}:${e.hp.toFixed(3)}`).join(','),
    ];
    expect(state(copy)).toEqual(state(original));
    for (let i = 0; i < 60 * 60; i++) {
      original.step(1 / 60);
      copy.step(1 / 60);
    }
    expect(state(copy)).toEqual(state(original));
  });

  it('refuse une sauvegarde d’une autre carte, ou de la même carte modifiée', () => {
    const snap = newGame().snapshot();
    expect(() => Game.restore(createFixedMap(config.mapRules), config, snap)).toThrow();
    const map = createFixedMap(config.mapRules);
    const saved = new Game(map, config).snapshot();
    expect(() => Game.restore(map, config, saved)).not.toThrow();
    // Base déplacée : même identifiant, autre carte.
    const moved = { ...map, base: { x: map.base.x + 40, y: map.base.y } };
    expect(() => Game.restore(moved, config, saved)).toThrow();
  });
});
