import { describe, expect, it } from 'vitest';
import { createFixedMap } from '../../geo/fixedMap';
import { PreparedPath } from '../path';
import { validateMap } from '../mapValidation';
import { straightMap, testConfig } from './helpers';

describe('validation de carte', () => {
  const rules = testConfig().mapRules;

  it('la carte fixe du jalon 1 est valide', () => {
    expect(validateMap(createFixedMap(rules), rules)).toEqual([]);
  });

  it('la carte fixe a un chemin d’au moins 600 m et assez d’emplacements', () => {
    const map = createFixedMap(rules);
    const length = new PreparedPath(map.paths[0]!.points).length;
    expect(length).toBeGreaterThanOrEqual(600);
    expect(map.slots.length).toBeGreaterThanOrEqual(rules.minSlots);
  });

  it('sur la carte fixe, bien bâtie, tout est sur les toits sauf le socle prévu dans le parc', () => {
    const map = createFixedMap(rules);
    const pads = map.slots.filter((s) => s.kind === 'pad');
    expect(pads.map((s) => [s.x, s.y])).toEqual([[132, 160]]);
    expect(map.slots.length - pads.length).toBeGreaterThanOrEqual(rules.minSlots);
  });

  it('signale une carte sans assez d’emplacements', () => {
    expect(validateMap(straightMap(), rules).join()).toMatch(/pas assez d'emplacements/);
  });

  it('détecte un socle posé sur une rue', () => {
    const map = straightMap();
    map.slots.push({ id: 3, x: 30, y: 2, kind: 'pad', elevation: 0.6, buildingId: null });
    expect(validateMap(map, rules).join()).toMatch(/trop proche d'une rue/);
  });

  it('détecte un emplacement de toit hors de son bâtiment', () => {
    const map = straightMap();
    map.buildings.push({
      id: 7,
      footprint: [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 20, y: 30 }],
      height: 8,
      roof: 'flat',
      palette: 0,
    });
    map.slots.push({ id: 3, x: 25, y: 40, kind: 'roof', elevation: 8, buildingId: 7 });
    map.slots.push({ id: 4, x: 60, y: 45, kind: 'roof', elevation: 8, buildingId: 99 });
    const errors = validateMap(map, rules).join();
    expect(errors).toMatch(/hors de son toit/);
    expect(errors).toMatch(/bâtiment introuvable/);
  });

  it('détecte un chemin qui ne finit pas sur la base', () => {
    const map = straightMap();
    map.base = { x: 50, y: 50 };
    expect(validateMap(map, rules).join()).toMatch(/ne se termine pas sur la base/);
  });

  it('détecte des emplacements trop proches', () => {
    const map = straightMap();
    map.slots.push({ id: 3, x: 52, y: 26, kind: 'pad', elevation: 0.6, buildingId: null });
    expect(validateMap(map, rules).join()).toMatch(/trop proches/);
  });
});
