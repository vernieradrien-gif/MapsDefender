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

export interface GestureHandlers {
  /** Toucher bref, sans glisser. */
  tap(x: number, y: number): void;
  /** Déplacement de la carte (pixels). */
  pan(dx: number, dy: number): void;
  /** Zoom d'un facteur autour du point (x, y). */
  zoom(factor: number, x: number, y: number): void;
  /** Fin d'un déplacement ou d'un zoom (le décor peut être redessiné net). */
  end(): void;
}

/** Distance (px) au-delà de laquelle un appui devient un déplacement. */
const PAN_THRESHOLD = 10;

/**
 * Gestes sur la carte : toucher, glisser un doigt (déplacer), pincer deux
 * doigts (zoomer et déplacer), molette de souris (zoomer).
 */
export function attachGestures(target: HTMLElement, handlers: GestureHandlers): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let mode: 'idle' | 'tap' | 'pan' | 'pinch' = 'idle';
  let start = { x: 0, y: 0 };
  let last = { x: 0, y: 0 };
  let lastDistance = 0;
  let wheelTimer: ReturnType<typeof setTimeout> | null = null;

  const pair = () => {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  target.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    target.setPointerCapture?.(e.pointerId);
    if (pointers.size === 1) {
      mode = 'tap';
      start = last = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      mode = 'pinch';
      const p = pair();
      last = p.mid;
      lastDistance = p.distance;
    }
  });

  target.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'pinch' && pointers.size >= 2) {
      const p = pair();
      if (lastDistance > 0) handlers.zoom(p.distance / lastDistance, p.mid.x, p.mid.y);
      handlers.pan(p.mid.x - last.x, p.mid.y - last.y);
      last = p.mid;
      lastDistance = p.distance;
      return;
    }
    if (mode === 'tap' && Math.hypot(e.clientX - start.x, e.clientY - start.y) > PAN_THRESHOLD) mode = 'pan';
    if (mode === 'pan') {
      handlers.pan(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    }
  });

  const release = (e: PointerEvent, cancelled: boolean) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (mode === 'tap' && !cancelled && pointers.size === 0) {
      mode = 'idle';
      handlers.tap(e.clientX, e.clientY);
      return;
    }
    if (pointers.size === 1 && mode === 'pinch') {
      // Il reste un doigt : on continue à déplacer, sans saut.
      mode = 'pan';
      last = [...pointers.values()][0]!;
      return;
    }
    if (pointers.size === 0) {
      if (mode === 'pan' || mode === 'pinch') handlers.end();
      mode = 'idle';
    }
  };
  target.addEventListener('pointerup', (e) => release(e, false));
  target.addEventListener('pointercancel', (e) => release(e, true));

  target.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      handlers.zoom(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => handlers.end(), 150);
    },
    { passive: false },
  );
}
