import { describe, expect, it } from 'vitest';
import { candidatesInRadius, selectTarget, type TargetCandidate } from '../targeting';

const enemy = (x: number, y: number, remaining: number, alive = true): TargetCandidate & { name: string } => ({
  name: `${x},${y}`,
  x,
  y,
  remaining,
  alive,
});

describe('ciblage des tours', () => {
  it('vise l’ennemi à portée le plus proche de la base', () => {
    const enemies = [enemy(10, 0, 300), enemy(20, 0, 120), enemy(5, 5, 200)];
    expect(selectTarget(0, 0, 50, enemies)?.name).toBe('20,0');
  });

  it('ignore les ennemis hors de portée', () => {
    const enemies = [enemy(100, 0, 10), enemy(30, 0, 500)];
    expect(selectTarget(0, 0, 50, enemies)?.name).toBe('30,0');
  });

  it('ignore les ennemis morts', () => {
    const enemies = [enemy(10, 0, 10, false), enemy(20, 0, 400)];
    expect(selectTarget(0, 0, 50, enemies)?.name).toBe('20,0');
  });

  it('renvoie null sans cible', () => {
    expect(selectTarget(0, 0, 50, [])).toBeNull();
    expect(selectTarget(0, 0, 50, [enemy(60, 0, 10)])).toBeNull();
  });

  it('la limite de portée est incluse', () => {
    expect(selectTarget(0, 0, 50, [enemy(30, 40, 10)])?.name).toBe('30,40');
  });

  it('dégâts de zone : uniquement les vivants dans le rayon', () => {
    const enemies = [enemy(0, 0, 1), enemy(10, 0, 1), enemy(25, 0, 1), enemy(5, 5, 1, false)];
    expect(candidatesInRadius(0, 0, 20, enemies).map((e) => e.name)).toEqual(['0,0', '10,0']);
  });
});
