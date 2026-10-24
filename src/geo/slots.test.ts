import { describe, expect, it } from 'vitest';
import { testConfig } from '../game/__tests__/helpers';
import { distanceToPolyline, pointInPolygon } from '../game/path';
import type { Building, Street } from '../game/types';
import { orientedRect } from './geometry';
import { placeTowerSlots } from './slots';

const rules = testConfig().mapRules;
const bounds = { minX: -100, minY: -100, maxX: 900, maxY: 100 };
// Une longue rue droite de 800 m.
const path = { id: 'p', points: [{ x: 0, y: 0 }, { x: 800, y: 0 }] };
const streets: Street[] = [{ points: path.points, width: 10 }];
const base = { x: 800, y: 0 };

/** Une rangée de maisons au nord de la rue, de x = 0 à x = maxX. */
function houses(maxX: number): Building[] {
  const out: Building[] = [];
  for (let x = 8; x < maxX; x += 14) {
    out.push({
      id: out.length + 1,
      footprint: orientedRect({ x, y: -15 }, { x: 1, y: 0 }, 5, 5),
      height: 7,
      roof: 'flat',
      palette: 0,
    });
  }
  return out;
}

describe('emplacements de tourelles', () => {
  it('se posent sur les toits quand il y a des maisons le long du chemin', () => {
    const buildings = houses(800);
    const slots = placeTowerSlots({ paths: [path], streets, buildings, areas: [], bounds, base }, rules);
    expect(slots.length).toBeGreaterThanOrEqual(rules.minSlots);
    expect(slots.every((s) => s.kind === 'roof')).toBe(true);
    for (const s of slots) {
      const b = buildings.find((x) => x.id === s.buildingId)!;
      expect(pointInPolygon(s, b.footprint)).toBe(true);
      expect(s.elevation).toBe(b.height);
    }
  });

  it('respectent l’espacement minimal', () => {
    const slots = placeTowerSlots({ paths: [path], streets, buildings: houses(800), areas: [], bounds, base }, rules);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const d = Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.y - slots[j]!.y);
        expect(d).toBeGreaterThanOrEqual(rules.slotMinSpacing);
      }
    }
  });

  it('sans bâtiment, des socles sont posés à côté du chemin', () => {
    const slots = placeTowerSlots({ paths: [path], streets, buildings: [], areas: [], bounds, base }, rules);
    expect(slots.length).toBeGreaterThanOrEqual(rules.minSlots);
    for (const s of slots) {
      expect(s.kind).toBe('pad');
      expect(s.buildingId).toBeNull();
      expect(distanceToPolyline(s, path.points)).toBeCloseTo(rules.padOffsetFromPath, 6);
    }
  });

  it('un tronçon sans maisons reçoit des socles : tout le chemin reste couvert', () => {
    const buildings = houses(400);
    const slots = placeTowerSlots({ paths: [path], streets, buildings, areas: [], bounds, base }, rules);
    expect(slots.some((s) => s.kind === 'roof')).toBe(true);
    expect(slots.filter((s) => s.kind === 'pad').some((s) => s.x > 400)).toBe(true);
    expect(slots.filter((s) => s.kind === 'roof').every((s) => s.x < 400)).toBe(true);
    for (let x = rules.padStep / 2; x < 800; x += rules.padStep) {
      const near = slots.some((s) => Math.hypot(s.x - x, s.y) <= rules.padCoverageRadius);
      expect(near, `x = ${x}`).toBe(true);
    }
  });

  it('pose d’abord les socles prévus à la main, s’ils sont valides', () => {
    const designedPads = [{ x: 300, y: 30 }, { x: 310, y: 2 }];
    const slots = placeTowerSlots(
      { paths: [path], streets, buildings: houses(800), areas: [], bounds, base, designedPads },
      rules,
    );
    expect(slots[0]).toMatchObject({ x: 300, y: 30, kind: 'pad' });
    expect(slots.some((s) => s.x === 310 && s.y === 2)).toBe(false);
  });

  it('ne dépasse jamais le maximum', () => {
    const many = { minX: -100, minY: -100, maxX: 5000, maxY: 100 };
    const long = { id: 'p', points: [{ x: 0, y: 0 }, { x: 5000, y: 0 }] };
    const slots = placeTowerSlots(
      { paths: [long], streets: [{ points: long.points, width: 10 }], buildings: [], areas: [], bounds: many, base: { x: 5000, y: 0 } },
      rules,
    );
    expect(slots.length).toBeLessThanOrEqual(rules.maxSlots);
  });
});
