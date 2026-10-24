import { describe, expect, it } from 'vitest';
import {
  convexOverlap,
  distanceToPolygon,
  orientedRect,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polylineToPolygonDistance,
  segmentDistance,
} from './geometry';

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe('géométrie', () => {
  it('aire, centre et appartenance d’un polygone', () => {
    expect(polygonArea(square)).toBe(100);
    expect(polygonCentroid(square)).toEqual({ x: 5, y: 5 });
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it('rectangle orienté', () => {
    const r = orientedRect({ x: 0, y: 0 }, { x: 0, y: 1 }, 5, 2);
    expect(polygonArea(r)).toBeCloseTo(40, 9);
    expect(pointInPolygon({ x: 0, y: 4 }, r)).toBe(true);
    expect(pointInPolygon({ x: 3, y: 0 }, r)).toBe(false);
  });

  it('distances point / polygone et segment / segment', () => {
    expect(distanceToPolygon({ x: 13, y: 5 }, square)).toBe(3);
    expect(distanceToPolygon({ x: 2, y: 2 }, square)).toBe(0);
    expect(segmentDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 })).toBe(0);
    expect(segmentDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 4 }, { x: 10, y: 4 })).toBe(4);
  });

  it('distance polyligne / polygone', () => {
    expect(polylineToPolygonDistance([{ x: -5, y: 15 }, { x: 15, y: 15 }], square)).toBe(5);
    expect(polylineToPolygonDistance([{ x: -5, y: 5 }, { x: 15, y: 5 }], square)).toBe(0);
  });

  it('chevauchement de polygones convexes, avec marge', () => {
    const shifted = square.map((p) => ({ x: p.x + 12, y: p.y }));
    expect(convexOverlap(square, shifted)).toBe(false);
    expect(convexOverlap(square, shifted, 3)).toBe(true);
    expect(convexOverlap(square, square.map((p) => ({ x: p.x + 5, y: p.y + 5 })))).toBe(true);
  });
});
