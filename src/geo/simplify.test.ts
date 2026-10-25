import { describe, expect, it } from 'vitest';
import type { Street, Vec2 } from '../game/types';
import { buildStreetGraph } from './graph';
import { localProjection } from './projection';
import { attachPoint, largestComponent, simplifyStreetGraph } from './simplify';

type P = [number, number];
const street = (...points: P[]): Street => ({ width: 8, points: points.map(([x, y]) => ({ x, y })) });
const total = (g: { edges: { length: number }[] }) => g.edges.reduce((s, e) => s + e.length, 0);
const options = { mergeDistance: 8, minDeadEnd: 30, tolerance: 3 };

describe('projection locale', () => {
  const center = { lat: 48.6297865, lon: 2.3249138 };
  const proj = localProjection(center);

  it('le centre est à l’origine, x vers l’est, y vers le sud', () => {
    const origin = proj.toLocal(center);
    expect(Math.abs(origin.x) + Math.abs(origin.y)).toBe(0);
    const east = proj.toLocal({ lat: center.lat, lon: center.lon + 0.001 });
    const north = proj.toLocal({ lat: center.lat + 0.001, lon: center.lon });
    expect(east.x).toBeGreaterThan(0);
    expect(north.y).toBeLessThan(0);
    // 0,001° de latitude ≈ 111 m ; en longitude, × cos(latitude).
    expect(-north.y).toBeCloseTo(111.2, 0);
    expect(east.x).toBeCloseTo(111.2 * Math.cos((center.lat * Math.PI) / 180), 0);
  });

  it('aller-retour exact', () => {
    const p = { x: 123.4, y: -56.7 };
    const back = proj.toLocal(proj.toLatLon(p));
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });
});

describe('simplification du graphe (§ 4)', () => {
  it('garde la plus grande composante connexe', () => {
    const g = buildStreetGraph([street([0, 0], [200, 0]), street([0, 100], [20, 100])]);
    const big = largestComponent(g);
    expect(big.edges).toHaveLength(1);
    expect(total(big)).toBeCloseTo(200, 6);
  });

  it('supprime les impasses de moins de 30 m, garde les plus longues', () => {
    const g = buildStreetGraph([
      street([0, 0], [300, 0]),
      street([100, 0], [100, 20]), // impasse de 20 m
      street([200, 0], [200, 50]), // impasse de 50 m
    ]);
    const s = simplifyStreetGraph(g, options);
    expect(total(s)).toBeCloseTo(350, 6);
    // Le carrefour de l'impasse supprimée disparaît : la rue principale est d'un seul tenant jusqu'à x = 200.
    expect(s.nodes.some((n) => n.x === 100 && n.y === 0)).toBe(false);
  });

  it('ne supprime jamais une entrée protégée, même courte', () => {
    const g = buildStreetGraph([street([0, 0], [300, 0]), street([100, 0], [100, -20])]);
    const isProtected = (p: Vec2) => p.y <= -19;
    const s = simplifyStreetGraph(g, { ...options, isProtected });
    expect(s.nodes.some((n) => n.y === -20)).toBe(true);
  });

  it('fusionne les carrefours reliés par un tronçon de moins de 8 m', () => {
    // Deux carrefours en T décalés de 5 m (double carrefour) sur une boucle.
    const g = buildStreetGraph([
      street([0, 0], [200, 0], [200, 100], [0, 100], [0, 0]),
      street([100, 0], [100, 50], [105, 50], [105, 100]),
    ]);
    const before = g.nodes.length;
    const s = simplifyStreetGraph(g, options);
    expect(s.nodes.length).toBeLessThanOrEqual(before);
    for (const e of s.edges) expect(e.length).toBeGreaterThanOrEqual(8);
  });

  it('lisse les tracés à 3 m près (Douglas-Peucker) sans bouger les carrefours', () => {
    const wiggly = street([0, 0], [50, 1], [100, -1], [150, 1], [200, 0]);
    const s = simplifyStreetGraph(buildStreetGraph([wiggly, street([200, 0], [200, 100]), street([200, 0], [300, 0])]), options);
    const main = s.edges.find((e) => e.points.some((p) => p.x === 0))!;
    expect(main.points).toHaveLength(2);
  });

  it('raccorde un point au graphe en coupant le tronçon le plus proche', () => {
    const g = buildStreetGraph([street([0, 0], [100, 0])]);
    const { graph, node } = attachPoint(g, { x: 40, y: 12 });
    expect(graph.nodes[node]).toMatchObject({ x: 40, y: 0 });
    expect(graph.edges).toHaveLength(2);
    expect(total(graph)).toBeCloseTo(100, 6);
    // Près d'un carrefour existant : on réutilise ce nœud.
    const near = attachPoint(g, { x: 1.5, y: 10 });
    expect(near.graph).toBe(g);
    expect(g.nodes[near.node]).toMatchObject({ x: 0, y: 0 });
  });
});
