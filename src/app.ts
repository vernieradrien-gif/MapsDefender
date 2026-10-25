import pkg from '../package.json';
import { createAdService, type AdService } from './ads';
import { canShowInterstitial, dayOf } from './ads/policy';
import { loadConfig, type GameConfig } from './config';
import { createBot } from './game/bots';
import type { GameEvent } from './game/events';
import { Game, type Tower } from './game/game';
import { FixedStepLoop } from './game/loop';
import { bonusesFrom, buyUpgrade, canBuy, gemsForScore, levelOf, nextCost } from './game/progression';
import type { GameMap } from './game/types';
import { loadGameMap, MAP_IDS } from './geo/maps';
import { t } from './i18n';
import type { ViewRect } from './render/camera';
import { Effects } from './render/effects';
import { Renderer } from './render/renderer';
import {
  clearSavedGame,
  defaultProgress,
  exportProgress,
  importProgress,
  loadProgress,
  loadSavedGame,
  recordGame,
  saveGame,
  saveProgress,
  type Progress,
} from './storage/progress';
import { el } from './ui/dom';
import { Hud } from './ui/hud';
import { towerIcon } from './ui/icons';
import { attachGestures, findSlotAt } from './ui/input';
import { HelpScreen, HomeScreen, SettingsScreen, UpgradesScreen, type UpgradeView } from './ui/menus';
import { RadialMenu } from './ui/radialMenu';
import { EndScreen, PauseScreen, Toast } from './ui/screens';
import { TowerMenu, type TowerMenuInfo } from './ui/towerMenu';

/** `ad` : une publicité est affichée, le jeu est figé. */
type AppState = 'home' | 'playing' | 'paused' | 'ended' | 'ad';

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
  callNextWave(): boolean;
  /** Test de charge : base increvable et `count` virus d'un coup. */
  stress(count: number): void;
  /** Coût moyen (ms) d'une image dessinée, sur `frames` images. */
  renderCost(frames: number): number;
  /** Emplacement libre le plus proche de la base et sa position à l'écran (px CSS). */
  slotNearBase(): { id: number; x: number; y: number } | null;
}

const SELECTION_SECONDS = 3;
const END_SCREEN_DELAY_MS = 900;
/** Facteur de zoom des boutons + et −. */
const ZOOM_STEP = 1.5;
const SHARE_URL = 'https://vernieradrien-gif.github.io/MapsDefender/';

/**
 * Chef d'orchestre : accueil et menus, parties (boucle à pas fixe, sauvegarde,
 * fin de partie et gemmes), publicités, et transmission de l'état au rendu.
 */
export class App {
  private readonly config: GameConfig;
  private readonly ads: AdService;
  private readonly startMoney: number | undefined;
  private progress: Progress;
  private map: GameMap;
  private mapFallback = false;
  private game: Game;
  private state: AppState = 'home';
  /** Gemmes déjà versées pour la partie en cours, partie déjà comptée, gemmes déjà doublées. */
  private gemsAwarded = 0;
  private recorded = false;
  private doubled = false;

  private readonly root: HTMLElement;
  private readonly loop: FixedStepLoop;
  private readonly renderer: Renderer;
  private readonly effects = new Effects();
  private readonly hud: Hud;
  private readonly radial: RadialMenu;
  private readonly towerMenu: TowerMenu;
  private readonly home: HomeScreen;
  private readonly upgrades: UpgradesScreen;
  private readonly settings: SettingsScreen;
  private readonly help: HelpScreen;
  private readonly pauseScreen: PauseScreen;
  private readonly endScreen: EndScreen;
  private readonly toast: Toast;

  private selectedTowerId: number | null = null;
  private selectionExpiresAt = 0;
  private realTime = 0;
  private lastFrame: number | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private view: ViewRect = { x: 0, y: 0, width: 1, height: 1 };

  constructor(root: HTMLElement, options: AppOptions) {
    this.root = root;
    this.config = loadConfig();
    this.ads = createAdService(this.config.ads.fakeAdSeconds);
    this.progress = loadProgress();
    if (options.demo) this.progress.settings.mapId = 'fixed-demo';
    this.map = this.loadMap(this.progress.settings.mapId);
    this.startMoney = options.debug ? this.config.debug.startMoney : undefined;
    this.game = this.createGame();
    this.loop = new FixedStepLoop(this.config.simulation);

    root.classList.add('app');
    const canvas = el('canvas', 'game-canvas');
    root.append(canvas);
    this.renderer = new Renderer(canvas);
    this.renderer.setMap(this.map);

    this.hud = new Hud(root, {
      onNextWave: () => this.callNextWave(),
      onSpeed: () => this.cycleSpeed(),
      onPause: () => this.pause(),
      onZoomIn: () => this.zoomStep(ZOOM_STEP),
      onZoomOut: () => this.zoomStep(1 / ZOOM_STEP),
      onBoost: () => void this.boost(),
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
    this.home = new HomeScreen(root, {
      onPlay: () => this.startNewGame(),
      onResume: () => this.resumeGame(),
      onSelectMap: (id) => this.selectMap(id),
      onUpgrades: () => this.openMenu(this.upgrades, () => this.refreshUpgrades()),
      onSettings: () => this.openMenu(this.settings),
      onHelp: () => this.openMenu(this.help),
    });
    this.upgrades = new UpgradesScreen(root, {
      onBuy: (id) => this.buyUpgrade(id),
      onBack: () => this.showHome(),
    });
    this.settings = new SettingsScreen(
      root,
      {
        onExport: () => exportProgress(this.progress),
        onImport: (code) => this.importCode(code),
        onReset: () => this.resetProgress(),
        onPrivacyOptions: this.ads.native ? () => void this.ads.showPrivacyOptions() : null,
        onBack: () => this.showHome(),
      },
      pkg.version,
    );
    this.help = new HelpScreen(
      root,
      this.config.towers.map((tower) => ({
        id: tower.id,
        name: t(`tower.${tower.id}.name`),
        role: t(`tower.${tower.id}.role`, { slow: Math.round(tower.slow * 100) }),
        cost: tower.cost,
      })),
      () => this.showHome(),
    );
    this.pauseScreen = new PauseScreen(
      root,
      () => this.resume(),
      () => this.startNewGame(),
      () => {
        this.saveCurrentGame();
        this.showHome();
      },
    );
    this.endScreen = new EndScreen(root, {
      onReplay: () => this.startNewGame(),
      onHome: () => void this.leaveEndScreen(),
      onRevive: () => void this.revive(),
      onDouble: () => void this.doubleGems(),
      onShare: () => void this.share(),
    });

    attachGestures(canvas, {
      tap: (x, y) => this.onCanvasTap(x, y),
      pan: (dx, dy) => {
        if (this.renderer.panBy(dx, dy)) this.closeMenus();
      },
      zoom: (factor, x, y) => {
        if (this.renderer.zoomAt(factor, x, y)) this.closeMenus();
      },
      end: () => this.renderer.settle(),
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.layout());
    window.visualViewport?.addEventListener('resize', () => this.layout());
    new ResizeObserver(() => this.layout()).observe(root);
    // Pause automatique (et sauvegarde) quand l'application passe en arrière-plan.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      this.pause();
      this.saveCurrentGame();
    });
    if (options.debug) this.exposeDebugHooks();
    if (this.ads.native) void this.listenBackButton();

    this.layout();
    this.showHome();
    // Consentement RGPD au premier lancement (Android), puis bannière de l'accueil.
    void this.ads.prepare().then(() => {
      if (this.state === 'home') this.ads.showBanner();
    });
    requestAnimationFrame(this.frame);
  }

  private get speed(): number {
    return this.config.simulation.speeds[this.progress.settings.speedIndex] ?? 1;
  }

  private loadMap(id: string): GameMap {
    const loaded = loadGameMap(this.config.mapRules, { id });
    if (loaded.fallback) console.warn(`Carte réelle invalide :\n- ${loaded.errors.join('\n- ')}`);
    this.mapFallback = loaded.fallback;
    return loaded.map;
  }

  private createGame(): Game {
    return new Game(this.map, this.config, {
      bonuses: bonusesFrom(this.progress.upgrades, this.config.progression),
      ...(this.startMoney === undefined ? {} : { startMoney: this.startMoney }),
    });
  }

  private persist(): void {
    saveProgress(this.progress);
  }

  private mapName(id: string): string {
    return id === 'villagexpo' ? 'Villagexpo' : t('map.fixed.name');
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
    this.hud.setZoom(this.renderer.zoom);
    if (this.radial.isOpen) this.radial.updatePrices((id) => this.game.costOf(id), this.game.money);
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
        // Sauvegarde automatique à chaque fin de vague.
        this.saveCurrentGame();
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

  // --- Accueil et menus --------------------------------------------------------

  private hideOverlays(): void {
    for (const screen of [this.home, this.upgrades, this.settings, this.help, this.pauseScreen, this.endScreen]) {
      screen.hide();
    }
  }

  private showHome(): void {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    this.state = 'home';
    this.closeMenus();
    this.toast.hide();
    this.hideOverlays();
    const saved = loadSavedGame();
    const savedMap = saved ? MAP_IDS.find((id) => id === saved.snapshot.mapId) : undefined;
    this.home.update({
      maps: MAP_IDS.map((id) => ({
        id,
        name: this.mapName(id),
        detail: t(`map.${id}.detail`),
        record: this.progress.records[id] ?? null,
      })),
      selectedMapId: this.progress.settings.mapId,
      gems: this.progress.gems,
      saved: saved && savedMap ? { mapName: this.mapName(savedMap), wave: saved.snapshot.wavesLaunched } : null,
      debugMoney: this.startMoney ?? null,
      fallback: this.mapFallback,
    });
    this.home.show();
    this.ads.showBanner();
  }

  private openMenu(screen: { show(): void }, refresh?: () => void): void {
    this.hideOverlays();
    refresh?.();
    screen.show();
  }

  private selectMap(id: string): void {
    if (id === this.progress.settings.mapId) return;
    this.progress.settings.mapId = id;
    this.persist();
    this.map = this.loadMap(id);
    this.game = this.createGame();
    this.renderer.resetView();
    this.renderer.setMap(this.map);
    this.showHome();
  }

  private refreshUpgrades(): void {
    const views: UpgradeView[] = this.config.progression.upgrades.map((u) => {
      const state = canBuy(u, this.progress.upgrades, this.progress.gems);
      const effect = u.id === 'credits' || u.id === 'offert' ? u.effect : Math.round(u.effect * 100);
      return {
        id: u.id,
        name: t(`upgrade.${u.id}.name`),
        description: t(`upgrade.${u.id}.desc`, { effect }),
        level: levelOf(this.progress.upgrades, u.id),
        maxLevel: u.maxLevel,
        cost: nextCost(u, this.progress.upgrades),
        state,
        requires:
          state === 'locked' && u.requires
            ? t('upgrades.requires', { name: t(`upgrade.${u.requires.id}.name`), level: u.requires.level })
            : null,
      };
    });
    this.upgrades.update(this.progress.gems, views);
  }

  private buyUpgrade(id: string): void {
    const bought = buyUpgrade(id, this.progress.upgrades, this.progress.gems, this.config.progression);
    if (!bought) return;
    this.progress = { ...this.progress, upgrades: bought.levels, gems: bought.gems };
    this.persist();
    this.game = this.createGame();
    this.refreshUpgrades();
  }

  private importCode(code: string): boolean {
    const imported = importProgress(code, this.progress);
    if (!imported) return false;
    this.progress = imported;
    this.persist();
    this.game = this.createGame();
    return true;
  }

  private resetProgress(): void {
    const settings = this.progress.settings;
    this.progress = { ...defaultProgress(), settings };
    this.persist();
    clearSavedGame();
    this.game = this.createGame();
  }

  // --- Parties -----------------------------------------------------------------

  private beginPlaying(game: Game): void {
    this.game = game;
    this.gemsAwarded = 0;
    this.recorded = false;
    this.doubled = false;
    this.loop.reset();
    this.effects.clear();
    this.closeMenus();
    this.toast.hide();
    this.selectedTowerId = null;
    this.hideOverlays();
    this.ads.hideBanner();
    this.state = 'playing';
  }

  private startNewGame(): void {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    clearSavedGame();
    this.beginPlaying(this.createGame());
  }

  private resumeGame(): void {
    const saved = loadSavedGame();
    if (!saved) return this.startNewGame();
    try {
      if (saved.snapshot.mapId !== this.map.id) {
        this.progress.settings.mapId = saved.snapshot.mapId;
        this.map = this.loadMap(saved.snapshot.mapId);
        this.renderer.resetView();
        this.renderer.setMap(this.map);
      }
      const bonuses = bonusesFrom(this.progress.upgrades, this.config.progression);
      this.beginPlaying(Game.restore(this.map, this.config, saved.snapshot, bonuses));
    } catch {
      clearSavedGame();
      this.toast.show(t('toast.saveLost'));
      this.startNewGame();
    }
  }

  private saveCurrentGame(): void {
    if ((this.state === 'playing' || this.state === 'paused') && this.game.phase === 'running') {
      saveGame(this.game.snapshot(), Date.now());
    }
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

  /** Fin de partie : records, gemmes (la différence si la partie avait déjà fini avant « Continuer »). */
  private onGameOver(): void {
    this.state = 'ended';
    this.closeMenus();
    this.selectedTowerId = null;
    clearSavedGame();
    const game = this.game;
    const earned = Math.max(0, gemsForScore(game.score, this.config.progression) - this.gemsAwarded);
    this.gemsAwarded += earned;
    this.progress = recordGame(this.progress, this.map.id, game.wavesLaunched, game.score, dayOf(Date.now()), !this.recorded);
    this.progress.gems += earned;
    this.recorded = true;
    this.persist();
    this.endTimer = setTimeout(() => {
      this.endTimer = null;
      this.toast.hide();
      this.showEndScreen();
    }, END_SCREEN_DELAY_MS);
  }

  private showEndScreen(): void {
    const game = this.game;
    this.endScreen.showResult({
      victory: game.phase === 'victory',
      score: game.score,
      wave: game.wavesLaunched,
      totalWaves: game.totalWaves,
      kills: game.kills,
      baseHp: game.baseHp,
      gems: this.gemsAwarded * (this.doubled ? this.config.ads.gemsMultiplier : 1),
      canRevive: game.canRevive(),
      canDouble: !this.doubled,
    });
  }

  /** Pub récompensée ; le jeu reste figé pendant qu'elle s'affiche. */
  private async rewarded(placement: 'continue' | 'double-gems' | 'boost'): Promise<boolean> {
    const before = this.state;
    this.state = 'ad';
    const result = await this.ads.showRewarded(placement);
    this.state = before;
    this.lastFrame = null;
    if (result === 'unavailable') this.toast.show(t('toast.adUnavailable'));
    return result === 'rewarded';
  }

  private async revive(): Promise<void> {
    if (!this.game.canRevive() || !(await this.rewarded('continue'))) return;
    this.game.revive(this.config.ads.continueHp);
    this.endScreen.hide();
    this.loop.reset();
    this.state = 'playing';
    this.toast.show(t('toast.revived', { hp: this.game.baseHp }));
  }

  private async doubleGems(): Promise<void> {
    if (this.doubled || !(await this.rewarded('double-gems'))) return;
    this.doubled = true;
    this.progress.gems += this.gemsAwarded * (this.config.ads.gemsMultiplier - 1);
    this.persist();
    this.showEndScreen();
  }

  private async boost(): Promise<void> {
    if (this.state !== 'playing' || !this.game.canBoost() || !(await this.rewarded('boost'))) return;
    if (this.game.boostNextWave()) this.toast.show(t('toast.boosted', { wave: this.game.wavesLaunched + 1 }));
  }

  private async share(): Promise<void> {
    const game = this.game;
    const text = t(game.phase === 'victory' ? 'share.victory' : 'share.defeat', {
      wave: game.wavesLaunched,
      map: this.mapName(this.map.id),
      score: game.score,
    });
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: t('app.title'), text, url: SHARE_URL });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${SHARE_URL}`);
      this.toast.show(t('toast.shareCopied'));
    } catch {
      // Partage annulé : rien à faire.
    }
  }

  /** Retour à l'accueil après une partie : interstitiel si le rythme le permet. */
  private async leaveEndScreen(): Promise<void> {
    const now = Date.now();
    if (canShowInterstitial(this.progress.ads, now, this.config.ads.interstitialMinSeconds)) {
      this.endScreen.hide();
      this.state = 'ad';
      await this.ads.showInterstitial();
      this.progress.ads.lastInterstitialAt = now;
      this.persist();
    }
    this.showHome();
  }

  // --- Commandes du joueur ---------------------------------------------------

  private callNextWave(): void {
    if (this.state === 'playing') this.game.callNextWave();
  }

  private cycleSpeed(): void {
    const count = this.config.simulation.speeds.length;
    this.progress.settings.speedIndex = (this.progress.settings.speedIndex + 1) % count;
    this.persist();
  }

  private zoomStep(factor: number): void {
    this.closeMenus();
    this.renderer.zoomStep(factor);
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
    this.radial.updatePrices((id) => this.game.costOf(id), this.game.money);
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

  // --- Bouton « Retour » d'Android ----------------------------------------------

  private async listenBackButton(): Promise<void> {
    const { App: NativeApp } = await import('@capacitor/app');
    await NativeApp.addListener('backButton', () => {
      if (this.onBack() === 'exit') void NativeApp.exitApp();
    });
  }

  /** En partie : pause ; dans un menu : retour à l'accueil ; sur l'accueil : quitter. */
  private onBack(): 'handled' | 'exit' {
    if (this.radial.isOpen || this.towerMenu.isOpen) {
      this.closeMenus();
      return 'handled';
    }
    switch (this.state) {
      case 'playing':
        this.pause();
        return 'handled';
      case 'paused':
        this.resume();
        return 'handled';
      case 'ended':
        void this.leaveEndScreen();
        return 'handled';
      case 'home':
        if (this.upgrades.visible || this.settings.visible || this.help.visible) {
          this.showHome();
          return 'handled';
        }
        return 'exit';
      default:
        return 'handled';
    }
  }

  // --- Mode debug --------------------------------------------------------------

  private exposeDebugHooks(): void {
    const hooks: DebugHooks = {
      game: () => this.game,
      start: () => this.startNewGame(),
      fastForward: (seconds) => {
        const dt = this.loop.stepSeconds;
        for (let i = 0; i < Math.round(seconds / dt) && !this.game.isOver; i++) {
          this.game.step(dt);
          this.handleEvents(this.game.drainEvents());
        }
      },
      autoBuild: () => createBot(this.game, 'bon')(),
      callNextWave: () => this.game.callNextWave(),
      stress: (count) => {
        const config = structuredClone(this.config);
        config.base.hp = 1_000_000;
        // Virus lents : ils restent tous à l'écran pendant la mesure.
        for (const enemy of config.enemies) enemy.speed = 6;
        Object.assign(config.waves, { countBase: count, countPerWave: 0, spawnIntervalStart: 0.04, spawnIntervalMin: 0.04 });
        this.beginPlaying(new Game(this.map, config, { startMoney: 0, mapFactor: 1 }));
        this.game.callNextWave();
      },
      renderCost: (frames) => {
        const state = { selectedSlotId: null, selectedTowerId: null, nextRange: null, realTime: this.realTime };
        const start = performance.now();
        for (let i = 0; i < frames; i++) this.renderer.render(this.game, 0.5, state, this.effects);
        return (performance.now() - start) / frames;
      },
      slotNearBase: () => {
        const base = this.map.base;
        const free = this.map.slots.filter((slot) => !this.game.towerAt(slot.id));
        free.sort((a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y));
        const slot = free[0];
        return slot ? { id: slot.id, ...this.renderer.slotScreen(slot) } : null;
      },
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
