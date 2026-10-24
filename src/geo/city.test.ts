import { describe, expect, it } from 'vitest';
import { testConfig } from '../game/__tests__/helpers';
import { distanceToPolyline } from '../game/path';
import { createFixedMap } from './fixedMap';
import { convexOverlap, distanceToPolygon, polylineToPolygonDistance } from './geometry';

describe('quartier de la carte fixe', () => {
  const rules = testConfig().mapRules;
  const map = createFixedMap(rules);

  it('contient des maisons, des arbres, un parc, de l’eau et une place', () => {
    expect(map.buildings.length).toBeGreaterThan(60);
    expect(map.trees.length).toBeGreaterThan(40);
    expect(new Set(map.areas.map((a) => a.kind))).toEqual(new Set(['park', 'water', 'plaza']));
    expect(map.buildings.some((b) => b.roof === 'gable')).toBe(true);
    expect(map.buildings.some((b) => b.roof === 'flat')).toBe(true);
  });

  it('aucun bâtiment ne déborde sur une rue ni sur un autre bâtiment', () => {
    for (const b of map.buildings) {
      for (const s of map.streets) {
        expect(polylineToPolygonDistance(s.points, b.footprint)).toBeGreaterThanOrEqual(s.width / 2);
      }
    }
    for (let i = 0; i < map.buildings.length; i++) {
      for (let j = i + 1; j < map.buildings.length; j++) {
        expect(convexOverlap(map.buildings[i]!.footprint, map.buildings[j]!.footprint)).toBe(false);
      }
    }
  });

  it('aucun arbre sur une rue, dans un bâtiment ou dans l’eau', () => {
    const water = map.areas.filter((a) => a.kind === 'water');
    for (const t of map.trees) {
      for (const s of map.streets) expect(distanceToPolyline(t, s.points)).toBeGreaterThan(s.width / 2);
      for (const b of map.buildings) expect(distanceToPolygon(t, b.footprint)).toBeGreaterThan(0);
      for (const w of water) expect(distanceToPolygon(t, w.polygon)).toBeGreaterThan(0);
    }
  });

  it('est identique à chaque génération (déterministe)', () => {
    expect(createFixedMap(rules)).toEqual(map);
  });
});
