import { describe, expect, it } from 'vitest';
import { Camera } from '../render/camera';
import { findSlotAt } from './input';

describe('toucher d’un emplacement', () => {
  const camera = new Camera();
  camera.fit({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { x: 0, y: 0, width: 200, height: 200 }, 0);
  const slots = [
    { id: 1, x: 10, y: 10 },
    { id: 2, x: 20, y: 10 },
  ];

  it('choisit l’emplacement le plus proche dans le rayon', () => {
    expect(findSlotAt(slots, 22, 20, camera, 20)?.id).toBe(1);
    expect(findSlotAt(slots, 36, 22, camera, 20)?.id).toBe(2);
  });

  it('ne renvoie rien hors du rayon', () => {
    expect(findSlotAt(slots, 150, 150, camera, 20)).toBeNull();
  });
});
