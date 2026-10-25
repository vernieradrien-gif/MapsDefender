import { describe, expect, it } from 'vitest';
import { testConfig } from '../game/__tests__/helpers';
import type { Vec2 } from '../game/types';
import { buildingHeight, classifyBuilding, cleanRing, toBuilding } from './buildings';
import { orientedRect, polygonArea } from './geometry';
import { extractFeatures, overpassQuery, stitchRings, type OsmElement } from './osm';
import { localProjection } from './projection';

const rules = testConfig().osm;
const center = { lat: 48.63, lon: 2.32 };
const proj = localProjection(center);
/** Géométrie OSM (lat/lon) d'une liste de points locaux (m). */
const geo = (pts: [number, number][]) => pts.map(([x, y]) => proj.toLatLon({ x, y }));
const ring = (pts: [number, number][]) => geo([...pts, pts[0]!]);

describe('requête Overpass', () => {
  it('demande les voies retenues, les bâtiments, les espaces verts et l’eau, en une requête', () => {
    const q = overpassQuery({ south: 48.62, west: 2.31, north: 48.64, east: 2.33 });
    expect(q).toMatch(/^\[out:json\]\[timeout:25\];/);
    for (const type of ['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street']) {
      expect(q).toContain(type);
    }
    expect(q).not.toMatch(/footway|motorway|service/);
    for (const tag of ['building', 'leisure', 'landuse', 'natural']) expect(q).toContain(`["${tag}"`);
    expect(q).toContain('(48.620000,2.310000,48.640000,2.330000)');
    expect(q.endsWith('out geom;')).toBe(true);
  });
});

describe('lecture de la réponse Overpass', () => {
  const elements: OsmElement[] = [
    { type: 'way', id: 1, tags: { highway: 'residential', name: 'Rue des Lilas' }, geometry: geo([[0, 0], [100, 0]]) },
    { type: 'way', id: 2, tags: { highway: 'footway' }, geometry: geo([[0, 10], [100, 10]]) },
    { type: 'way', id: 3, tags: { highway: 'service' }, geometry: geo([[0, 20], [100, 20]]) },
    { type: 'way', id: 4, tags: { building: 'house' }, geometry: ring([[10, 10], [20, 10], [20, 18], [10, 18]]) },
    { type: 'way', id: 5, tags: { leisure: 'park' }, geometry: ring([[0, 30], [50, 30], [50, 60], [0, 60]]) },
    { type: 'way', id: 6, tags: { natural: 'water' }, geometry: ring([[60, 30], [70, 30], [70, 40]]) },
    {
      type: 'relation',
      id: 7,
      tags: { landuse: 'forest' },
      members: [
        { type: 'way', ref: 70, role: 'outer', geometry: geo([[0, 100], [50, 100], [50, 150]]) },
        { type: 'way', ref: 71, role: 'outer', geometry: geo([[0, 100], [0, 150], [50, 150]]) },
      ],
    },
  ];
  const features = extractFeatures({ elements }, proj);

  it('ne garde que les voies retenues par le cahier des charges', () => {
    expect(features.streets.map((s) => s.id)).toEqual([1]);
    expect(features.streets[0]!.name).toBe('Rue des Lilas');
    expect(features.streets[0]!.points[1]!.x).toBeCloseTo(100, 3);
  });

  it('lit bâtiments, parcs, eau et bois (multipolygones recollés)', () => {
    expect(features.buildings.map((b) => b.id)).toEqual([4]);
    expect(features.buildings[0]!.ring).toHaveLength(4);
    expect(features.areas.map((a) => [a.id, a.kind]).sort()).toEqual([
      [5, 'park'],
      [6, 'water'],
      [7, 'wood'],
    ]);
    expect(polygonArea(features.areas.find((a) => a.id === 7)!.ring)).toBeCloseTo(2500, 0);
  });

  it('recolle des morceaux de contour dans le désordre', () => {
    const parts: Vec2[][] = [
      [{ x: 10, y: 0 }, { x: 10, y: 10 }],
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }],
    ];
    const rings = stitchRings(parts);
    expect(rings).toHaveLength(1);
    expect(polygonArea(rings[0]!)).toBeCloseTo(100, 9);
  });
});

describe('bâtiments réels', () => {
  it('reconnaît l’usage d’après les étiquettes, le nom puis la surface', () => {
    expect(classifyBuilding({ building: 'detached' }, 500, rules)).toBe('house');
    expect(classifyBuilding({ building: 'apartments' }, 80, rules)).toBe('apartments');
    expect(classifyBuilding({ building: 'school' }, 80, rules)).toBe('public');
    expect(classifyBuilding({ building: 'yes', amenity: 'place_of_worship' }, 80, rules)).toBe('public');
    expect(classifyBuilding({ building: 'yes', name: 'Hall du Villagexpo' }, 594, rules)).toBe('public');
    expect(classifyBuilding({ building: 'yes', name: 'École Jules Verne' }, 900, rules)).toBe('public');
    expect(classifyBuilding({ building: 'yes', name: 'Centre commercial des Genêts' }, 900, rules)).toBe('commercial');
    expect(classifyBuilding({ building: 'yes', name: 'Résidence Debussy' }, 1800, rules)).toBe('apartments');
    expect(classifyBuilding({ building: 'yes' }, 12, rules)).toBe('annex');
    expect(classifyBuilding({ building: 'yes' }, 110, rules)).toBe('house');
    expect(classifyBuilding({ building: 'yes' }, 600, rules)).toBe('apartments');
    expect(classifyBuilding({ building: 'yes' }, 4000, rules)).toBe('commercial');
  });

  it('hauteur = hauteur OSM, sinon niveaux × 3 m, sinon valeur par défaut du type', () => {
    expect(buildingHeight({ height: '12.5' }, 'house', rules)).toBe(12.5);
    expect(buildingHeight({ 'building:levels': '4' }, 'apartments', rules)).toBe(12);
    expect(buildingHeight({ 'building:levels': '2' }, 'house', rules)).toBe(6);
    expect(buildingHeight({}, 'house', rules)).toBe(rules.defaultHeights.house);
    expect(buildingHeight({}, 'apartments', rules)).toBe(rules.defaultHeights.apartments);
  });

  it('nettoie les contours (points en double, points alignés)', () => {
    const noisy = [{ x: 0, y: 0 }, { x: 5, y: 0.05 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
    expect(cleanRing(noisy, 0.3)).toHaveLength(4);
  });

  it('maison presque rectangulaire : toit à deux pans ; forme en L : toit plat et vraie emprise', () => {
    const rect = orientedRect({ x: 0, y: 0 }, { x: 0.8, y: 0.6 }, 6, 4);
    const house = toBuilding(1, { building: 'house' }, rect, rules, 6)!;
    expect(house.roof).toBe('gable');
    expect(house.footprint).toHaveLength(4);
    const ell = [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 14 }, { x: 0, y: 14 }];
    const lShape = toBuilding(2, { building: 'house' }, ell, rules, 6)!;
    expect(lShape.roof).toBe('flat');
    expect(lShape.footprint).toHaveLength(6);
    const block = toBuilding(3, { building: 'apartments' }, rect, rules, 6)!;
    expect(block.roof).toBe('flat');
    expect(toBuilding(4, { building: 'shed' }, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], rules, 6)).toBeNull();
  });
});
