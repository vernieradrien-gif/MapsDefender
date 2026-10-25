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

describe('caméra : zoom et déplacement', () => {
  const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 400 };
  const view = { x: 0, y: 50, width: 400, height: 600 };
  const fitted = () => {
    const camera = new Camera();
    camera.fit(bounds, view, 0);
    return camera;
  };

  it('zoome autour du point touché, qui reste sous le doigt', () => {
    const camera = fitted();
    const before = camera.toWorld(150, 300);
    expect(camera.zoomAt(2, 150, 300)).toBe(true);
    expect(camera.scale).toBe(3);
    const after = camera.toWorld(150, 300);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('borne le zoom entre la carte entière et le maximum', () => {
    const camera = fitted();
    camera.zoomAt(0.2, 200, 350);
    expect(camera.zoom).toBe(1);
    camera.zoomAt(100, 200, 350);
    expect(camera.zoom).toBe(camera.maxZoom);
  });

  it('se déplace dans la carte sans pouvoir en sortir', () => {
    const camera = fitted();
    // Carte entière : pas de déplacement possible.
    expect(camera.panBy(100, 100)).toBe(false);
    camera.zoomAt(2, 200, 350);
    expect(camera.panBy(-50, 0)).toBe(true);
    camera.panBy(10000, 10000);
    const topLeft = camera.toWorld(view.x, view.y);
    expect(topLeft.x).toBeCloseTo(0, 9);
    expect(topLeft.y).toBeCloseTo(0, 9);
    camera.reset();
    expect(camera.scale).toBe(1.5);
    expect(camera.sx(0)).toBe(50);
  });

  it('garde le zoom quand la zone visible change de taille', () => {
    const camera = fitted();
    camera.zoomAt(2, 200, 350);
    camera.fit(bounds, { x: 0, y: 40, width: 400, height: 620 }, 0);
    expect(camera.zoom).toBe(2);
  });
});
