import type { Game, Projectile } from '../game/game';
import type { Building, GameMap, TowerSlot, Vec2 } from '../game/types';
import { distanceToPolyline } from '../game/path';
import { interiorPoint } from '../geo/geometry';
import { Camera, type ViewRect } from './camera';
import { buildingTopHeight, drawCity, entryScreen, liftPx, padTopPx } from './cityLayer';
import type { Effects } from './effects';
import { buildingAtScreen } from './picking';

/** Portée du doigt (px CSS) pour désigner un bâtiment trop petit à l'écran. */
const PICK_TOLERANCE_PX = 18;
import { drawBaseGauge, drawCapsule, drawDroplet, drawEnemy, drawSlotMarker, drawTower, towerMuzzleHeight } from './sprites';
import { theme } from './theme';

export interface RenderState {
  /** Emplacement dont le menu de construction est ouvert. */
  selectedSlotId: number | null;
  /** Tourelle dont la portée est affichée. */
  selectedTowerId: number | null;
  /** Portée après la prochaine amélioration (cercle en pointillés), si le menu est ouvert. */
  nextRange: number | null;
  /** Temps réel (s), pour les animations d'interface. */
  realTime: number;
}

/**
 * Dessine la partie. Le décor de la ville est précalculé dans un calque hors
 * écran ; chaque image ne redessine que ce qui bouge.
 */
export class Renderer {
  readonly camera = new Camera();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly staticLayer: HTMLCanvasElement;
  private readonly shadowLayer: HTMLCanvasElement;
  private width = 1;
  private height = 1;
  private dpr = 1;
  /** Facteur de taille des objets selon l'échelle de la carte à l'écran. */
  private unit = 1;
  private map: GameMap | null = null;
  private view: ViewRect = { x: 0, y: 0, width: 1, height: 1 };
  /** Hauteur à l'écran (px) du haut de chaque support d'emplacement. */
  private slotLift = new Map<number, number>();
  /** Emplacements dont le repère reste visible sans zoom (sélection espacée près des itinéraires, et socles). */
  private nearSlots = new Set<number>();
  /** Haut du bâtiment à protéger (monde) et sa hauteur (m), pour la jauge de PV. */
  private baseTop: { at: Vec2; height: number } = { at: { x: 0, y: 0 }, height: 0 };
  /** Caméra avec laquelle le calque du décor a été dessiné (pour l'agrandir pendant un geste). */
  private layerCamera = { scale: 1, offsetX: 0, offsetY: 0 };
  /** Le décor doit être redessiné net (après un zoom ou un déplacement). */
  private layerStale = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = get2d(canvas);
    this.staticLayer = document.createElement('canvas');
    this.shadowLayer = document.createElement('canvas');
    this.camera.maxZoom = theme.camera.maxZoom;
    this.camera.overscroll = theme.camera.overscroll;
  }

  resize(width: number, height: number, dpr: number, view: ViewRect): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = dpr;
    this.view = view;
    for (const c of [this.canvas, this.staticLayer, this.shadowLayer]) {
      c.width = Math.round(this.width * dpr);
      c.height = Math.round(this.height * dpr);
    }
    this.layout();
  }

  setMap(map: GameMap): void {
    this.map = map;
    // Les emplacements sont numérotés du plus proche d'un itinéraire au plus loin.
    const shown: TowerSlot[] = [];
    for (const s of map.slots) {
      const near = s.kind === 'pad' || map.paths.some((p) => distanceToPolyline(s, p.points) <= theme.slotMarker.nearRoute);
      const spaced = shown.every((o) => Math.hypot(o.x - s.x, o.y - s.y) >= theme.slotMarker.spacing);
      if (near && (spaced || s.kind === 'pad')) shown.push(s);
    }
    this.nearSlots = new Set(shown.map((s) => s.id));
    const building = map.buildings.find((b) => b.id === map.baseBuildingId);
    this.baseTop = building
      ? { at: interiorPoint(building.footprint), height: buildingTopHeight(building) }
      : { at: map.base, height: 0 };
    this.layout();
  }

  /** Point (monde) et hauteur (m) du bâtiment à protéger. */
  get baseAnchor(): { x: number; y: number; height: number } {
    return { x: this.baseTop.at.x, y: this.baseTop.at.y, height: this.baseTop.height };
  }

  private layout(): void {
    const map = this.map;
    if (!map) return;
    this.camera.fit(map.bounds, this.view, 4);
    this.cameraMoved();
    this.redrawStatic();
  }

  // --- Zoom et déplacement -------------------------------------------------

  /** Zoome autour d'un point de l'écran (geste en cours : le décor est redessiné à la fin). */
  zoomAt(factor: number, x: number, y: number): boolean {
    const changed = this.camera.zoomAt(factor, x, y);
    if (changed) this.cameraMoved();
    return changed;
  }

  /** Zoom par les boutons : autour du centre de la zone visible, décor redessiné aussitôt. */
  zoomStep(factor: number): void {
    if (this.zoomAt(factor, this.view.x + this.view.width / 2, this.view.y + this.view.height / 2)) this.settle();
  }

  panBy(dx: number, dy: number): boolean {
    const changed = this.camera.panBy(dx, dy);
    if (changed) this.cameraMoved();
    return changed;
  }

  /** Revient à la carte entière (changement de carte). */
  resetView(): void {
    this.camera.reset();
    this.cameraMoved();
  }

  get zoom(): number {
    return this.camera.zoom;
  }

  /** Fin d'un geste : le décor est redessiné net. */
  settle(): void {
    if (this.layerStale) this.redrawStatic();
  }

  /** La caméra a changé : tailles et hauteurs à l'écran à recalculer, décor à redessiner. */
  private cameraMoved(): void {
    const map = this.map;
    if (!map) return;
    this.layerStale = true;
    this.unit = clamp(this.camera.scale / theme.referenceScale, theme.minUnit, theme.maxUnit);
    const buildings = new Map(map.buildings.map((b) => [b.id, b]));
    this.slotLift = new Map(
      map.slots.map((s) => {
        if (s.kind === 'pad') return [s.id, padTopPx(this.camera, s.elevation)];
        const b = s.buildingId === null ? undefined : buildings.get(s.buildingId);
        return [s.id, liftPx(this.camera, b ? buildingTopHeight(b) : s.elevation)];
      }),
    );
  }

  private redrawStatic(): void {
    const map = this.map;
    if (!map) return;
    const ctx = get2d(this.staticLayer);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawCity(
      {
        ctx,
        cam: this.camera,
        unit: this.unit,
        width: this.width,
        height: this.height,
        shadowCanvas: this.shadowLayer,
        dpr: this.dpr,
        visible: this.camera.worldRect(this.width, this.height),
      },
      map,
    );
    this.layerCamera = { scale: this.camera.scale, offsetX: this.camera.offsetX, offsetY: this.camera.offsetY };
    this.layerStale = false;
  }

  /**
   * Bâtiment dessiné sous ce point de l'écran (px CSS), ou null. `tolerant` :
   * à défaut, le plus proche à portée de doigt (petites maisons sans zoom).
   */
  buildingAt(x: number, y: number, tolerant = true): Building | null {
    const map = this.map;
    if (!map) return null;
    const cam = this.camera;
    const project = (p: Vec2, h: number) => ({ x: cam.sx(p.x), y: cam.sy(p.y) - liftPx(cam, h) });
    return buildingAtScreen(map.buildings, project, buildingTopHeight, { x, y }, tolerant ? PICK_TOLERANCE_PX : 0);
  }

  /** Point de l'écran où se trouve le haut du support d'un emplacement. */
  slotScreen(slot: TowerSlot): { x: number; y: number } {
    return { x: this.camera.sx(slot.x), y: this.camera.sy(slot.y) - (this.slotLift.get(slot.id) ?? 0) };
  }

  /** Rayon de toucher d'un emplacement, en pixels CSS. */
  get slotTouchRadius(): number {
    return 24 * this.unit;
  }

  render(game: Game, alpha: number, state: RenderState, effects: Effects): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const u = this.unit;
    const time = state.realTime;
    this.drawStaticLayer();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.drawEntryPulses(game.map, time);
    this.drawFields(game);
    effects.drawGround(ctx, cam);
    this.drawSelectedRange(game, state);

    const showAll = cam.zoom >= theme.slotMarker.allFromZoom;
    for (const slot of game.map.slots) {
      const selected = slot.id === state.selectedSlotId;
      if (game.towerAt(slot.id) || (!selected && !showAll && !this.nearSlots.has(slot.id))) continue;
      const p = this.slotScreen(slot);
      if (p.x < -20 || p.y < -20 || p.x > this.width + 20 || p.y > this.height + 20) continue;
      drawSlotMarker(ctx, p.x, p.y, u, time, selected);
    }

    const slotsById = new Map(game.map.slots.map((s) => [s.id, s]));
    const towers = [...game.towers].sort((a, b) => a.y - b.y);
    const towerTop = new Map<number, number>();
    for (const tower of towers) {
      const slot = slotsById.get(tower.slotId);
      const p = slot ? this.slotScreen(slot) : { x: cam.sx(tower.x), y: cam.sy(tower.y) };
      towerTop.set(tower.id, cam.sy(tower.y) - p.y + towerMuzzleHeight(tower.config.id) * u);
      drawTower(ctx, p.x, p.y, u, {
        type: tower.config.id,
        angle: tower.angle,
        level: tower.level,
        readiness: tower.fireInterval > 0 ? 1 - Math.max(0, tower.cooldown) / tower.fireInterval : 1,
        appear: effects.appearProgress(tower.id),
        active: tower.targetId !== null,
        time: time + tower.id * 0.37,
      });
    }

    const enemies = game.enemies.filter((e) => e.alive).sort((a, b) => a.y - b.y);
    for (const e of enemies) {
      drawEnemy(ctx, cam.sx(lerp(e.prevX, e.x, alpha)), cam.sy(lerp(e.prevY, e.y, alpha)), u, {
        type: e.config.id,
        phase: e.id * 1.37,
        time,
        hpRatio: e.hp / e.maxHp,
        slowed: e.slow > 0,
      });
    }

    for (const p of game.projectiles) this.drawProjectile(p, alpha, towerTop.get(p.towerId) ?? 0);
    effects.draw(ctx, cam, u);

    const b = this.baseTop;
    drawBaseGauge(ctx, cam.sx(b.at.x), cam.sy(b.at.y) - liftPx(cam, b.height) - 16 * u, u, game.baseHp, game.baseMaxHp, effects.baseShake);
  }

  /** Décor : tel quel, ou agrandi et décalé pendant un geste (redessiné net à la fin). */
  private drawStaticLayer(): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.layerStale) {
      ctx.drawImage(this.staticLayer, 0, 0);
      return;
    }
    const cam = this.camera;
    const k = cam.scale / this.layerCamera.scale;
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, this.dpr * (cam.offsetX - this.layerCamera.offsetX * k), this.dpr * (cam.offsetY - this.layerCamera.offsetY * k));
    ctx.drawImage(this.staticLayer, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Les entrées des virus pulsent pour rester repérables d'un coup d'œil. */
  private drawEntryPulses(map: GameMap, time: number): void {
    const ctx = this.ctx;
    const u = this.unit;
    for (const e of map.entries) {
      const k = (time * 0.7) % 1;
      const { x, y } = entryScreen(this.camera, e, u);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = theme.entry.pulse;
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.arc(x, y, (11 + 12 * k) * u, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Champs actifs des purificateurs. */
  private drawFields(game: Game): void {
    const ctx = this.ctx;
    for (const tower of game.towers) {
      if (tower.config.attack !== 'field' || tower.targetId === null) continue;
      const r = tower.range * this.camera.scale;
      ctx.fillStyle = theme.field.fill;
      ctx.strokeStyle = theme.field.ring;
      ctx.lineWidth = 1.5 * this.unit;
      ctx.beginPath();
      ctx.arc(this.camera.sx(tower.x), this.camera.sy(tower.y), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawProjectile(p: Projectile, alpha: number, startLift: number): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const u = this.unit;
    const x = cam.sx(lerp(p.prevX, p.x, alpha));
    const y = cam.sy(lerp(p.prevY, p.y, alpha));
    const remaining = Math.hypot(p.targetX - p.x, p.targetY - p.y);
    const k = p.traveled / Math.max(0.001, p.traveled + remaining);
    const angle = Math.atan2(p.targetY - p.y, p.targetX - p.x);
    if (p.splashRadius > 0) {
      // Capsule lancée en cloche, avec son ombre au sol.
      const z = startLift * (1 - k) + 4 * 34 * u * k * (1 - k) + 6 * u * (1 - k);
      ctx.fillStyle = 'rgba(41, 64, 90, 0.2)';
      ctx.beginPath();
      ctx.ellipse(x, y, 3.5 * u, 2.2 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      drawCapsule(ctx, x, y - z, u, angle + k * 6);
    } else {
      const z = startLift * (1 - k) + 6 * u * k;
      drawDroplet(ctx, x, y - z, 2.2 * u, angle);
    }
  }

  private drawSelectedRange(game: Game, state: RenderState): void {
    if (state.selectedTowerId === null) return;
    const tower = game.getTower(state.selectedTowerId);
    if (!tower) return;
    const ctx = this.ctx;
    const x = this.camera.sx(tower.x);
    const y = this.camera.sy(tower.y);
    ctx.fillStyle = theme.range.fill;
    ctx.beginPath();
    ctx.arc(x, y, tower.range * this.camera.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.range.stroke;
    ctx.lineWidth = 2 * this.unit;
    ctx.setLineDash([6 * this.unit, 5 * this.unit]);
    ctx.stroke();
    if (state.nextRange !== null && state.nextRange > tower.range + 0.5) {
      ctx.strokeStyle = theme.range.next;
      ctx.setLineDash([3 * this.unit, 4 * this.unit]);
      ctx.beginPath();
      ctx.arc(x, y, state.nextRange * this.camera.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  return ctx;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
