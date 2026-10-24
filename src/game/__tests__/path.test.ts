import { describe, expect, it } from 'vitest';
import { PreparedPath, distanceToPolyline, distanceToSegment } from '../path';

describe('chemin', () => {
  const path = new PreparedPath([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
  ]);

  it('calcule la longueur totale', () => {
    expect(path.length).toBe(150);
  });

  it('échantillonne une position et une direction', () => {
    expect(path.sample(50)).toMatchObject({ x: 50, y: 0, dirX: 1, dirY: 0 });
    expect(path.sample(125)).toMatchObject({ x: 100, y: 25, dirX: 0, dirY: 1 });
    expect(path.sample(100)).toMatchObject({ x: 100, y: 0 });
  });

  it('borne la distance au début et à la fin', () => {
    expect(path.sample(-10)).toMatchObject({ x: 0, y: 0 });
    expect(path.sample(1000)).toMatchObject({ x: 100, y: 50 });
  });

  it('refuse un chemin dégénéré', () => {
    expect(() => new PreparedPath([{ x: 0, y: 0 }])).toThrow();
    expect(() => new PreparedPath([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toThrow();
  });

  it('distance point / segment et point / polyligne', () => {
    expect(distanceToSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(10);
    expect(distanceToSegment({ x: -30, y: 40 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(50);
    expect(distanceToPolyline({ x: 110, y: 25 }, path.points)).toBe(10);
  });
});
