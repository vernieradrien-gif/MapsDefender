import { describe, expect, it } from 'vitest';
import { Camera } from './camera';

describe('caméra', () => {
  it('ajuste la carte dans la zone visible en conservant les proportions', () => {
    const camera = new Camera();
    camera.fit({ minX: 0, minY: 0, maxX: 200, maxY: 400 }, { x: 0, y: 50, width: 400, height: 600 }, 0);
    expect(camera.scale).toBe(1.5);
    expect(camera.sy(0)).toBe(50);
    expect(camera.sx(0)).toBe(50);
    expect(camera.sx(200)).toBe(350);
  });

  it('écran → monde est l’inverse de monde → écran', () => {
    const camera = new Camera();
    camera.fit({ minX: -20, minY: 10, maxX: 240, maxY: 405 }, { x: 0, y: 60, width: 390, height: 700 }, 8);
    const p = camera.toWorld(camera.sx(123.4), camera.sy(56.7));
    expect(p.x).toBeCloseTo(123.4, 9);
    expect(p.y).toBeCloseTo(56.7, 9);
  });
});
