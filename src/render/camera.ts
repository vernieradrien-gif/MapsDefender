import type { Bounds, Vec2 } from '../game/types';

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Transformation monde (mètres) → écran (pixels CSS). Au jalon 1 la carte est
 * simplement ajustée à la zone visible ; un zoom / déplacement pourra s'y
 * ajouter pour les grandes cartes OSM.
 */
export class Camera {
  scale = 1;
  offsetX = 0;
  offsetY = 0;

  fit(bounds: Bounds, view: ViewRect, padding: number): void {
    const worldW = Math.max(bounds.maxX - bounds.minX, 1);
    const worldH = Math.max(bounds.maxY - bounds.minY, 1);
    const availW = Math.max(view.width - padding * 2, 1);
    const availH = Math.max(view.height - padding * 2, 1);
    this.scale = Math.min(availW / worldW, availH / worldH);
    this.offsetX = view.x + (view.width - worldW * this.scale) / 2 - bounds.minX * this.scale;
    this.offsetY = view.y + (view.height - worldH * this.scale) / 2 - bounds.minY * this.scale;
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
}
