import type { Enemy, Game, Tower } from '../game/game';
import { PreparedPath } from '../game/path';
import type { GameMap, Vec2 } from '../game/types';
import { Camera, type ViewRect } from './camera';
import type { Effects } from './effects';
import { theme } from './theme';

export interface RenderState {
  /** Emplacement dont le menu de construction est ouvert. */
  selectedSlotId: number | null;
  /** Tour dont la portée est affichée. */
  selectedTowerId: number | null;
  /** Temps réel (s), pour les animations d'interface. */
  realTime: number;
}

/**
 * Dessine la partie sur le canvas. Le décor (fond, rues, chemin lumineux) est
 * précalculé dans un calque hors écran ; chaque image ne redessine que les
 * éléments mobiles.
 */
export class Renderer {
  readonly camera = new Camera();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly staticLayer: HTMLCanvasElement;
  private readonly staticCtx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private dpr = 1;
  /** Facteur de taille des objets selon l'échelle de la carte à l'écran. */
  private unit = 1;
  private map: GameMap | null = null;
  private view: ViewRect = { x: 0, y: 0, width: 1, height: 1 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = get2d(canvas);
    this.staticLayer = document.createElement('canvas');
    this.staticCtx = get2d(this.staticLayer);
  }

  resize(width: number, height: number, dpr: number, view: ViewRect): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = dpr;
    this.view = view;
    for (const c of [this.canvas, this.staticLayer]) {
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
    if (!this.map) return;
    this.camera.fit(this.map.bounds, this.view, 6);
    this.unit = clamp(this.camera.scale / theme.referenceScale, theme.minUnit, theme.maxUnit);
    this.buildStaticLayer(this.map);
  }

  /** Rayon de toucher d'un emplacement, en pixels CSS. */
  get slotTouchRadius(): number {
    return 26 * this.unit;
  }

  // --- Décor statique ------------------------------------------------------

  private buildStaticLayer(map: GameMap): void {
    const ctx = this.staticCtx;
    const cam = this.camera;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.width, this.height);

    // Quadrillage discret aligné sur la carte (îlots urbains).
    const topLeft = cam.toWorld(0, 0);
    const bottomRight = cam.toWorld(this.width, this.height);
    const step = theme.gridStep;
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
      ctx.moveTo(cam.sx(x), 0);
      ctx.lineTo(cam.sx(x), this.height);
    }
    for (let y = Math.floor(topLeft.y / step) * step; y <= bottomRight.y; y += step) {
      ctx.moveTo(0, cam.sy(y));
      ctx.lineTo(this.width, cam.sy(y));
    }
    ctx.stroke();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Rues décoratives.
    for (const street of map.streets) {
      this.strokePolyline(ctx, street, theme.street.edge, theme.street.width * cam.scale + 2);
      this.strokePolyline(ctx, street, theme.street.asphalt, theme.street.width * cam.scale);
    }

    // Chemin des ennemis : rue néon (bords lumineux, asphalte, ligne centrale).
    const width = theme.path.width * cam.scale;
    for (const path of map.paths) {
      ctx.shadowColor = theme.path.glow;
      ctx.shadowBlur = 16 * this.unit;
      this.strokePolyline(ctx, path.points, theme.path.neon, width);
      ctx.shadowBlur = 0;
      this.strokePolyline(ctx, path.points, theme.path.asphalt, width - theme.path.edgeWidth * 2 * cam.scale);
      ctx.setLineDash([5 * cam.scale, 7 * cam.scale]);
      this.strokePolyline(ctx, path.points, theme.path.centerLine, Math.max(1, 0.6 * cam.scale));
      ctx.setLineDash([]);
      this.drawEntryChevrons(ctx, path.points);
    }
  }

  private strokePolyline(
    ctx: CanvasRenderingContext2D,
    points: readonly Vec2[],
    color: string,
    lineWidth: number,
  ): void {
    if (points.length < 2) return;
    const cam = this.camera;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(cam.sx(points[0]!.x), cam.sy(points[0]!.y));
    for (let i = 1; i < points.length; i++) ctx.lineTo(cam.sx(points[i]!.x), cam.sy(points[i]!.y));
    ctx.stroke();
  }

  /** Chevrons « › › › » indiquant l'entrée et le sens de circulation. */
  private drawEntryChevrons(ctx: CanvasRenderingContext2D, points: readonly Vec2[]): void {
    const path = new PreparedPath(points);
    const cam = this.camera;
    const size = 5 * this.unit;
    ctx.strokeStyle = theme.entry;
    ctx.lineWidth = 2.2 * this.unit;
    for (const d of [24, 33, 42]) {
      if (d > path.length) break;
      const s = path.sample(d);
      const x = cam.sx(s.x);
      const y = cam.sy(s.y);
      const nx = -s.dirY;
      const ny = s.dirX;
      ctx.beginPath();
      ctx.moveTo(x - s.dirX * size + nx * size, y - s.dirY * size + ny * size);
      ctx.lineTo(x, y);
      ctx.lineTo(x - s.dirX * size - nx * size, y - s.dirY * size - ny * size);
      ctx.stroke();
    }
  }

  // --- Image courante --------------------------------------------------------

  render(game: Game, alpha: number, state: RenderState, effects: Effects): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticLayer, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.drawBase(game, effects.baseFlash);
    this.drawSlots(game, state);
    this.drawSelectedRange(game, state);
    for (const tower of game.towers) this.drawTower(tower);
    for (const enemy of game.enemies) {
      if (enemy.alive) this.drawEnemy(enemy, alpha);
    }
    this.drawProjectiles(game, alpha);
    effects.draw(ctx, this.camera, this.unit);
  }

  private drawBase(game: Game, flash: number): void {
    const ctx = this.ctx;
    const x = this.camera.sx(game.map.base.x);
    const y = this.camera.sy(game.map.base.y);
    const r = theme.base.radius * this.unit;

    ctx.globalAlpha = 0.25;
    hexagon(ctx, x, y, r * 1.45);
    ctx.fillStyle = theme.base.neon;
    ctx.fill();
    ctx.globalAlpha = 1;

    hexagon(ctx, x, y, r);
    ctx.fillStyle = theme.base.fill;
    ctx.fill();
    ctx.strokeStyle = theme.base.neon;
    ctx.lineWidth = 2.5 * this.unit;
    ctx.stroke();

    // Anneau de PV.
    const ratio = game.baseHp / game.baseMaxHp;
    ctx.lineWidth = 3 * this.unit;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(x, y, r + 6 * this.unit, 0, Math.PI * 2);
    ctx.stroke();
    if (ratio > 0) {
      ctx.strokeStyle = ratio > 0.3 ? theme.base.hpGood : theme.base.hpLow;
      ctx.beginPath();
      ctx.arc(x, y, r + 6 * this.unit, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    if (flash > 0) {
      ctx.globalAlpha = Math.min(1, flash / 0.4) * 0.6;
      ctx.fillStyle = theme.base.hpLow;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawSlots(game: Game, state: RenderState): void {
    const ctx = this.ctx;
    const r = theme.slot.radius * this.unit;
    ctx.setLineDash([3 * this.unit, 3 * this.unit]);
    ctx.lineWidth = 1.5 * this.unit;
    for (const slot of game.map.slots) {
      if (game.towerAt(slot.id)) continue;
      const x = this.camera.sx(slot.x);
      const y = this.camera.sy(slot.y);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = theme.slot.fill;
      ctx.fill();
      ctx.strokeStyle = theme.slot.ring;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (state.selectedSlotId !== null) {
      const slot = game.map.slots.find((s) => s.id === state.selectedSlotId);
      if (slot) {
        const pulse = 1 + 0.12 * Math.sin(state.realTime * 6);
        ctx.strokeStyle = theme.slot.selected;
        ctx.lineWidth = 2.5 * this.unit;
        ctx.beginPath();
        ctx.arc(this.camera.sx(slot.x), this.camera.sy(slot.y), r * 1.25 * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawSelectedRange(game: Game, state: RenderState): void {
    if (state.selectedTowerId === null) return;
    const tower = game.towers.find((t) => t.id === state.selectedTowerId);
    if (!tower) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(this.camera.sx(tower.x), this.camera.sy(tower.y), tower.config.range * this.camera.scale, 0, Math.PI * 2);
    ctx.fillStyle = theme.range.fill;
    ctx.fill();
    ctx.strokeStyle = theme.range.stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private drawTower(tower: Tower): void {
    const ctx = this.ctx;
    const u = this.unit;
    const x = this.camera.sx(tower.x);
    const y = this.camera.sy(tower.y);
    const colors = theme.towers[tower.config.id] ?? { color: theme.fallback, body: '#222' };
    const cos = Math.cos(tower.angle);
    const sin = Math.sin(tower.angle);
    const isCanon = tower.config.kind === 'shell';

    // Silhouette : carré pour la Mitrailleuse, cercle pour le Canon.
    ctx.fillStyle = colors.body;
    ctx.strokeStyle = colors.color;
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    if (isCanon) ctx.arc(x, y, 10 * u, 0, Math.PI * 2);
    else ctx.roundRect(x - 9 * u, y - 9 * u, 18 * u, 18 * u, 3 * u);
    ctx.fill();
    ctx.stroke();

    ctx.lineCap = 'butt';
    ctx.strokeStyle = colors.color;
    ctx.lineWidth = (isCanon ? 6 : 3) * u;
    const length = (isCanon ? 14 : 13) * u;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + cos * length, y + sin * length);
    ctx.stroke();

    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.arc(x, y, (isCanon ? 4 : 3) * u, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawEnemy(enemy: Enemy, alpha: number): void {
    const ctx = this.ctx;
    const u = this.unit;
    const x = this.camera.sx(enemy.prevX + (enemy.x - enemy.prevX) * alpha);
    const y = this.camera.sy(enemy.prevY + (enemy.y - enemy.prevY) * alpha);
    const dx = enemy.dirX;
    const dy = enemy.dirY;
    ctx.fillStyle = theme.enemies[enemy.config.id] ?? theme.fallback;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    // Silhouettes distinctes : rond (piéton), triangle (cycliste), rectangle (voiture).
    let top = 7 * u;
    switch (enemy.config.id) {
      case 'cycliste': {
        const len = 8 * u;
        const half = 5 * u;
        ctx.moveTo(x + dx * len, y + dy * len);
        ctx.lineTo(x - dx * len * 0.7 - dy * half, y - dy * len * 0.7 + dx * half);
        ctx.lineTo(x - dx * len * 0.7 + dy * half, y - dy * len * 0.7 - dx * half);
        ctx.closePath();
        top = 9 * u;
        break;
      }
      case 'voiture': {
        const hl = 8.5 * u;
        const hw = 5 * u;
        ctx.moveTo(x + dx * hl - dy * hw, y + dy * hl + dx * hw);
        ctx.lineTo(x + dx * hl + dy * hw, y + dy * hl - dx * hw);
        ctx.lineTo(x - dx * hl + dy * hw, y - dy * hl - dx * hw);
        ctx.lineTo(x - dx * hl - dy * hw, y - dy * hl + dx * hw);
        ctx.closePath();
        top = 10 * u;
        break;
      }
      default:
        ctx.arc(x, y, 5.5 * u, 0, Math.PI * 2);
        break;
    }
    ctx.fill();
    ctx.stroke();

    if (enemy.hp < enemy.maxHp) {
      const w = 16 * u;
      const h = 3 * u;
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.fillStyle = theme.hpBar.back;
      ctx.fillRect(x - w / 2 - 1, y - top - h - 3, w + 2, h + 2);
      ctx.fillStyle = ratio > 0.6 ? theme.hpBar.good : ratio > 0.3 ? theme.hpBar.mid : theme.hpBar.low;
      ctx.fillRect(x - w / 2, y - top - h - 2, w * ratio, h);
    }
  }

  private drawProjectiles(game: Game, alpha: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = theme.shell;
    for (const p of game.projectiles) {
      const x = this.camera.sx(p.prevX + (p.x - p.prevX) * alpha);
      const y = this.camera.sy(p.prevY + (p.y - p.prevY) * alpha);
      ctx.beginPath();
      ctx.arc(x, y, 3.2 * this.unit, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  return ctx;
}

function hexagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
