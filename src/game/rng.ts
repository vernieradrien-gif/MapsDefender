/**
 * Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même suite.
 * Toute la simulation passe par lui pour rester déterministe.
 */
export class Rng {
  private seedState: number;

  constructor(seed: number) {
    this.seedState = seed >>> 0;
  }

  /** État interne (sauvegarde) : `new Rng(state)` reprend exactement la suite. */
  get state(): number {
    return this.seedState;
  }

  /** Nombre dans [0, 1). */
  next(): number {
    this.seedState = (this.seedState + 0x6d2b79f5) >>> 0;
    let t = this.seedState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Nombre dans [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Mélange en place (Fisher-Yates). */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }
}
