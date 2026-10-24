import type { TowerSlot } from '../game/types';

/**
 * Emplacement le plus proche du point touché, dans un rayon en pixels écran.
 * `screenOf` donne la position affichée de chaque emplacement (sur son toit).
 */
export function findSlotAt(
  slots: readonly TowerSlot[],
  screenX: number,
  screenY: number,
  radiusPx: number,
  screenOf: (slot: TowerSlot) => { x: number; y: number },
): TowerSlot | null {
  let best: TowerSlot | null = null;
  let bestDist = radiusPx;
  for (const slot of slots) {
    const p = screenOf(slot);
    const d = Math.hypot(p.x - screenX, p.y - screenY);
    if (d <= bestDist) {
      best = slot;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Détection de « toucher » sur un élément : appui puis relâché sans glisser.
 * Ignore les doigts supplémentaires (multi-touch).
 */
export function onTap(target: HTMLElement, handler: (x: number, y: number) => void): void {
  let start: { id: number; x: number; y: number } | null = null;
  target.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  target.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    start = null;
    if (moved < 24) handler(e.clientX, e.clientY);
  });
  target.addEventListener('pointercancel', () => {
    start = null;
  });
}
