import { loadConfig, type GameConfig } from './config';
import type { GameEvent } from './game/events';
import { Game } from './game/game';
import { FixedStepLoop } from './game/loop';
import type { GameMap } from './game/types';
import { createFixedMap } from './geo/fixedMap';
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

type AppState = 'start' | 'playing' | 'paused' | 'ended';

export interface AppOptions {
  /** Mode test (`?debug` dans l'adresse) : argent de départ augmenté. */
  debug: boolean;
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
    this.map = createFixedMap(this.config.mapRules);
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
    this.toast = new Toast(root);
    this.startScreen = new StartScreen(root, () => this.start());
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
    if (this.selectedTowerId !== null && this.realTime > this.selectionExpiresAt) {
      this.selectedTowerId = null;
    }

    this.hud.update(this.game, this.speed);
    if (this.radial.isOpen) this.radial.updateMoney(this.game.money);
    this.renderer.render(
      this.game,
      this.loop.alpha,
      {
        selectedSlotId: this.radial.slotId,
        selectedTowerId: this.selectedTowerId,
        realTime: this.realTime,
      },
      this.effects,
    );
    requestAnimationFrame(this.frame);
  };

  private handleEvents(events: GameEvent[]): void {
    this.effects.consume(events, (towerId) => this.towerElevation(towerId), this.game.map.base);
    for (const e of events) {
      if (e.type === 'waveStarted') {
        this.toast.show(t('toast.waveStarted', { wave: e.wave }));
      } else if (e.type === 'waveCleared') {
        this.toast.show(t('toast.waveCleared', { wave: e.wave, bonus: e.bonus }));
      } else if (e.type === 'gameOver') {
        this.onGameOver();
      }
    }
  }

  /** Hauteur (m) du support d'une tourelle, pour que ses effets partent du toit. */
  private towerElevation(towerId: number): number {
    const tower = this.game.towers.find((t) => t.id === towerId);
    const slot = tower && this.game.map.slots.find((s) => s.id === tower.slotId);
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
    this.radial.close();
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
    this.radial.close();
    this.toast.hide();
    this.selectedTowerId = null;
    this.pauseScreen.hide();
    this.endScreen.hide();
    this.state = 'playing';
  }

  private onGameOver(): void {
    this.state = 'ended';
    this.radial.close();
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

  private onCanvasTap(x: number, y: number): void {
    if (this.state !== 'playing') return;
    const slot = findSlotAt(this.game.map.slots, x, y, this.renderer.slotTouchRadius, (s) =>
      this.renderer.slotScreen(s),
    );
    if (!slot) {
      this.radial.close();
      this.selectedTowerId = null;
      return;
    }
    const tower = this.game.towerAt(slot.id);
    if (tower) {
      this.radial.close();
      this.select(tower.id);
      this.toast.show(
        `${t(`tower.${tower.config.id}.name`)} · ${t('tower.range', { range: tower.config.range })}`,
      );
      return;
    }
    if (this.radial.slotId === slot.id) {
      this.radial.close();
      return;
    }
    this.selectedTowerId = null;
    this.radial.open(slot.id, this.renderer.slotScreen(slot), this.view, this.game.money);
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

  private select(towerId: number): void {
    this.selectedTowerId = towerId;
    this.selectionExpiresAt = this.realTime + SELECTION_SECONDS;
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
    this.radial.close();
  }
}

function clampIndex(value: unknown, length: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length ? value : 0;
}
