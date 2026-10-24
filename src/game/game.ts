import type { EnemyConfig, GameConfig, TowerConfig } from '../config';
import { canAfford, killScore, victoryScore, waveBonus, waveClearScore } from './economy';
import type { GameEvent } from './events';
import { PreparedPath, type PathSample } from './path';
import { Rng } from './rng';
import { candidatesInRadius, selectTarget } from './targeting';
import type { GameMap, TowerSlot } from './types';
import { buildWavePlan, scaledHp } from './waves';

export type GamePhase = 'running' | 'victory' | 'defeat';

export type PlaceTowerResult =
  | 'ok'
  | 'game-over'
  | 'invalid-slot'
  | 'occupied'
  | 'unknown-tower'
  | 'insufficient-funds';

export interface Enemy {
  id: number;
  config: EnemyConfig;
  wave: number;
  pathIndex: number;
  /** Distance parcourue depuis l'entrée (m). */
  distance: number;
  /** Distance restant jusqu'à la base (m). */
  remaining: number;
  /** Décalage latéral par rapport à l'axe de la rue (m). */
  offset: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  /** Position au pas précédent (interpolation du rendu). */
  prevX: number;
  prevY: number;
  dirX: number;
  dirY: number;
  alive: boolean;
}

export interface Tower {
  id: number;
  config: TowerConfig;
  slotId: number;
  x: number;
  y: number;
  /** Secondes avant le prochain tir possible. */
  cooldown: number;
  /** Orientation de la tourelle (radians). */
  angle: number;
  targetId: number | null;
}

export interface Projectile {
  id: number;
  towerId: number;
  /** Identifiant du type de tourelle (pour le rendu : bulle, ballon…). */
  towerType: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  targetId: number;
  targetX: number;
  targetY: number;
  speed: number;
  damage: number;
  splashRadius: number;
  /** Distance déjà parcourue (m), pour l'animation en cloche. */
  traveled: number;
  alive: boolean;
}

interface ActiveWave {
  number: number;
  queue: string[];
  nextIndex: number;
  spawnTimer: number;
  spawnInterval: number;
  hpMultiplier: number;
  /** Ennemis pas encore résolus (à faire apparaître + vivants). */
  pending: number;
}

export interface GameOptions {
  /** Remplace l'argent de départ (mode debug). */
  startMoney?: number;
  /** Remplace la graine de la carte. */
  seed?: number;
}

/**
 * Simulation complète d'une partie. Aucune dépendance au DOM ni au canvas :
 * on l'avance par pas fixes avec `step(dt)` et on lit son état.
 */
export class Game {
  readonly map: GameMap;
  readonly config: GameConfig;
  readonly paths: readonly PreparedPath[];
  readonly totalWaves: number;
  readonly baseMaxHp: number;

  readonly enemies: Enemy[] = [];
  readonly towers: Tower[] = [];
  readonly projectiles: Projectile[] = [];

  private _phase: GamePhase = 'running';
  private _money: number;
  private _baseHp: number;
  private _score = 0;
  private _kills = 0;
  private _wavesLaunched = 0;
  private _wavesCleared = 0;
  private _countdown: number | null;
  private _time = 0;

  private readonly rng: Rng;
  private readonly enemyConfigs = new Map<string, EnemyConfig>();
  private readonly towerConfigs = new Map<string, TowerConfig>();
  private readonly slotsById = new Map<number, TowerSlot>();
  private readonly towerBySlot = new Map<number, Tower>();
  private readonly enemyById = new Map<number, Enemy>();
  private readonly activeWaves: ActiveWave[] = [];
  private events: GameEvent[] = [];
  private nextId = 1;
  private spawnCount = 0;
  private readonly sample: PathSample = { x: 0, y: 0, dirX: 1, dirY: 0 };

  constructor(map: GameMap, config: GameConfig, options: GameOptions = {}) {
    if (map.paths.length === 0) throw new Error('La carte doit contenir au moins un chemin');
    this.map = map;
    this.config = config;
    this.paths = map.paths.map((p) => new PreparedPath(p.points));
    this.totalWaves = config.waves.total;
    this.baseMaxHp = config.base.hp;
    this._baseHp = config.base.hp;
    this._money = options.startMoney ?? config.economy.startMoney;
    this._countdown = config.waves.prepSeconds;
    this.rng = new Rng(options.seed ?? map.seed);
    for (const e of config.enemies) this.enemyConfigs.set(e.id, e);
    for (const t of config.towers) this.towerConfigs.set(t.id, t);
    for (const s of map.slots) this.slotsById.set(s.id, s);
  }

  // --- Lecture de l'état -------------------------------------------------

  get phase(): GamePhase {
    return this._phase;
  }
  get money(): number {
    return this._money;
  }
  get baseHp(): number {
    return this._baseHp;
  }
  get score(): number {
    return this._score;
  }
  get kills(): number {
    return this._kills;
  }
  /** Nombre de vagues lancées (= numéro de la vague en cours). */
  get wavesLaunched(): number {
    return this._wavesLaunched;
  }
  get wavesCleared(): number {
    return this._wavesCleared;
  }
  /** Secondes avant le lancement automatique de la prochaine vague, ou null. */
  get nextWaveCountdown(): number | null {
    return this._countdown;
  }
  /** Temps de jeu écoulé (s). */
  get time(): number {
    return this._time;
  }
  get isOver(): boolean {
    return this._phase !== 'running';
  }

  towerAt(slotId: number): Tower | undefined {
    return this.towerBySlot.get(slotId);
  }

  towerConfig(id: string): TowerConfig | undefined {
    return this.towerConfigs.get(id);
  }

  /** Renvoie les événements survenus depuis le dernier appel. */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // --- Commandes du joueur -------------------------------------------------

  placeTower(slotId: number, towerId: string): PlaceTowerResult {
    if (this._phase !== 'running') return 'game-over';
    const slot = this.slotsById.get(slotId);
    if (!slot) return 'invalid-slot';
    if (this.towerBySlot.has(slotId)) return 'occupied';
    const config = this.towerConfigs.get(towerId);
    if (!config) return 'unknown-tower';
    if (!canAfford(this._money, config.cost)) return 'insufficient-funds';

    this._money -= config.cost;
    const tower: Tower = {
      id: this.nextId++,
      config,
      slotId,
      x: slot.x,
      y: slot.y,
      cooldown: 0,
      angle: -Math.PI / 2,
      targetId: null,
    };
    this.towers.push(tower);
    this.towerBySlot.set(slotId, tower);
    this.events.push({ type: 'towerPlaced', towerId: tower.id, slotId, towerType: config.id });
    return 'ok';
  }

  /** La prochaine vague peut être appelée en avance pendant le compte à rebours. */
  canCallNextWave(): boolean {
    return (
      this._phase === 'running' &&
      this._countdown !== null &&
      this._wavesLaunched < this.totalWaves
    );
  }

  callNextWave(): boolean {
    if (!this.canCallNextWave()) return false;
    this.launchNextWave();
    return true;
  }

  // --- Simulation ------------------------------------------------------------

  step(dt: number): void {
    if (this._phase !== 'running') return;
    this._time += dt;

    if (this._countdown !== null) {
      this._countdown -= dt;
      if (this._countdown <= 0) this.launchNextWave();
    }
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    if (this._phase !== 'running') return;
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.removeResolved();

    if (
      this._phase === 'running' &&
      this._wavesLaunched >= this.totalWaves &&
      this.activeWaves.length === 0
    ) {
      this._score += victoryScore(this._baseHp, this.config.score);
      this._phase = 'victory';
      this.events.push({ type: 'gameOver', victory: true, score: this._score });
    }
  }

  private launchNextWave(): void {
    if (this._wavesLaunched >= this.totalWaves) {
      this._countdown = null;
      return;
    }
    const number = ++this._wavesLaunched;
    const plan = buildWavePlan(number, this.config.waves, this.rng);
    this.activeWaves.push({
      number,
      queue: plan.enemies,
      nextIndex: 0,
      spawnTimer: 0,
      spawnInterval: plan.spawnInterval,
      hpMultiplier: plan.hpMultiplier,
      pending: plan.enemies.length,
    });
    this._countdown = null;
    this.events.push({ type: 'waveStarted', wave: number });
  }

  private updateSpawns(dt: number): void {
    for (const wave of this.activeWaves) {
      if (wave.nextIndex >= wave.queue.length) continue;
      wave.spawnTimer -= dt;
      while (wave.spawnTimer <= 0 && wave.nextIndex < wave.queue.length) {
        this.spawnEnemy(wave, wave.queue[wave.nextIndex]!, -wave.spawnTimer);
        wave.nextIndex++;
        wave.spawnTimer += wave.spawnInterval;
      }
      // Dernier ennemi de la vague apparu : on lance le compte à rebours de la suivante.
      if (
        wave.nextIndex >= wave.queue.length &&
        wave.number === this._wavesLaunched &&
        this._wavesLaunched < this.totalWaves &&
        this._countdown === null
      ) {
        this._countdown = this.config.waves.interWaveSeconds;
      }
    }
  }

  private spawnEnemy(wave: ActiveWave, typeId: string, headStart: number): void {
    const config = this.enemyConfigs.get(typeId);
    if (!config) throw new Error(`Ennemi inconnu : ${typeId}`);
    const pathIndex = this.spawnCount++ % this.paths.length;
    const hp = scaledHp(config.hp, wave.hpMultiplier);
    const max = this.config.waves.laneOffsetMax;
    const enemy: Enemy = {
      id: this.nextId++,
      config,
      wave: wave.number,
      pathIndex,
      distance: config.speed * headStart,
      remaining: 0,
      offset: max > 0 ? this.rng.range(-max, max) : 0,
      hp,
      maxHp: hp,
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      dirX: 1,
      dirY: 0,
      alive: true,
    };
    this.positionEnemy(enemy);
    enemy.prevX = enemy.x;
    enemy.prevY = enemy.y;
    this.enemies.push(enemy);
    this.enemyById.set(enemy.id, enemy);
  }

  private positionEnemy(enemy: Enemy): void {
    const path = this.paths[enemy.pathIndex]!;
    const s = path.sample(enemy.distance, this.sample);
    enemy.x = s.x - s.dirY * enemy.offset;
    enemy.y = s.y + s.dirX * enemy.offset;
    enemy.dirX = s.dirX;
    enemy.dirY = s.dirY;
    enemy.remaining = path.length - enemy.distance;
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.prevX = enemy.x;
      enemy.prevY = enemy.y;
      enemy.distance += enemy.config.speed * dt;
      const path = this.paths[enemy.pathIndex]!;
      if (enemy.distance >= path.length) {
        this.enemyReachedBase(enemy);
        if (this._phase !== 'running') return;
        continue;
      }
      this.positionEnemy(enemy);
    }
  }

  private enemyReachedBase(enemy: Enemy): void {
    enemy.alive = false;
    this._baseHp = Math.max(0, this._baseHp - enemy.config.baseDamage);
    this.events.push({ type: 'baseHit', damage: enemy.config.baseDamage, baseHp: this._baseHp });
    if (this._baseHp <= 0) {
      this._phase = 'defeat';
      this.events.push({ type: 'gameOver', victory: false, score: this._score });
      return;
    }
    this.resolveEnemy(enemy);
  }

  private updateTowers(dt: number): void {
    for (const tower of this.towers) {
      tower.cooldown -= dt;
      const target = selectTarget(tower.x, tower.y, tower.config.range, this.enemies);
      tower.targetId = target ? target.id : null;
      if (!target) {
        if (tower.cooldown < 0) tower.cooldown = 0;
        continue;
      }
      tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
      if (tower.cooldown > 0) continue;
      this.fire(tower, target);
      tower.cooldown = Math.max(0, tower.cooldown + tower.config.fireInterval);
    }
  }

  private fire(tower: Tower, target: Enemy): void {
    const config = tower.config;
    this.events.push({
      type: 'shot',
      towerId: tower.id,
      towerType: config.id,
      fromX: tower.x,
      fromY: tower.y,
      toX: target.x,
      toY: target.y,
    });
    this.projectiles.push({
      id: this.nextId++,
      towerId: tower.id,
      towerType: config.id,
      x: tower.x,
      y: tower.y,
      prevX: tower.x,
      prevY: tower.y,
      targetId: target.id,
      targetX: target.x,
      targetY: target.y,
      speed: config.projectileSpeed,
      damage: config.damage,
      splashRadius: config.splashRadius,
      traveled: 0,
      alive: true,
    });
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.prevX = p.x;
      p.prevY = p.y;
      // Obus à tête chercheuse : suit sa cible tant qu'elle vit, sinon finit sa course.
      const target = this.enemyById.get(p.targetId);
      if (target && target.alive) {
        p.targetX = target.x;
        p.targetY = target.y;
      }
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const travel = p.speed * dt;
      if (dist <= travel) {
        p.x = p.targetX;
        p.y = p.targetY;
        p.traveled += dist;
        p.alive = false;
        this.impact(p, target);
      } else {
        p.x += (dx / dist) * travel;
        p.y += (dy / dist) * travel;
        p.traveled += travel;
      }
    }
  }

  /** Arrivée d'un projectile : une cible (bulle) ou toute une zone (ballon d'eau). */
  private impact(p: Projectile, target: Enemy | undefined): void {
    this.events.push({ type: 'impact', towerType: p.towerType, x: p.x, y: p.y, radius: p.splashRadius });
    if (p.splashRadius > 0) {
      for (const enemy of candidatesInRadius(p.x, p.y, p.splashRadius, this.enemies)) {
        this.damageEnemy(enemy, p.damage);
      }
    } else if (target && target.alive) {
      this.damageEnemy(target, p.damage);
    }
  }

  private damageEnemy(enemy: Enemy, damage: number): void {
    if (!enemy.alive) return;
    enemy.hp -= damage;
    if (enemy.hp > 0) return;
    enemy.hp = 0;
    enemy.alive = false;
    this._money += enemy.config.reward;
    this._kills++;
    this._score += killScore(enemy.config, enemy.wave);
    this.events.push({
      type: 'enemyDefeated',
      enemyId: enemy.id,
      enemyType: enemy.config.id,
      x: enemy.x,
      y: enemy.y,
      reward: enemy.config.reward,
    });
    this.resolveEnemy(enemy);
  }

  /** Un ennemi a quitté le jeu (tué ou arrivé à la base) : on met à jour sa vague. */
  private resolveEnemy(enemy: Enemy): void {
    const index = this.activeWaves.findIndex((w) => w.number === enemy.wave);
    if (index < 0) return;
    const wave = this.activeWaves[index]!;
    wave.pending--;
    if (wave.pending > 0) return;

    this.activeWaves.splice(index, 1);
    const bonus = waveBonus(wave.number, this.config.economy);
    this._money += bonus;
    this._score += waveClearScore(wave.number, this.config.score);
    this._wavesCleared++;
    this.events.push({ type: 'waveCleared', wave: wave.number, bonus });
  }

  private removeResolved(): void {
    let write = 0;
    for (const enemy of this.enemies) {
      if (enemy.alive) this.enemies[write++] = enemy;
      else this.enemyById.delete(enemy.id);
    }
    this.enemies.length = write;

    write = 0;
    for (const p of this.projectiles) {
      if (p.alive) this.projectiles[write++] = p;
    }
    this.projectiles.length = write;
  }
}
