import type { SimulationConfig } from '../config';

/**
 * Boucle à pas de temps fixe : la simulation avance toujours par pas de
 * 1/stepsPerSecond, quelle que soit la fréquence d'affichage. Le rendu
 * interpole entre les deux derniers états grâce à `alpha`.
 */
export class FixedStepLoop {
  readonly stepSeconds: number;
  private readonly maxFrameSeconds: number;
  private readonly maxSteps: number;
  private accumulator = 0;

  constructor(sim: SimulationConfig) {
    this.stepSeconds = 1 / sim.stepsPerSecond;
    this.maxFrameSeconds = sim.maxFrameSeconds;
    this.maxSteps = sim.maxStepsPerFrame;
  }

  /**
   * Avance de `frameSeconds` (temps réel écoulé) multiplié par `speed`.
   * Appelle `step` autant de fois que nécessaire ; renvoie le nombre de pas.
   */
  advance(frameSeconds: number, speed: number, step: (dt: number) => void): number {
    const frame = Math.min(Math.max(frameSeconds, 0), this.maxFrameSeconds);
    this.accumulator += frame * speed;
    let steps = 0;
    while (this.accumulator >= this.stepSeconds && steps < this.maxSteps) {
      step(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      steps++;
    }
    // Trop de retard (appareil lent) : on abandonne le reliquat plutôt que de s'emballer.
    if (this.accumulator >= this.stepSeconds) this.accumulator = 0;
    return steps;
  }

  /** Fraction (0..1) du pas suivant déjà écoulée, pour l'interpolation du rendu. */
  get alpha(): number {
    return Math.min(this.accumulator / this.stepSeconds, 1);
  }

  reset(): void {
    this.accumulator = 0;
  }
}
