import type { Bounds, Vec2 } from '../game/types';

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Transformation monde (mètres) → écran (pixels CSS). Zoom 1 : la carte
 * entière tient dans la zone visible ; au-delà, on se déplace dans la carte
 * sans pouvoir s'en éloigner (une petite marge laisse voir les virus arriver).
 */
export class Camera {
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  zoom = 1;
  minZoom = 1;
  maxZoom = 4;
  /** Marge (m) visible au-delà de la carte quand on est zoomé. */
  overscroll = 0;
  private fitScale = 1;
  private bounds: Bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  private view: ViewRect = { x: 0, y: 0, width: 1, height: 1 };
  /** Point du monde au centre de la zone visible (null : centre de la carte). */
  private center: Vec2 | null = null;

  /** Cadre la carte dans la zone visible ; le zoom et le point visé sont conservés. */
  fit(bounds: Bounds, view: ViewRect, padding: number): void {
    this.bounds = bounds;
    this.view = view;
    const worldW = Math.max(bounds.maxX - bounds.minX, 1);
    const worldH = Math.max(bounds.maxY - bounds.minY, 1);
    const availW = Math.max(view.width - padding * 2, 1);
    const availH = Math.max(view.height - padding * 2, 1);
    this.fitScale = Math.min(availW / worldW, availH / worldH);
    this.apply();
  }

  /** Zoome d'un facteur en gardant immobile le point de l'écran (sx, sy). Renvoie vrai si la vue a changé. */
  zoomAt(factor: number, sx: number, sy: number): boolean {
    const before = { scale: this.scale, x: this.offsetX, y: this.offsetY };
    const anchor = this.toWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const scale = this.fitScale * this.zoom;
    const offX = sx - anchor.x * scale;
    const offY = sy - anchor.y * scale;
    this.center = {
      x: (this.view.x + this.view.width / 2 - offX) / scale,
      y: (this.view.y + this.view.height / 2 - offY) / scale,
    };
    this.apply();
    return before.scale !== this.scale || before.x !== this.offsetX || before.y !== this.offsetY;
  }

  /** Déplace la vue de (dx, dy) pixels. Renvoie vrai si la vue a changé. */
  panBy(dx: number, dy: number): boolean {
    const c = this.center ?? centerOf(this.bounds);
    const before = { x: this.offsetX, y: this.offsetY };
    this.center = { x: c.x - dx / this.scale, y: c.y - dy / this.scale };
    this.apply();
    return before.x !== this.offsetX || before.y !== this.offsetY;
  }

  /** Revient à la carte entière. */
  reset(): void {
    this.zoom = 1;
    this.center = null;
    this.apply();
  }

  /** Partie du monde visible dans la zone d'affichage donnée (pixels CSS). */
  worldRect(width: number, height: number): Bounds {
    const a = this.toWorld(0, 0);
    const b = this.toWorld(width, height);
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
  }

  sx(x: number): number {
    return x * this.scale + this.offsetX;
  }

  sy(y: number): number {
    return y * this.scale + this.offsetY;
  }

  toWorld(screenX: number, screenY: number): Vec2 {
    return { x: (screenX - this.offsetX) / this.scale, y: (screenY - this.offsetY) / this.scale };
  }

  private apply(): void {
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    this.scale = this.fitScale * this.zoom;
    const b = this.bounds;
    const c = this.center ?? centerOf(b);
    const halfW = this.view.width / 2 / this.scale;
    const halfH = this.view.height / 2 / this.scale;
    const m = this.zoom > 1 ? this.overscroll : 0;
    const x = clampAxis(c.x, b.minX - m, b.maxX + m, halfW);
    const y = clampAxis(c.y, b.minY - m, b.maxY + m, halfH);
    if (this.center) this.center = { x, y };
    this.offsetX = this.view.x + this.view.width / 2 - x * this.scale;
    this.offsetY = this.view.y + this.view.height / 2 - y * this.scale;
  }
}

const centerOf = (b: Bounds): Vec2 => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });

/** Garde la vue dans [min, max] ; si elle est plus large que la carte, la centre. */
function clampAxis(v: number, min: number, max: number, half: number): number {
  if (max - min <= half * 2) return (min + max) / 2;
  return clamp(v, min + half, max - half);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
