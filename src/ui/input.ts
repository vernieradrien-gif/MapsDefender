import type { TowerSlot } from '../game/types';
import type { Camera } from '../render/camera';

/** Emplacement le plus proche du point touché, dans un rayon en pixels écran. */
export function findSlotAt(
  slots: readonly TowerSlot[],
  screenX: number,
  screenY: number,
  camera: Camera,
  radiusPx: number,
): TowerSlot | null {
  let best: TowerSlot | null = null;
  let bestDist = radiusPx;
  for (const slot of slots) {
    const d = Math.hypot(camera.sx(slot.x) - screenX, camera.sy(slot.y) - screenY);
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
