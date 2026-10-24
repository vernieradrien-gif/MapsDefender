import { describe, expect, it } from 'vitest';
import { createFixedMap } from '../../geo/fixedMap';
import { PreparedPath } from '../path';
import { validateMap } from '../mapValidation';
import { straightMap, testConfig } from './helpers';

describe('validation de carte', () => {
  const rules = testConfig().mapRules;

  it('la carte fixe du jalon 1 est valide', () => {
    expect(validateMap(createFixedMap(), rules)).toEqual([]);
  });

  it('la carte fixe a un chemin assez long et assez d’emplacements', () => {
    const map = createFixedMap();
    const length = new PreparedPath(map.paths[0]!.points).length;
    expect(length).toBeGreaterThanOrEqual(600);
    expect(map.slots.length).toBeGreaterThanOrEqual(20);
  });

  it('détecte un emplacement posé sur le chemin', () => {
    const map = straightMap();
    map.slots.push({ id: 3, x: 30, y: 2 });
    expect(validateMap(map, rules).join()).toMatch(/trop proche du chemin/);
  });

  it('détecte un chemin qui ne finit pas sur la base', () => {
    const map = straightMap();
    map.base = { x: 50, y: 50 };
    expect(validateMap(map, rules).join()).toMatch(/base/);
  });

  it('détecte des emplacements qui se chevauchent', () => {
    const map = straightMap();
    map.slots.push({ id: 3, x: 52, y: 16 });
    expect(validateMap(map, rules).join()).toMatch(/trop proches/);
  });

  it('détecte un emplacement sur une rue décorative', () => {
    const map = straightMap();
    map.streets.push([{ x: 50, y: 0 }, { x: 50, y: 50 }]);
    expect(validateMap(map, rules).join()).toMatch(/rue/);
  });
});
