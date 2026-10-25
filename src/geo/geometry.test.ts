import { describe, expect, it } from 'vitest';
import {
  clipPolygonToRect,
  clipPolylineToRect,
  convexHull,
  convexOverlap,
  distanceToPolygon,
  douglasPeucker,
  interiorPoint,
  isConvex,
  minimumBoundingRect,
  orientedRect,
  outwardNormal,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polylineToPolygonDistance,
  segmentDistance,
  signedArea,
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

describe('géométrie des emprises réelles', () => {
  // Bâtiment en L (non convexe), parcouru dans les deux sens.
  const ell = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 8 },
    { x: 8, y: 8 },
    { x: 8, y: 20 },
    { x: 0, y: 20 },
  ];

  it('aire signée et normales sortantes selon le sens de parcours', () => {
    expect(signedArea(square)).toBe(100);
    expect(signedArea([...square].reverse())).toBe(-100);
    for (const poly of [ell, [...ell].reverse()]) {
      const orientation = signedArea(poly);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const n = outwardNormal(a, b, orientation);
        const mid = { x: (a.x + b.x) / 2 + n.x * 0.1, y: (a.y + b.y) / 2 + n.y * 0.1 };
        expect(pointInPolygon(mid, poly)).toBe(false);
      }
    }
  });

  it('convexité, rectangle englobant minimal et point intérieur d’un L', () => {
    expect(isConvex(square)).toBe(true);
    expect(isConvex(ell)).toBe(false);
    const tilted = orientedRect({ x: 5, y: 5 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, 6, 3);
    expect(minimumBoundingRect(tilted).area).toBeCloseTo(72, 6);
    expect(minimumBoundingRect(ell).area).toBeCloseTo(400, 6);
    const p = interiorPoint(ell);
    expect(pointInPolygon(p, ell)).toBe(true);
    // Le centre moyen d’un L tombe dehors : d’où interiorPoint pour poser une tourelle sur le toit.
    expect(pointInPolygon(polygonCentroid(ell), ell)).toBe(false);
  });

  it('enveloppe convexe', () => {
    expect(convexHull([...square, { x: 5, y: 5 }])).toHaveLength(4);
  });

  it('Douglas-Peucker garde les extrémités et les vrais coudes', () => {
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0.5 }, { x: 20, y: 0 }, { x: 20, y: 20 }];
    expect(douglasPeucker(line, 1)).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]);
    expect(douglasPeucker(line, 0.1)).toHaveLength(4);
  });

  it('découpe une polyligne par un rectangle', () => {
    const rect = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(clipPolylineToRect([{ x: -5, y: 5 }, { x: 15, y: 5 }], rect)).toEqual([[{ x: 0, y: 5 }, { x: 10, y: 5 }]]);
    // Sort puis rentre : deux morceaux.
    const zigzag = [{ x: 2, y: 2 }, { x: 2, y: 20 }, { x: 8, y: 20 }, { x: 8, y: 2 }];
    const pieces = clipPolylineToRect(zigzag, rect);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual([{ x: 2, y: 2 }, { x: 2, y: 10 }]);
    expect(pieces[1]).toEqual([{ x: 8, y: 10 }, { x: 8, y: 2 }]);
    expect(clipPolylineToRect([{ x: 20, y: 20 }, { x: 30, y: 30 }], rect)).toEqual([]);
  });

  it('découpe un polygone par un rectangle', () => {
    const big = [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }];
    const clipped = clipPolygonToRect(big, { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(polygonArea(clipped)).toBeCloseTo(25, 9);
  });
});
