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
import { createHttp } from './geo/http';
import { createMapBuilder } from './geo/mapBuilderClient';
import { loadGameMap, MAP_IDS } from './geo/maps';
import { OsmClient, OsmError } from './geo/osmClient';
import { placeQuery, type OsmPlace } from './geo/osmMap';
import {
  generatePlaceMap,
  imaginaryMap,
  PLACE_MAP_VERSION,
  rebuildWithBase,
  type BuildRequest,
  type MapBuildFn,
  type PlaceMap,
  type PlaceMapInfo,
} from './geo/placeMap';
import { placeKey, placeSeedKey, type PlaceTarget } from './geo/places';
import { interiorPoint } from './geo/geometry';
import type { OverpassProgress } from './geo/osmClient';
import type { LatLon } from './geo/projection';
import { t } from './i18n';
import type { ViewRect } from './render/camera';
import { Effects } from './render/effects';
import { Renderer } from './render/renderer';
import { openMapCache, type MapCache } from './storage/mapCache';
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
import { LoadingScreen } from './ui/loadingScreen';
import { HelpScreen, HomeScreen, SettingsScreen, UpgradesScreen, type MapChoice, type UpgradeView } from './ui/menus';
import { PickBanner } from './ui/pickBanner';
import { PlaceScreen } from './ui/placeScreen';
import { RadialMenu } from './ui/radialMenu';
import { EndScreen, PauseScreen, Toast } from './ui/screens';
import { TowerMenu, type TowerMenuInfo } from './ui/towerMenu';

/** `ad` : une publicité est affichée, le jeu est figé. */
/** `pickBase` : le joueur touche sur la carte le bâtiment qui sera la base. */
type AppState = 'home' | 'playing' | 'paused' | 'ended' | 'ad' | 'pickBase';

/** Comment la carte prête a été obtenue (notes de l'aperçu). */
interface ReadyHow {
  cached: boolean;
  fallback: boolean;
}

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
/** Cartes fournies avec le jeu (les autres viennent du cache des lieux). */
const BUILT_IN = new Set<string>(MAP_IDS);
/** Nombre de cartes récentes sur l'accueil. */
const HOME_MAPS = 3;
/** Délai (ms) pendant lequel un toucher n'est pas pris en compte en entrant dans « Choisir la base ». */
const PICK_GRACE_MS = 400;

/** Lieu demandé (pour « Réessayer ») : un résultat de recherche ou la position du joueur. */
type PlaceRequest = { kind: 'target'; target: PlaceTarget } | { kind: 'position'; center: LatLon };

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
  private readonly placeScreen: PlaceScreen;
  private readonly loading: LoadingScreen;
  private readonly toast: Toast;
  private readonly pickBanner: PickBanner;

  /** Lieux : cache des cartes générées, service OSM, construction, état de l'écran de choix. */
  private mapCache: MapCache | null = null;
  private placeInfos: PlaceMapInfo[] = [];
  private readonly osm: OsmClient;
  private builder: MapBuildFn | null = null;
  private generation: AbortController | null = null;
  private placeRadius: number;
  private placeResults: PlaceTarget[] = [];
  private placeBusy: 'search' | 'locate' | null = null;
  private placeMessage: { text: string; error: boolean } | null = null;
  private lastRequest: PlaceRequest | null = null;
  private readyPlace: PlaceMap | null = null;
  /** Lieu, données et notes de la carte prête (pour la reconstruire avec une autre base). */
  private readyTarget: PlaceTarget | null = null;
  private readySource: BuildRequest | null = null;
  private readyHow: ReadyHow = { cached: false, fallback: false };
  /** Début du mode « Choisir la base » (le toucher qui l'ouvre ne choisit rien). */
  private pickStartedAt = 0;

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
    this.osm = new OsmClient(createHttp(pkg.version), this.config.places);
    this.placeRadius = this.config.places.defaultRadius;
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
    this.pickBanner = new PickBanner(root, () => this.cancelPickBase());
    this.home = new HomeScreen(root, {
      onPlay: () => this.startNewGame(),
      onResume: () => void this.resumeGame(),
      onSelectMap: (id) => void this.selectMap(id),
      onOtherPlace: () => this.openPlaces(),
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
    this.placeScreen = new PlaceScreen(root, {
      onSearch: (query) => void this.searchPlace(query),
      onPick: (index) => {
        const target = this.placeResults[index];
        if (target) void this.generate({ kind: 'target', target });
      },
      onMyPosition: () => void this.locate(),
      onRadius: (radius) => {
        this.placeRadius = radius;
        this.refreshPlaces();
      },
      onSelectMap: (id) => void this.selectMap(id),
      onImaginary: () => void this.imaginary(),
      onBack: () => this.showHome(),
    });
    this.loading = new LoadingScreen(root, {
      onCancel: () => this.cancelGeneration(),
      onRetry: () => {
        if (this.lastRequest) void this.generate(this.lastRequest);
      },
      onPlay: () => this.playReadyPlace(),
      onBack: () => this.openPlaces(),
      onImaginary: () => void this.imaginary(),
      onPickBase: () => this.startPickBase(),
    });
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
    void this.initPlaces();
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
    if (id === 'villagexpo') return 'Villagexpo';
    if (id === 'fixed-demo') return t('map.fixed.name');
    return this.placeInfos.find((i) => i.mapId === id)?.name ?? (this.map.id === id ? this.map.name : id);
  }

  /** Carte par identifiant : fournie avec le jeu, ou enregistrée dans le cache des lieux. */
  private async mapById(id: string): Promise<GameMap | null> {
    if (BUILT_IN.has(id)) return this.loadMap(id);
    return (await this.mapCache?.byMapId(id))?.map ?? null;
  }

  /** Change la carte du jeu (nouvelle partie prête, vue recadrée). */
  private applyMap(map: GameMap): void {
    this.map = map;
    this.progress.settings.mapId = map.id;
    this.persist();
    this.game = this.createGame();
    this.renderer.resetView();
    this.renderer.setMap(map);
  }

  /** Ouvre le cache des cartes, puis la dernière carte choisie si c'est un lieu enregistré. */
  private async initPlaces(): Promise<void> {
    this.mapCache = await openMapCache(this.config.places.cacheMaxMaps);
    this.placeInfos = await this.mapCache.list();
    const wanted = this.progress.settings.mapId;
    if (!BUILT_IN.has(wanted) && this.map.id !== wanted) {
      const place = await this.mapCache.byMapId(wanted);
      if (place && this.state === 'home') this.applyMap(place.map);
      else if (!place) {
        this.progress.settings.mapId = this.map.id;
        this.persist();
      }
    }
    if (this.home.visible) this.showHome();
    else if (this.placeScreen.visible) this.refreshPlaces();
  }

  /** Clés des cartes à ne pas oublier (carte en cours, partie sauvegardée). */
  private keptPlaceKeys(): string[] {
    const ids = [this.map.id, loadSavedGame()?.snapshot.mapId];
    return this.placeInfos.filter((i) => ids.includes(i.mapId)).map((i) => i.key);
  }

  /** Cartes proposées : lieux enregistrés (le plus récent d'abord), puis cartes du jeu. */
  private mapChoices(): (MapChoice & { recency: number })[] {
    const record = (id: string) => this.progress.records[id] ?? null;
    const places = this.placeInfos.map((info) => ({
      id: info.mapId,
      name: info.name,
      detail: info.imaginary
        ? t('map.imaginaryDetail')
        : info.detail
          ? t('map.placeDetail', { detail: info.detail, radius: info.requestedRadius })
          : t('place.radiusOption', { radius: info.requestedRadius }),
      record: record(info.mapId),
      recency: Math.max(info.lastPlayed, info.createdAt),
    }));
    const builtIns = MAP_IDS.map((id, i) => ({
      id,
      name: this.mapName(id),
      detail: t(`map.${id}.detail`),
      record: record(id),
      recency: (Date.parse(record(id)?.lastPlayed ?? '') || 0) - i,
    }));
    return [...places, ...builtIns];
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
    const screens = [this.home, this.upgrades, this.settings, this.help, this.placeScreen, this.loading, this.pauseScreen, this.endScreen];
    for (const screen of screens) {
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
    const savedId = saved?.snapshot.mapId ?? '';
    const savedKnown = BUILT_IN.has(savedId) || this.placeInfos.some((i) => i.mapId === savedId);
    // Cartes récentes : la carte choisie, puis les plus récemment utilisées.
    const choices = this.mapChoices();
    const selected = choices.filter((c) => c.id === this.map.id);
    const others = choices.filter((c) => c.id !== this.map.id).sort((a, b) => b.recency - a.recency);
    this.home.update({
      maps: [...selected, ...others].slice(0, HOME_MAPS),
      selectedMapId: this.map.id,
      gems: this.progress.gems,
      saved: saved && savedKnown ? { mapName: this.mapName(savedId), wave: saved.snapshot.wavesLaunched } : null,
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

  private async selectMap(id: string): Promise<void> {
    if (id !== this.map.id) {
      const map = await this.mapById(id);
      if (!map) {
        this.toast.show(t('toast.mapMissing'));
        this.placeInfos = (await this.mapCache?.list()) ?? [];
        return this.placeScreen.visible ? this.refreshPlaces() : this.showHome();
      }
      this.applyMap(map);
    }
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

  // --- Lieux : adresse, position, génération ------------------------------------

  private openPlaces(): void {
    this.cancelGeneration();
    this.hideOverlays();
    this.refreshPlaces();
    this.placeScreen.show();
  }

  private refreshPlaces(): void {
    this.placeScreen.update({
      radius: this.placeRadius,
      radii: this.config.places.radii,
      busy: this.placeBusy,
      message: this.placeMessage,
      results: this.placeResults.map((r) => ({
        name: r.name,
        detail: r.detail,
        note: r.numberMissing ? t('place.numberMissing') : null,
      })),
      saved: this.mapChoices(),
      selectedMapId: this.map.id,
      volatileCache: this.mapCache !== null && !this.mapCache.persistent,
    });
  }

  /** Message d'erreur lisible pour le joueur. */
  private placeError(error: unknown): string {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (error instanceof OsmError) {
      if (error.code === 'notFound') return t('place.notFound');
      if (offline) return t('place.offline');
      if (error.code === 'overpass') return t('loading.errorOverpass');
      if (error.code === 'network') return t('loading.errorNetwork');
    }
    return t('loading.errorOther', { error: error instanceof Error ? error.message : String(error) });
  }

  private async searchPlace(query: string): Promise<void> {
    if (this.placeBusy) return;
    this.placeBusy = 'search';
    this.placeMessage = null;
    this.placeResults = [];
    this.refreshPlaces();
    try {
      this.placeResults = await this.osm.search(query, new AbortController().signal);
    } catch (error) {
      const notFound = error instanceof OsmError && error.code === 'notFound';
      this.placeMessage = {
        text: notFound ? t('place.notFound') : navigator.onLine === false ? t('place.offline') : t('place.network'),
        error: true,
      };
    }
    this.placeBusy = null;
    this.refreshPlaces();
  }

  /** Position GPS, demandée seulement à l'appui sur « Ma position ». */
  private async locate(): Promise<void> {
    if (this.placeBusy) return;
    if (!navigator.geolocation) {
      this.placeMessage = { text: t('place.gpsUnavailable'), error: true };
      return this.refreshPlaces();
    }
    this.placeBusy = 'locate';
    this.placeMessage = null;
    this.refreshPlaces();
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, maximumAge: 60000 }),
      );
      this.placeBusy = null;
      await this.generate({ kind: 'position', center: { lat: position.coords.latitude, lon: position.coords.longitude } });
    } catch (error) {
      const denied = typeof error === 'object' && error !== null && (error as GeolocationPositionError).code === 1;
      this.placeBusy = null;
      this.placeMessage = { text: denied ? t('place.gpsDenied') : t('place.gpsUnavailable'), error: true };
      this.refreshPlaces();
    }
  }

  private mapBuilder(): MapBuildFn {
    this.builder ??= createMapBuilder(this.config);
    return this.builder;
  }

  private cancelGeneration(): void {
    if (!this.generation) return;
    this.generation.abort();
    this.generation = null;
    this.hideOverlays();
    this.refreshPlaces();
    this.placeScreen.show();
  }

  /** Carte d'un lieu : depuis le cache si elle y est, sinon téléchargée et construite. */
  private async generate(request: PlaceRequest): Promise<void> {
    this.generation?.abort();
    const controller = new AbortController();
    const { signal } = controller;
    this.generation = controller;
    this.lastRequest = request;
    const radius = this.placeRadius;
    const steps = [
      ...(request.kind === 'position' ? [{ id: 'name', label: t('loading.name') }] : []),
      { id: 'download', label: t('loading.download') },
      { id: 'build', label: t('loading.build') },
    ];
    this.hideOverlays();
    const title = request.kind === 'target' ? request.target.name : t('place.myPositionName');
    this.loading.start(title, steps);
    try {
      let target: PlaceTarget;
      if (request.kind === 'position') {
        this.loading.setStep('name', 'active');
        const named = await this.osm.reverse(request.center, signal).catch((error: unknown) => {
          if (signal.aborted) throw error;
          return null;
        });
        target = named ?? {
          center: request.center,
          name: t('place.myPositionName'),
          detail: `${request.center.lat.toFixed(4)}, ${request.center.lon.toFixed(4)}`,
          precise: false,
          query: null,
        };
      } else target = request.target;

      const cached = await this.mapCache?.get(placeKey(target.center, radius));
      if (cached && cached.info.version === PLACE_MAP_VERSION) {
        this.generation = null;
        this.readySource = null;
        return this.showReady(cached, target, { cached: true, fallback: false });
      }
      const outcome = await generatePlaceMap(target, radius, {
        config: this.config,
        signal,
        build: this.mapBuilder(),
        overpass: (query, s) => this.osm.overpass(query, s, (p) => this.showDownload(p)),
        onProgress: (p) => {
          if (p.step === 'download') {
            this.loading.setStep('download', 'active', p.enlarged ? t('loading.enlarge', { radius: p.radius }) : t('loading.download'));
          } else if (p.step === 'build') this.loading.setStep('build', 'active');
          else this.loading.setStep('fallback', 'active', t('loading.fallback'));
        },
      });
      if (signal.aborted) return;
      this.generation = null;
      if (this.mapCache) {
        await this.mapCache.save(outcome.place, this.keptPlaceKeys());
        this.placeInfos = await this.mapCache.list();
      }
      this.readySource = outcome.source;
      this.showReady(outcome.place, target, { cached: false, fallback: outcome.fallbackReason !== null });
    } catch (error) {
      if (signal.aborted) return;
      this.generation = null;
      console.warn('Carte non créée', error);
      this.loading.showError(this.placeError(error), !(error instanceof OsmError && error.code === 'notFound'));
    }
  }

  /** Aperçu du tracé et « Jouer ici ». */
  private showReady(place: PlaceMap, target: PlaceTarget | null, how: ReadyHow): void {
    this.readyPlace = place;
    this.readyTarget = target;
    this.readyHow = how;
    const info = place.info;
    const notes: string[] = [];
    if (how.fallback) notes.push(t('loading.fallbackNote'));
    if (how.cached) notes.push(t('loading.cached'));
    if (!info.imaginary && info.radius > info.requestedRadius) notes.push(t('loading.enlarged', { radius: info.radius }));
    if (info.baseChosen) notes.push(t('loading.baseChosen'));
    else if (!info.imaginary && target?.numberMissing) notes.push(t('loading.numberMissing'));
    else if (!info.imaginary && target?.precise) notes.push(t(info.baseAtAddress ? 'loading.baseAtAddress' : 'loading.noBuildingAtAddress'));
    this.hideOverlays();
    this.loading.showResult({
      map: place.map,
      title: info.name,
      stats: t('loading.stats', {
        entries: info.entries,
        routes: info.routes,
        length: info.averageRouteLength,
        slots: info.slots,
      }),
      notes,
      osm: !info.imaginary,
      canPickBase: !info.imaginary && info.center !== null && target !== null,
    });
  }

  /** Étape « Téléchargement » : serveur de secours, pause avant un nouveau tour. */
  private showDownload(p: OverpassProgress): void {
    if (p.kind === 'pause') {
      this.loading.setStep('download', 'active', t('loading.pause', { seconds: p.seconds }));
    } else if (p.round > 0) {
      this.loading.setStep('download', 'active', t('loading.mirrorRetry', { n: p.attempt + 1 }));
    } else if (p.attempt > 0) {
      this.loading.setStep('download', 'active', t('loading.mirror', { n: p.attempt }));
    }
  }

  // --- Choisir la base sur la carte ----------------------------------------------

  /** Carte prête affichée en plein écran, zoomable : le joueur touche le bâtiment de la base. */
  private startPickBase(): void {
    const place = this.readyPlace;
    if (!place) return;
    this.hideOverlays();
    this.closeMenus();
    this.state = 'pickBase';
    this.pickStartedAt = performance.now();
    this.root.classList.add('picking');
    // Partie provisoire sur cette carte : le rendu montre ses emplacements, pas ceux d'une autre carte.
    this.game = new Game(place.map, this.config);
    this.renderer.resetView();
    this.renderer.setMap(place.map);
    this.pickBanner.show();
  }

  /** Quitte le mode sans rien changer : la carte du jeu revient derrière les écrans. */
  private leavePickBase(): void {
    this.pickBanner.hide();
    this.root.classList.remove('picking');
    this.state = 'home';
    this.game = this.createGame();
    this.renderer.resetView();
    this.renderer.setMap(this.map);
  }

  private cancelPickBase(): void {
    if (this.state !== 'pickBase') return;
    this.leavePickBase();
    if (this.readyPlace) this.showReady(this.readyPlace, this.readyTarget, this.readyHow);
  }

  private pickBaseAt(x: number, y: number): void {
    if (performance.now() - this.pickStartedAt < PICK_GRACE_MS) return;
    const building = this.renderer.buildingAt(x, y);
    if (!building) return this.toast.show(t('pick.noBuilding'), 2200);
    if (building.kind === 'annex') return this.toast.show(t('pick.annex'), 2600);
    void this.rebuildBase(interiorPoint(building.footprint));
  }

  /** Reconstruit la carte prête avec la base sur le bâtiment touché (données gardées, sinon retéléchargées). */
  private async rebuildBase(at: { x: number; y: number }): Promise<void> {
    const ready = this.readyPlace;
    const target = this.readyTarget;
    if (!ready || !target || !ready.info.center) return;
    this.leavePickBase();
    const controller = new AbortController();
    const { signal } = controller;
    this.generation = controller;
    const steps = [
      ...(this.readySource ? [] : [{ id: 'download', label: t('loading.download') }]),
      { id: 'build', label: t('loading.rebuild') },
    ];
    this.loading.start(ready.info.name, steps);
    try {
      let source = this.readySource;
      if (!source) {
        this.loading.setStep('download', 'active');
        const info = ready.info;
        const place: OsmPlace = {
          id: info.mapId,
          name: info.name,
          center: info.center!,
          radius: info.radius,
          seedKey: placeSeedKey(target, info.requestedRadius),
          precise: target.precise,
        };
        const text = await this.osm.overpass(placeQuery(place, this.config), signal, (p) => this.showDownload(p));
        source = { place, responseText: text };
        this.readySource = source;
      }
      if (signal.aborted) return;
      this.loading.setStep('build', 'active');
      const rebuilt = await rebuildWithBase(ready, source, at, this.mapBuilder());
      if (signal.aborted) return;
      this.generation = null;
      if (!rebuilt) {
        this.startPickBase();
        this.toast.show(t('pick.refused'), 3000);
        return;
      }
      // La carte change sous le même nom : une partie sauvegardée dessus ne peut plus être reprise.
      if (loadSavedGame()?.snapshot.mapId === rebuilt.map.id) clearSavedGame();
      if (this.mapCache) {
        await this.mapCache.save(rebuilt, this.keptPlaceKeys());
        this.placeInfos = await this.mapCache.list();
      }
      if (this.map.id === rebuilt.map.id) this.applyMap(rebuilt.map);
      this.showReady(rebuilt, target, { cached: false, fallback: false });
    } catch (error) {
      if (signal.aborted) return;
      this.generation = null;
      this.loading.showError(this.placeError(error), true);
    }
  }

  private playReadyPlace(): void {
    const place = this.readyPlace;
    if (!place) return;
    this.readyPlace = null;
    this.applyMap(place.map);
    this.startNewGame();
  }

  /** Quartier imaginaire, sans réseau (hors connexion, ou pour le plaisir). */
  private async imaginary(): Promise<void> {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const place = imaginaryMap(seed, this.placeRadius, t('place.imaginaryName', { n: seed % 1000 }), this.config, Date.now());
    if (this.mapCache) {
      await this.mapCache.save(place, this.keptPlaceKeys());
      this.placeInfos = await this.mapCache.list();
    }
    this.showReady(place, null, { cached: false, fallback: false });
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
    const info = this.placeInfos.find((i) => i.mapId === game.map.id);
    if (info && this.mapCache) {
      const cache = this.mapCache;
      void cache.touch(info.key, Date.now()).then(async () => {
        this.placeInfos = await cache.list();
      });
    }
  }

  private startNewGame(): void {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    clearSavedGame();
    this.beginPlaying(this.createGame());
  }

  private async resumeGame(): Promise<void> {
    const saved = loadSavedGame();
    if (!saved) return this.startNewGame();
    try {
      if (saved.snapshot.mapId !== this.map.id) {
        const map = await this.mapById(saved.snapshot.mapId);
        if (!map) throw new Error('carte absente');
        this.applyMap(map);
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
    if (this.state === 'pickBase') return this.pickBaseAt(x, y);
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
      case 'pickBase':
        this.cancelPickBase();
        return 'handled';
      case 'home':
        if (this.loading.visible) {
          if (this.generation) this.cancelGeneration();
          else this.openPlaces();
          return 'handled';
        }
        if (this.upgrades.visible || this.settings.visible || this.help.visible || this.placeScreen.visible) {
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
