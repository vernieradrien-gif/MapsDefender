export interface TargetCandidate {
  x: number;
  y: number;
  alive: boolean;
  /** Distance restant à parcourir jusqu'à la base. */
  remaining: number;
}

/**
 * Stratégie « premier » : parmi les ennemis vivants à portée, celui qui est
 * le plus proche de la base (plus petite distance restante sur son chemin).
 */
export function selectTarget<T extends TargetCandidate>(
  x: number,
  y: number,
  range: number,
  candidates: readonly T[],
): T | null {
  const range2 = range * range;
  let best: T | null = null;
  for (const c of candidates) {
    if (!c.alive) continue;
    const dx = c.x - x;
    const dy = c.y - y;
    if (dx * dx + dy * dy > range2) continue;
    if (best === null || c.remaining < best.remaining) best = c;
  }
  return best;
}

/** Ennemis vivants dans un cercle (dégâts de zone). */
export function candidatesInRadius<T extends TargetCandidate>(
  x: number,
  y: number,
  radius: number,
  candidates: readonly T[],
): T[] {
  const r2 = radius * radius;
  return candidates.filter((c) => {
    if (!c.alive) return false;
    const dx = c.x - x;
    const dy = c.y - y;
    return dx * dx + dy * dy <= r2;
  });
}
