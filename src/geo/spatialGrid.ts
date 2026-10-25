import type { Vec2 } from '../game/types';

// Index spatial en grille régulière : retrouve vite les éléments proches d'un
// point (rues, bâtiments, arbres) au lieu de les parcourir tous.

export class SpatialGrid<T> {
  private readonly cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  private cell(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  // Clé unique tant que les cellules restent à moins de 32 768 cellules de l'origine.
  private static key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  /** Range un élément dans toutes les cellules touchées par son rectangle englobant. */
  insert(item: T, minX: number, minY: number, maxX: number, maxY: number): void {
    for (let cx = this.cell(minX); cx <= this.cell(maxX); cx++) {
      for (let cy = this.cell(minY); cy <= this.cell(maxY); cy++) {
        const key = SpatialGrid.key(cx, cy);
        const list = this.cells.get(key);
        if (list) list.push(item);
        else this.cells.set(key, [item]);
      }
    }
  }

  /** Range un polygone ou une ligne selon son rectangle englobant. */
  insertPoints(item: T, points: readonly Vec2[]): void {
    if (points.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    this.insert(item, minX, minY, maxX, maxY);
  }

  /**
   * Vrai si un élément rangé près du point (à moins de `radius` de son rectangle
   * englobant) vérifie le test. Un élément peut être testé plusieurs fois.
   */
  some(p: Vec2, radius: number, test: (item: T) => boolean): boolean {
    for (let cx = this.cell(p.x - radius); cx <= this.cell(p.x + radius); cx++) {
      for (let cy = this.cell(p.y - radius); cy <= this.cell(p.y + radius); cy++) {
        const list = this.cells.get(SpatialGrid.key(cx, cy));
        if (list && list.some(test)) return true;
      }
    }
    return false;
  }
}
