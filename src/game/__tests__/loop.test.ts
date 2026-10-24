import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../loop';
import { testConfig } from './helpers';

describe('boucle à pas fixe', () => {
  const sim = testConfig().simulation;

  it('fait 60 pas par seconde quelle que soit la cadence d’affichage', () => {
    for (const fps of [30, 60, 90, 120, 144]) {
      const loop = new FixedStepLoop(sim);
      let steps = 0;
      for (let i = 0; i < fps * 10; i++) steps += loop.advance(1 / fps, 1, () => {});
      expect(Math.abs(steps - 600)).toBeLessThanOrEqual(1);
    }
  });

  it('la vitesse x2 / x3 multiplie le nombre de pas', () => {
    const loop = new FixedStepLoop(sim);
    let steps = 0;
    for (let i = 0; i < 600; i++) steps += loop.advance(1 / 60, 3, () => {});
    expect(Math.abs(steps - 1800)).toBeLessThanOrEqual(1);
  });

  it('chaque pas a la même durée', () => {
    const loop = new FixedStepLoop(sim);
    const dts = new Set<number>();
    loop.advance(0.1, 1, (dt) => dts.add(dt));
    expect([...dts]).toEqual([1 / 60]);
  });

  it('ne s’emballe pas après une longue interruption', () => {
    const loop = new FixedStepLoop(sim);
    expect(loop.advance(30, 3, () => {})).toBe(sim.maxStepsPerFrame);
    expect(loop.alpha).toBe(0);
  });

  it('alpha donne la fraction du pas en cours', () => {
    const loop = new FixedStepLoop(sim);
    loop.advance(1 / 120, 1, () => {});
    expect(loop.alpha).toBeCloseTo(0.5, 5);
  });
});
