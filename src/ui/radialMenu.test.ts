import { describe, expect, it } from 'vitest';
import { radialPositions } from './radialMenu';

describe('menu radial', () => {
  const view = { x: 0, y: 60, width: 390, height: 700 };
  // Bouton + étiquette : 52 px de part et d'autre, 36 px au-dessus, 66 px en dessous.
  const inside = (p: { x: number; y: number }) =>
    p.x - 52 >= view.x && p.x + 52 <= view.x + view.width && p.y - 36 >= view.y && p.y + 66 <= view.y + view.height;

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

  it('écarte assez les boutons pour que les étiquettes ne se chevauchent pas', () => {
    const [a, b] = radialPositions({ x: 200, y: 400 }, 2, view);
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeGreaterThanOrEqual(100);
  });

  it('reste dans l’écran près d’un coin', () => {
    for (const center of [{ x: 10, y: 70 }, { x: 385, y: 755 }, { x: 5, y: 740 }]) {
      for (const p of radialPositions(center, 2, view)) expect(inside(p)).toBe(true);
    }
  });

  it('dispose les 4 tourelles en arc, sans chevauchement, dans l’écran et sans cacher l’emplacement', () => {
    // Boutons de 68 px, étiquettes de 80 px au plus.
    const insideArc = (p: { x: number; y: number }) =>
      p.x - 40 >= view.x && p.x + 40 <= view.x + view.width && p.y - 36 >= view.y && p.y + 66 <= view.y + view.height;
    const positions = radialPositions({ x: 200, y: 400 }, 4, view);
    expect(positions).toHaveLength(4);
    for (const p of positions) expect(p.y).toBeLessThan(400);
    for (let i = 1; i < positions.length; i++) {
      const a = positions[i - 1]!;
      const b = positions[i]!;
      expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(80);
    }
    for (const center of [{ x: 200, y: 400 }, { x: 20, y: 300 }, { x: 390, y: 650 }, { x: 10, y: 70 }, { x: 380, y: 755 }]) {
      for (const p of radialPositions(center, 4, view)) {
        expect(insideArc(p)).toBe(true);
        expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeGreaterThan(45);
      }
    }
  });
});
