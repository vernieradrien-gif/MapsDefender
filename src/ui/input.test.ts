import { describe, expect, it } from 'vitest';
import type { TowerSlot } from '../game/types';
import { findSlotAt } from './input';

describe('toucher d’un emplacement', () => {
  const slot = (id: number, x: number, y: number): TowerSlot => ({
    id,
    x,
    y,
    kind: 'roof',
    elevation: 8,
    buildingId: id,
  });
  const slots = [slot(1, 10, 10), slot(2, 20, 10)];
  // Affichage : échelle 2, emplacements remontés de 8 px (hauteur du toit).
  const screenOf = (s: TowerSlot) => ({ x: s.x * 2, y: s.y * 2 - 8 });

  it('choisit l’emplacement affiché le plus proche dans le rayon', () => {
    expect(findSlotAt(slots, 22, 12, 20, screenOf)?.id).toBe(1);
    expect(findSlotAt(slots, 36, 14, 20, screenOf)?.id).toBe(2);
  });

  it('vise le toit, pas le pied du bâtiment', () => {
    expect(findSlotAt(slots, 20, 12, 3, screenOf)?.id).toBe(1);
    expect(findSlotAt(slots, 20, 20, 3, screenOf)).toBeNull();
  });

  it('ne renvoie rien hors du rayon', () => {
    expect(findSlotAt(slots, 150, 150, 20, screenOf)).toBeNull();
  });
});
