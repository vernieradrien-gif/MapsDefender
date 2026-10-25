import { describe, expect, it } from 'vitest';
import { testConfig } from '../game/__tests__/helpers';
import { validateMap } from '../game/mapValidation';
import { distanceToPolyline } from '../game/path';
import { averageRouteLength } from '../game/scaling';
import type { Building, Street } from '../game/types';
import { isConvex, orientedRect } from './geometry';
import { assembleMap } from './mapBuilder';
import { loadGameMap, villagexpoMap } from './maps';

const config = testConfig();

describe('carte réelle : Villagexpo (Saint-Michel-sur-Orge)', () => {
  const map = villagexpoMap();

  it('est valide et jouable', () => {
    expect(validateMap(map, config.mapRules)).toEqual([]);
    expect(map.slots.length).toBeGreaterThanOrEqual(config.mapRules.minSlots);
    expect(map.slots.length).toBeLessThanOrEqual(config.mapRules.maxSlots);
    expect(map.paths.length).toBeGreaterThanOrEqual(map.entries.length);
  });

  it('est chargée par le jeu à la place de la carte de démonstration', () => {
    const loaded = loadGameMap(config.mapRules);
    expect(loaded.fallback).toBe(false);
    expect(loaded.map.id).toBe('villagexpo');
    expect(loadGameMap(config.mapRules, { demo: true }).map.id).toBe('fixed-demo');
  });

  it('protège le Hall du Villagexpo et cite OpenStreetMap', () => {
    const base = map.buildings.find((b) => b.id === map.baseBuildingId);
    expect(base?.name).toBe('Hall du Villagexpo');
    expect(map.attribution).toBe('© OpenStreetMap contributors');
  });

  it('les virus arrivent de l’extérieur, par des rues qui sortent de la carte, de plusieurs côtés', () => {
    const { minX, minY, maxX, maxY } = map.bounds;
    const outside = (p: { x: number; y: number }) => p.x < minX || p.x > maxX || p.y < minY || p.y > maxY;
    for (const e of map.entries) {
      expect(Math.min(e.x - minX, maxX - e.x, e.y - minY, maxY - e.y)).toBeLessThan(2);
    }
    for (const path of map.paths) {
      expect(outside(path.points[0]!)).toBe(true);
      expect(map.entries.some((e) => distanceToPolyline(e, path.points) < 0.5)).toBe(true);
      expect(path.points[path.points.length - 1]).toEqual(map.base);
    }
    const sides = new Set(
      map.entries.map((e) => {
        const d = [e.x - minX, maxX - e.x, e.y - minY, maxY - e.y];
        return d.indexOf(Math.min(...d));
      }),
    );
    expect(sides.size).toBeGreaterThanOrEqual(3);
  });

  it('a de vrais bâtiments, dont des emprises non convexes, et des toits à deux pans', () => {
    expect(map.buildings.length).toBeGreaterThan(200);
    expect(map.buildings.some((b) => !isConvex(b.footprint))).toBe(true);
    expect(map.buildings.some((b) => b.roof === 'gable')).toBe(true);
    expect(map.buildings.some((b) => b.kind === 'public')).toBe(true);
  });

  it('itinéraires de 600 m en moyenne au moins', () => {
    expect(averageRouteLength(map.paths)).toBeGreaterThanOrEqual(600);
  });
});

describe('assemblage d’une carte', () => {
  // Quartier en grille 3 × 3 (îlots de 100 m), deux rues qui sortent de la zone, une impasse.
  const streets: Street[] = [
    ...[0, 100, 200].map((y) => ({ width: 8, points: [{ x: 0, y }, { x: 200, y }] })),
    ...[0, 100, 200].map((x) => ({ width: 8, points: [{ x, y: 0 }, { x, y: 200 }] })),
    { width: 10, points: [{ x: -80, y: 100 }, { x: 0, y: 100 }] },
    { width: 10, points: [{ x: 100, y: 200 }, { x: 100, y: 290 }] },
    { width: 8, points: [{ x: 200, y: 50 }, { x: 250, y: 50 }] },
  ];
  const house = (id: number, x: number, y: number, size: number, height: number): Building => ({
    id,
    footprint: orientedRect({ x, y }, { x: 1, y: 0 }, size, size),
    height,
    roof: 'flat',
    palette: 0,
    kind: 'house',
  });
  const buildings = [house(1, 50, 50, 6, 6), house(2, 120, 115, 9, 12), house(3, 160, 160, 5, 6)];
  const zone = { minX: -40, minY: -40, maxX: 270, maxY: 250 };
  const { map, report } = assembleMap(
    { id: 't', name: 'Test', seed: 1, zone, streets, buildings, areas: [], trees: false },
    config,
  );

  it('choisit le bâtiment le plus imposant et central comme base', () => {
    expect(map.baseBuildingId).toBe(2);
    expect(report.baseName).toBeNull();
  });

  it('trouve les deux entrées et emprunte toutes les rues, sauf l’impasse', () => {
    expect(map.entries).toHaveLength(2);
    expect(report.coveredEdges).toBe(report.totalEdges - 1);
    expect(report.uncoveredLength).toBeCloseTo(50, 0);
    for (const p of map.paths) expect(p.points[p.points.length - 1]).toEqual(map.base);
  });

  it('complète par des socles quand les toits manquent', () => {
    expect(map.slots.length).toBeGreaterThanOrEqual(config.mapRules.minSlots);
    expect(map.slots.some((s) => s.kind === 'pad')).toBe(true);
    expect(map.slots.some((s) => s.buildingId === 2)).toBe(false);
  });
});
