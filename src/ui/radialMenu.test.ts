import { describe, expect, it } from 'vitest';
import { radialPositions } from './radialMenu';

describe('menu radial', () => {
  const view = { x: 0, y: 60, width: 390, height: 700 };
  const inside = (p: { x: number; y: number }) =>
    p.x - 34 >= view.x && p.x + 34 <= view.x + view.width && p.y - 34 >= view.y && p.y + 34 <= view.y + view.height;

  it('place les boutons au-dessus quand il y a la place', () => {
    const positions = radialPositions({ x: 200, y: 400 }, 2, view);
    expect(positions).toHaveLength(2);
    for (const p of positions) expect(p.y).toBeLessThan(400);
  });

  it('bascule en dessous près du haut de l’écran', () => {
    const positions = radialPositions({ x: 200, y: 80 }, 2, view);
    for (const p of positions) {
      expect(p.y).toBeGreaterThan(80);
      expect(inside(p)).toBe(true);
    }
  });

  it('reste dans l’écran près d’un coin', () => {
    for (const center of [{ x: 10, y: 70 }, { x: 385, y: 755 }, { x: 5, y: 740 }]) {
      for (const p of radialPositions(center, 2, view)) expect(inside(p)).toBe(true);
    }
  });
});
