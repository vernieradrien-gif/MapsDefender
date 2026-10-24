import type { Game, Projectile } from '../game/game';
import type { GameMap, TowerSlot } from '../game/types';
import { Camera, type ViewRect } from './camera';
import { buildingTopHeight, drawCity, liftPx, padTopPx } from './cityLayer';
import type { Effects } from './effects';
import { drawBalloon, drawBubble, drawCake, drawEnemy, drawSlotMarker, drawTower } from './sprites';
import { theme } from './theme';

export interface RenderState {
  /** Emplacement dont le menu de construction est ouvert. */
  selectedSlotId: number | null;
  /** Tourelle dont la portée est affichée. */
  selectedTowerId: number | null;
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

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = get2d(canvas);
    this.staticLayer = document.createElement('canvas');
    this.shadowLayer = document.createElement('canvas');
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
    this.layout();
  }

  private layout(): void {
    const map = this.map;
    if (!map) return;
    this.camera.fit(map.bounds, this.view, 4);
    this.unit = clamp(this.camera.scale / theme.referenceScale, theme.minUnit, theme.maxUnit);
    const buildings = new Map(map.buildings.map((b) => [b.id, b]));
    this.slotLift = new Map(
      map.slots.map((s) => {
        if (s.kind === 'pad') return [s.id, padTopPx(this.camera, s.elevation)];
        const b = s.buildingId === null ? undefined : buildings.get(s.buildingId);
        return [s.id, liftPx(this.camera, b ? buildingTopHeight(b) : s.elevation)];
      }),
    );
    const ctx = get2d(this.staticLayer);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawCity(
      { ctx, cam: this.camera, unit: this.unit, width: this.width, height: this.height, shadowCanvas: this.shadowLayer, dpr: this.dpr },
      map,
    );
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticLayer, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    effects.drawGround(ctx, cam);
    this.drawSelectedRange(game, state);

    drawCake(ctx, cam.sx(game.map.base.x), cam.sy(game.map.base.y), u, game.baseHp, game.baseMaxHp, effects.cakeShake);

    for (const slot of game.map.slots) {
      if (game.towerAt(slot.id)) continue;
      const p = this.slotScreen(slot);
      drawSlotMarker(ctx, p.x, p.y, u, time, slot.id === state.selectedSlotId);
    }

    const slotsById = new Map(game.map.slots.map((s) => [s.id, s]));
    const towers = [...game.towers].sort((a, b) => a.y - b.y);
    const towerTop = new Map<number, number>();
    for (const tower of towers) {
      const slot = slotsById.get(tower.slotId);
      const p = slot ? this.slotScreen(slot) : { x: cam.sx(tower.x), y: cam.sy(tower.y) };
      towerTop.set(tower.id, cam.sy(tower.y) - p.y);
      drawTower(ctx, p.x, p.y, u, {
        type: tower.config.id,
        angle: tower.angle,
        readiness: 1 - Math.max(0, tower.cooldown) / tower.config.fireInterval,
        appear: effects.appearProgress(tower.id),
        time: time + tower.id * 0.37,
      });
    }

    const enemies = game.enemies.filter((e) => e.alive).sort((a, b) => a.y - b.y);
    for (const e of enemies) {
      drawEnemy(ctx, cam.sx(lerp(e.prevX, e.x, alpha)), cam.sy(lerp(e.prevY, e.y, alpha)), u, {
        type: e.config.id,
        dirX: e.dirX,
        dirY: e.dirY,
        phase: e.id * 1.37,
        time,
        hpRatio: e.hp / e.maxHp,
      });
    }

    for (const p of game.projectiles) this.drawProjectile(p, alpha, towerTop.get(p.towerId) ?? 0);
    effects.draw(ctx, cam, u);
  }

  private drawProjectile(p: Projectile, alpha: number, startLift: number): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const u = this.unit;
    const x = cam.sx(lerp(p.prevX, p.x, alpha));
    const y = cam.sy(lerp(p.prevY, p.y, alpha));
    const remaining = Math.hypot(p.targetX - p.x, p.targetY - p.y);
    const k = p.traveled / Math.max(0.001, p.traveled + remaining);
    if (p.splashRadius > 0) {
      // Ballon d'eau lancé en cloche, avec son ombre au sol.
      const z = startLift * (1 - k) + 4 * 34 * u * k * (1 - k) + 12 * u * (1 - k);
      ctx.fillStyle = 'rgba(41, 64, 90, 0.2)';
      ctx.beginPath();
      ctx.ellipse(x, y, 3.5 * u, 2.2 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      drawBalloon(ctx, x, y - z, u);
    } else {
      const z = (startLift + 8 * u) * (1 - k) + 6 * u * k;
      drawBubble(ctx, x, y - z, 3.4 * u);
    }
  }

  private drawSelectedRange(game: Game, state: RenderState): void {
    if (state.selectedTowerId === null) return;
    const tower = game.towers.find((t) => t.id === state.selectedTowerId);
    if (!tower) return;
    const ctx = this.ctx;
    const x = this.camera.sx(tower.x);
    const y = this.camera.sy(tower.y);
    const r = tower.config.range * this.camera.scale;
    ctx.fillStyle = theme.range.fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.range.stroke;
    ctx.lineWidth = 2 * this.unit;
    ctx.setLineDash([6 * this.unit, 5 * this.unit]);
    ctx.stroke();
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
