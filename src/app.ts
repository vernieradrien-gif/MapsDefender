import { loadConfig, type GameConfig } from './config';
import { createBot } from './game/bots';
import type { GameEvent } from './game/events';
import { Game, type Tower } from './game/game';
import { FixedStepLoop } from './game/loop';
import type { GameMap } from './game/types';
import { loadGameMap } from './geo/maps';
import { t } from './i18n';
import type { ViewRect } from './render/camera';
import { Effects } from './render/effects';
import { Renderer } from './render/renderer';
import { readJSON, writeJSON } from './storage';
import { el } from './ui/dom';
import { Hud } from './ui/hud';
import { towerIcon } from './ui/icons';
import { findSlotAt, onTap } from './ui/input';
import { RadialMenu } from './ui/radialMenu';
import { EndScreen, PauseScreen, StartScreen, Toast } from './ui/screens';
import { TowerMenu, type TowerMenuInfo } from './ui/towerMenu';

type AppState = 'start' | 'playing' | 'paused' | 'ended';

export interface AppOptions {
  /** Mode test (`?debug` dans l'adresse) : argent de départ augmenté, commandes de test. */
  debug: boolean;
  /** Carte de démonstration au lieu de la carte réelle (`?demo`). */
  demo: boolean;
}

/** Commandes de test exposées en mode debug (captures automatiques). */
export interface DebugHooks {
  game(): Game;
  start(): void;
  /** Avance la simulation de `seconds` secondes d'un coup. */
  fastForward(seconds: number): void;
  /** Laisse le joueur automatique « bon » construire et améliorer. */
  autoBuild(): void;
}

const SELECTION_SECONDS = 3;
const END_SCREEN_DELAY_MS = 900;

/**
 * Chef d'orchestre : crée la partie, fait tourner la boucle à pas fixe,
 * relaie les commandes de l'interface et transmet l'état au rendu.
 */
export class App {
  private readonly config: GameConfig;
  private readonly map: GameMap;
  private readonly startMoney: number | undefined;
  private game: Game;
  private state: AppState = 'start';

  private readonly root: HTMLElement;
  private readonly loop: FixedStepLoop;
  private readonly renderer: Renderer;
  private readonly effects = new Effects();
  private readonly hud: Hud;
  private readonly radial: RadialMenu;
  private readonly towerMenu: TowerMenu;
  private readonly startScreen: StartScreen;
  private readonly pauseScreen: PauseScreen;
  private readonly endScreen: EndScreen;
  private readonly toast: Toast;

  private speedIndex: number;
  private selectedTowerId: number | null = null;
  private selectionExpiresAt = 0;
  private realTime = 0;
  private lastFrame: number | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private view: ViewRect = { x: 0, y: 0, width: 1, height: 1 };

  constructor(root: HTMLElement, options: AppOptions) {
    this.root = root;
    this.config = loadConfig();
    const loaded = loadGameMap(this.config.mapRules, { demo: options.demo });
    if (loaded.fallback) console.warn(`Carte réelle invalide :\n- ${loaded.errors.join('\n- ')}`);
    this.map = loaded.map;
    this.startMoney = options.debug ? this.config.debug.startMoney : undefined;
    this.game = this.createGame();
    this.loop = new FixedStepLoop(this.config.simulation);
    this.speedIndex = clampIndex(readJSON('speedIndex', 0), this.config.simulation.speeds.length);

    root.classList.add('app');
    const canvas = el('canvas', 'game-canvas');
    root.append(canvas);
    this.renderer = new Renderer(canvas);
    this.renderer.setMap(this.map);

    this.hud = new Hud(root, {
      onNextWave: () => this.callNextWave(),
      onSpeed: () => this.cycleSpeed(),
      onPause: () => this.pause(),
    });
    this.radial = new RadialMenu(
      root,
      this.config.towers.map((tower) => ({
        id: tower.id,
        label: t(`tower.${tower.id}.name`),
        cost: tower.cost,
        iconHtml: towerIcon(tower.id),
      })),
      (towerId) => this.buildTower(towerId),
    );
    this.towerMenu = new TowerMenu(root, {
      onUpgrade: () => this.upgradeSelected(),
      onSell: () => this.sellSelected(),
    });
    this.toast = new Toast(root);
    this.startScreen = new StartScreen(
      root,
      {
        mapName: t(this.map.name),
        attribution: this.map.attribution ?? null,
        fallback: loaded.fallback,
        towers: this.config.towers.map((tower) => ({
          id: tower.id,
          name: t(`tower.${tower.id}.name`),
          role: t(`tower.${tower.id}.role`, { slow: Math.round(tower.slow * 100) }),
          cost: tower.cost,
        })),
      },
      () => this.start(),
    );
    this.startScreen.setDebugMoney(this.startMoney ?? null);
    this.pauseScreen = new PauseScreen(root, () => this.resume(), () => this.restart());
    this.endScreen = new EndScreen(root, () => this.restart());
    this.startScreen.show();

    onTap(canvas, (x, y) => this.onCanvasTap(x, y));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.layout());
    window.visualViewport?.addEventListener('resize', () => this.layout());
    new ResizeObserver(() => this.layout()).observe(root);
    // Pause automatique quand l'application passe en arrière-plan.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    if (options.debug) this.exposeDebugHooks();

    this.layout();
    requestAnimationFrame(this.frame);
  }

  private get speed(): number {
    return this.config.simulation.speeds[this.speedIndex] ?? 1;
  }

  private createGame(): Game {
    return new Game(this.map, this.config, this.startMoney === undefined ? {} : { startMoney: this.startMoney });
  }

  // --- Boucle ----------------------------------------------------------------

  private readonly frame = (now: number): void => {
    const seconds = this.lastFrame === null ? 0 : (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    this.realTime += seconds;

    if (this.state === 'playing') {
      const steps = this.loop.advance(seconds, this.speed, (dt) => this.game.step(dt));
      this.effects.update(steps * this.loop.stepSeconds);
      this.handleEvents(this.game.drainEvents());
    }
    if (this.selectedTowerId !== null && !this.towerMenu.isOpen && this.realTime > this.selectionExpiresAt) {
      this.selectedTowerId = null;
    }

    this.hud.update(this.game, this.speed);
    if (this.radial.isOpen) this.radial.updateMoney(this.game.money);
    if (this.towerMenu.isOpen) this.towerMenu.updateMoney(this.game.money);
    const menuTower = this.towerMenu.towerId === null ? undefined : this.game.getTower(this.towerMenu.towerId);
    this.renderer.render(
      this.game,
      this.loop.alpha,
      {
        selectedSlotId: this.radial.slotId,
        selectedTowerId: this.selectedTowerId,
        nextRange: menuTower ? (this.game.nextLevelStats(menuTower)?.range ?? null) : null,
        realTime: this.realTime,
      },
      this.effects,
    );
    requestAnimationFrame(this.frame);
  };

  private handleEvents(events: GameEvent[]): void {
    this.effects.consume(events, (towerId) => this.towerElevation(towerId), this.renderer.baseAnchor);
    for (const e of events) {
      if (e.type === 'waveStarted') {
        this.toast.show(t(e.boss ? 'toast.bossWave' : 'toast.waveStarted', { wave: e.wave }), e.boss ? 2600 : 1600);
      } else if (e.type === 'waveCleared') {
        this.toast.show(t('toast.waveCleared', { wave: e.wave, bonus: e.bonus }));
      } else if (e.type === 'enemySplit') {
        this.toast.show(t('toast.split', { count: e.count }));
      } else if (e.type === 'gameOver') {
        this.onGameOver();
      }
    }
  }

  /** Hauteur (m) du support d'une tourelle, pour que ses effets partent du toit. */
  private towerElevation(towerId: number): number {
    const tower = this.game.getTower(towerId);
    const slot = tower && this.game.slot(tower.slotId);
    return slot?.elevation ?? 0;
  }

  // --- États de l'application ----------------------------------------------

  private start(): void {
    this.startScreen.hide();
    this.state = 'playing';
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.closeMenus();
    this.pauseScreen.show();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.pauseScreen.hide();
    this.state = 'playing';
  }

  private restart(): void {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    this.game = this.createGame();
    this.loop.reset();
    this.effects.clear();
    this.closeMenus();
    this.toast.hide();
    this.selectedTowerId = null;
    this.pauseScreen.hide();
    this.endScreen.hide();
    this.state = 'playing';
  }

  private onGameOver(): void {
    this.state = 'ended';
    this.closeMenus();
    this.selectedTowerId = null;
    const game = this.game;
    this.endTimer = setTimeout(() => {
      this.endTimer = null;
      this.toast.hide();
      this.endScreen.showResult({
        victory: game.phase === 'victory',
        score: game.score,
        wave: game.wavesLaunched,
        totalWaves: game.totalWaves,
        kills: game.kills,
        baseHp: game.baseHp,
      });
    }, END_SCREEN_DELAY_MS);
  }

  // --- Commandes du joueur ---------------------------------------------------

  private callNextWave(): void {
    if (this.state === 'playing') this.game.callNextWave();
  }

  private cycleSpeed(): void {
    this.speedIndex = (this.speedIndex + 1) % this.config.simulation.speeds.length;
    writeJSON('speedIndex', this.speedIndex);
  }

  private closeMenus(): void {
    this.radial.close();
    this.towerMenu.close();
  }

  private onCanvasTap(x: number, y: number): void {
    if (this.state !== 'playing') return;
    const slot = findSlotAt(this.game.map.slots, x, y, this.renderer.slotTouchRadius, (s) =>
      this.renderer.slotScreen(s),
    );
    if (!slot) {
      this.closeMenus();
      this.selectedTowerId = null;
      return;
    }
    const tower = this.game.towerAt(slot.id);
    if (tower) {
      this.radial.close();
      if (this.towerMenu.towerId === tower.id) {
        this.towerMenu.close();
        this.selectedTowerId = null;
        return;
      }
      this.selectedTowerId = tower.id;
      this.towerMenu.open(tower.id, this.renderer.slotScreen(slot), this.view, this.towerInfo(tower), this.game.money);
      return;
    }
    this.towerMenu.close();
    if (this.radial.slotId === slot.id) {
      this.radial.close();
      return;
    }
    this.selectedTowerId = null;
    this.radial.open(slot.id, this.renderer.slotScreen(slot), this.view, this.game.money);
  }

  private towerInfo(tower: Tower): TowerMenuInfo {
    const slot = this.game.slot(tower.slotId);
    return {
      name: t(`tower.${tower.config.id}.name`),
      level: tower.level,
      maxLevel: this.config.upgrades.maxLevel,
      range: tower.range,
      roof: slot?.kind === 'roof' ? { bonus: tower.heightBonus, height: slot.elevation } : null,
      upgradeCost: this.game.nextUpgradeCost(tower),
      sellValue: this.game.sellValue(tower),
    };
  }

  private buildTower(towerId: string): void {
    const slotId = this.radial.slotId;
    if (slotId === null || this.state !== 'playing') return;
    const result = this.game.placeTower(slotId, towerId);
    if (result === 'insufficient-funds') {
      this.toast.show(t('toast.notEnoughMoney'));
      return;
    }
    this.radial.close();
    const tower = this.game.towerAt(slotId);
    if (result === 'ok' && tower) this.select(tower.id);
  }

  private upgradeSelected(): void {
    const towerId = this.towerMenu.towerId;
    const tower = towerId === null ? undefined : this.game.getTower(towerId);
    if (!tower || this.state !== 'playing') return;
    const result = this.game.upgradeTower(tower.id);
    if (result === 'insufficient-funds') this.toast.show(t('toast.notEnoughMoney'));
    else if (result === 'ok') this.toast.show(t('toast.upgraded', { name: t(`tower.${tower.config.id}.name`), level: tower.level }));
    this.towerMenu.update(this.towerInfo(tower), this.game.money);
  }

  private sellSelected(): void {
    const towerId = this.towerMenu.towerId;
    const tower = towerId === null ? undefined : this.game.getTower(towerId);
    if (!tower || this.state !== 'playing') return;
    const refund = this.game.sellTower(tower.id);
    this.towerMenu.close();
    this.selectedTowerId = null;
    if (refund !== null) this.toast.show(t('toast.sold', { name: t(`tower.${tower.config.id}.name`), refund }));
  }

  private select(towerId: number): void {
    this.selectedTowerId = towerId;
    this.selectionExpiresAt = this.realTime + SELECTION_SECONDS;
  }

  // --- Mode debug --------------------------------------------------------------

  private exposeDebugHooks(): void {
    const hooks: DebugHooks = {
      game: () => this.game,
      start: () => this.start(),
      fastForward: (seconds) => {
        const dt = this.loop.stepSeconds;
        for (let i = 0; i < Math.round(seconds / dt) && !this.game.isOver; i++) {
          this.game.step(dt);
          this.handleEvents(this.game.drainEvents());
        }
      },
      autoBuild: () => createBot(this.game, 'bon')(),
    };
    Object.assign(window, { streetDefense: hooks });
  }

  // --- Mise en page ----------------------------------------------------------

  private layout(): void {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const top = this.hud.top.getBoundingClientRect().bottom;
    const bottom = this.hud.bottom.getBoundingClientRect().top;
    this.view = { x: 0, y: top, width, height: Math.max(1, bottom - top) };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(width, height, dpr, this.view);
    this.closeMenus();
  }
}

function clampIndex(value: unknown, length: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length ? value : 0;
}
