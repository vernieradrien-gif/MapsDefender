import { describe, expect, it } from 'vitest';
import type { Building } from '../game/types';
import { buildingAtScreen } from './picking';

const box = (id: number, x: number, y: number, size: number, height: number): Building => ({
  id,
  footprint: [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ],
  height,
  roof: 'flat',
  palette: 0,
});

// Projection simple : 1 m = 1 px, la hauteur monte d'un demi-pixel par mètre.
const project = (p: { x: number; y: number }, h: number) => ({ x: p.x, y: p.y - h / 2 });
const top = (b: Building) => b.height;

describe('bâtiment sous le doigt', () => {
  it('toucher le toit, le mur ou le sol du bâtiment le désigne', () => {
    const tower = box(1, 0, 0, 10, 40); // toit dessiné 20 px plus haut
    expect(buildingAtScreen([tower], project, top, { x: 5, y: -15 })?.id).toBe(1); // toit
    expect(buildingAtScreen([tower], project, top, { x: 5, y: -2 })?.id).toBe(1); // mur
    expect(buildingAtScreen([tower], project, top, { x: 5, y: 8 })?.id).toBe(1); // sol
    expect(buildingAtScreen([tower], project, top, { x: 30, y: 5 })).toBeNull();
  });

  it('à côté d’un petit bâtiment, le plus proche à portée de doigt est choisi', () => {
    const house = box(1, 0, 0, 5, 4);
    const other = box(2, 40, 0, 5, 4);
    expect(buildingAtScreen([house, other], project, top, { x: 12, y: 3 })).toBeNull();
    expect(buildingAtScreen([house, other], project, top, { x: 12, y: 3 }, 10)?.id).toBe(1);
    expect(buildingAtScreen([house, other], project, top, { x: 33, y: 3 }, 10)?.id).toBe(2);
    expect(buildingAtScreen([house, other], project, top, { x: 22, y: 3 }, 10)).toBeNull();
  });

  it('le bâtiment le plus proche de la caméra (au sud) passe devant', () => {
    const back: Building = { ...box(1, 0, 0, 10, 6), footprint: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 0, y: 10 }] };
    const front = box(2, 0, 12, 10, 40); // sa silhouette recouvre la gauche du bâtiment de derrière
    expect(buildingAtScreen([back, front], project, top, { x: 5, y: 5 })?.id).toBe(2);
    expect(buildingAtScreen([back, front], project, top, { x: 25, y: 5 })?.id).toBe(1);
  });
});
