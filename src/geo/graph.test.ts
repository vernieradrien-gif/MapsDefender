import { describe, expect, it } from 'vitest';
import { Rng } from '../game/rng';
import type { Street } from '../game/types';
import {
  buildStreetGraph,
  coverRoutes,
  dijkstra,
  findEntries,
  nearestNode,
  pathTo,
  routePoints,
  type Route,
  type StreetGraph,
} from './graph';

type P = [number, number];

const street = (...points: P[]): Street => ({ width: 8, points: points.map(([x, y]) => ({ x, y })) });

const nodeAt = (g: StreetGraph, x: number, y: number) => {
  const n = g.nodes.find((n) => Math.hypot(n.x - x, n.y - y) < 1e-6);
  if (!n) throw new Error(`aucun nœud en (${x}, ${y})`);
  return n.id;
};

const degree = (g: StreetGraph, id: number) => g.adjacency[id]!.length;
const totalLength = (g: StreetGraph) => g.edges.reduce((s, e) => s + e.length, 0);

/** Vérifie qu'un itinéraire est un chemin simple et cohérent de l'entrée à la base. */
function expectSimpleRoute(g: StreetGraph, route: Route, base: number): void {
  expect(route.nodes[0]).toBe(route.entry);
  expect(route.nodes[route.nodes.length - 1]).toBe(base);
  expect(route.nodes.length).toBe(route.edges.length + 1);
  expect(new Set(route.nodes).size).toBe(route.nodes.length);
  route.edges.forEach((eid, i) => {
    const e = g.edges[eid]!;
    const ends = [e.a, e.b].sort();
    expect([route.nodes[i]!, route.nodes[i + 1]!].sort()).toEqual(ends);
  });
  expect(route.length).toBeCloseTo(route.edges.reduce((s, id) => s + g.edges[id]!.length, 0), 6);
}

/**
 * Quartier en grille 3 × 3 (rues tous les 100 m) avec quatre rues qui
 * sortent de la zone : à gauche, à droite, en haut et en bas.
 */
function gridStreets(): Street[] {
  return [
    street([0, 0], [200, 0]),
    street([-40, 100], [240, 100]),
    street([0, 200], [200, 200]),
    street([0, 0], [0, 200]),
    street([100, -40], [100, 240]),
    street([200, 0], [200, 200]),
  ];
}
const gridBounds = { minX: -30, minY: -30, maxX: 230, maxY: 230 };

describe('graphe des rues : construction', () => {
  it('une jonction en T devient un carrefour qui coupe la rue principale', () => {
    const g = buildStreetGraph([street([0, 0], [100, 0]), street([50, 0], [50, 60])]);
    expect(g.nodes).toHaveLength(4);
    expect(g.edges).toHaveLength(3);
    expect(degree(g, nodeAt(g, 50, 0))).toBe(3);
    expect(totalLength(g)).toBeCloseTo(160, 6);
  });

  it('une extrémité posée à moins de la tolérance d’une rue y est raccordée', () => {
    const g = buildStreetGraph([street([0, 0], [100, 0]), street([50, 0.3], [50, 60])], 0.5);
    expect(g.edges).toHaveLength(3);
    expect(degree(g, nodeAt(g, 50, 0))).toBe(3);
  });

  it('une extrémité trop éloignée reste une impasse', () => {
    const g = buildStreetGraph([street([0, 0], [100, 0]), street([50, 3], [50, 60])], 0.5);
    expect(g.edges).toHaveLength(2);
  });

  it('un croisement en X devient un carrefour à quatre branches', () => {
    const g = buildStreetGraph([street([0, 0], [100, 0]), street([50, -50], [50, 50])]);
    expect(g.nodes).toHaveLength(5);
    expect(g.edges).toHaveLength(4);
    expect(degree(g, nodeAt(g, 50, 0))).toBe(4);
    expect(totalLength(g)).toBeCloseTo(200, 6);
  });

  it('des rues qui partagent une extrémité se rejoignent au même carrefour', () => {
    const g = buildStreetGraph([street([0, 0], [50, 0]), street([50, 0], [50, 50]), street([50, 0], [100, 0])]);
    expect(g.nodes).toHaveLength(4);
    expect(degree(g, nodeAt(g, 50, 0))).toBe(3);
  });

  it('les points intermédiaires sans carrefour restent dans le tracé', () => {
    const g = buildStreetGraph([street([0, 0], [30, 10], [60, 0], [100, 0])]);
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.points).toHaveLength(4);
    expect(g.edges[0]!.length).toBeCloseTo(2 * Math.hypot(30, 10) + 40, 6);
  });

  it('un carrefour sur un point intermédiaire coupe le tracé sans perdre la forme', () => {
    const g = buildStreetGraph([street([0, 0], [30, 10], [60, 0], [100, 0]), street([60, 0], [60, 40])]);
    expect(g.edges).toHaveLength(3);
    const mid = nodeAt(g, 60, 0);
    expect(degree(g, mid)).toBe(3);
    const left = g.edges.find((e) => e.points.length === 3)!;
    expect(left.points.map((p) => [p.x, p.y])).toContainEqual([30, 10]);
  });

  it('chaque arête part de son nœud a et arrive à son nœud b', () => {
    const g = buildStreetGraph(gridStreets());
    for (const e of g.edges) {
      const first = e.points[0]!;
      const last = e.points[e.points.length - 1]!;
      expect([first.x, first.y]).toEqual([g.nodes[e.a]!.x, g.nodes[e.a]!.y]);
      expect([last.x, last.y]).toEqual([g.nodes[e.b]!.x, g.nodes[e.b]!.y]);
      expect(e.a).not.toBe(e.b);
    }
  });

  it('la grille donne 13 nœuds et 16 tronçons', () => {
    const g = buildStreetGraph(gridStreets());
    expect(g.nodes).toHaveLength(13);
    expect(g.edges).toHaveLength(16);
    expect(degree(g, nodeAt(g, 100, 100))).toBe(4);
    expect(degree(g, nodeAt(g, 0, 0))).toBe(2);
    expect(degree(g, nodeAt(g, 0, 100))).toBe(4);
    expect(degree(g, nodeAt(g, -40, 100))).toBe(1);
  });

  it('une rue en boucle est gardée et coupée en deux tronçons', () => {
    const ring = street([0, 0], [40, 0], [40, 40], [0, 40], [0, 0]);
    const g = buildStreetGraph([ring, street([-50, 0], [0, 0])]);
    expect(totalLength(g)).toBeCloseTo(210, 6);
    for (const e of g.edges) expect(e.a).not.toBe(e.b);
    expect(degree(g, nodeAt(g, 0, 0))).toBe(3);
  });

  it('une boucle isolée est aussi gardée', () => {
    const g = buildStreetGraph([street([0, 0], [40, 0], [40, 40], [0, 40], [0, 0])]);
    expect(g.edges).toHaveLength(2);
    expect(totalLength(g)).toBeCloseTo(160, 6);
  });

  it('deux rues superposées ne créent pas de tronçon en double', () => {
    const g = buildStreetGraph([street([0, 0], [100, 0]), street([0, 0], [100, 0])]);
    expect(g.edges).toHaveLength(1);
  });
});

describe('graphe des rues : Dijkstra', () => {
  const g = buildStreetGraph(gridStreets());
  const corner = nodeAt(g, 0, 0);
  const center = nodeAt(g, 100, 100);
  const far = nodeAt(g, 200, 200);

  it('donne les plus courtes distances', () => {
    const { dist, via } = dijkstra(g, corner);
    expect(dist[corner]).toBe(0);
    expect(via[corner]).toBe(-1);
    expect(dist[center]).toBeCloseTo(200, 6);
    expect(dist[far]).toBeCloseTo(400, 6);
    expect(dist[nodeAt(g, -40, 100)]).toBeCloseTo(140, 6);
  });

  it('reconstruit le chemin jusqu’à une cible', () => {
    const path = pathTo(g, dijkstra(g, corner), far)!;
    expect(path.nodes[0]).toBe(corner);
    expect(path.nodes[path.nodes.length - 1]).toBe(far);
    expect(path.edges).toHaveLength(4);
    expect(pathTo(g, dijkstra(g, corner), corner)).toEqual({ nodes: [corner], edges: [] });
  });

  it('contourne les nœuds bloqués', () => {
    const left = nodeAt(g, 0, 100);
    const top = nodeAt(g, 100, 0);
    const blocked = new Set([left, top]);
    const { dist } = dijkstra(g, corner, blocked);
    expect(dist[left]).toBe(Infinity);
    expect(dist[center]).toBe(Infinity);
    const open = dijkstra(g, center, new Set([nodeAt(g, 100, 200), nodeAt(g, 200, 100)]));
    expect(open.dist[far]).toBe(Infinity);
    expect(open.dist[corner]).toBeCloseTo(200, 6);
    const around = dijkstra(g, center, new Set([nodeAt(g, 0, 100)]));
    expect(around.dist[nodeAt(g, -40, 100)]).toBe(Infinity);
  });

  it('renvoie null pour une cible inaccessible', () => {
    const iso = buildStreetGraph([street([0, 0], [10, 0]), street([50, 50], [60, 50])]);
    expect(pathTo(iso, dijkstra(iso, 0), 3)).toBeNull();
  });
});

describe('graphe des rues : entrées', () => {
  it('les entrées sont les extrémités de rue au bord de la zone', () => {
    const g = buildStreetGraph(gridStreets());
    const entries = findEntries(g, gridBounds, 15).map((id) => [g.nodes[id]!.x, g.nodes[id]!.y]);
    expect(entries.sort()).toEqual(
      [
        [-40, 100],
        [100, -40],
        [100, 240],
        [240, 100],
      ].sort(),
    );
  });

  it('une impasse à l’intérieur du quartier n’est pas une entrée', () => {
    const g = buildStreetGraph([...gridStreets(), street([100, 100], [150, 150])]);
    const entries = findEntries(g, gridBounds, 15);
    expect(entries).toHaveLength(4);
    expect(entries).not.toContain(nodeAt(g, 150, 150));
  });

  it('un carrefour au bord n’est pas une entrée', () => {
    const g = buildStreetGraph([street([0, 0], [100, 0]), street([50, 0], [50, 50])]);
    const entries = findEntries(g, { minX: 0, minY: 0, maxX: 100, maxY: 100 }, 5);
    expect(entries.map((id) => g.nodes[id]!.x).sort()).toEqual([0, 100]);
  });
});

describe('graphe des rues : itinéraires', () => {
  const g = buildStreetGraph(gridStreets());
  const base = nodeAt(g, 0, 0);
  const entries = findEntries(g, gridBounds, 15);
  const { routes, uncovered } = coverRoutes(g, entries, base);

  it('chaque rue est empruntée par au moins un itinéraire', () => {
    expect(uncovered).toEqual([]);
    const used = new Set(routes.flatMap((r) => r.edges));
    expect(used.size).toBe(g.edges.length);
  });

  it('chaque itinéraire part d’une entrée, finit à la base et ne repasse par aucun carrefour', () => {
    expect(routes.length).toBeGreaterThanOrEqual(entries.length);
    for (const r of routes) {
      expect(entries).toContain(r.entry);
      expectSimpleRoute(g, r, base);
    }
  });

  it('le premier itinéraire de chaque entrée est son plus court chemin', () => {
    entries.forEach((entry, i) => {
      const first = routes[i]!;
      expect(first.entry).toBe(entry);
      expect(first.length).toBeCloseTo(dijkstra(g, entry).dist[base]!, 6);
      expect(routes.findIndex((r) => r.entry === entry)).toBe(i);
    });
  });

  it('les impasses ne peuvent pas être empruntées : elles sont signalées', () => {
    const withDeadEnd = buildStreetGraph([...gridStreets(), street([100, 100], [150, 150])]);
    const b = nodeAt(withDeadEnd, 0, 0);
    const result = coverRoutes(withDeadEnd, findEntries(withDeadEnd, gridBounds, 15), b);
    const deadEnd = withDeadEnd.adjacency[nodeAt(withDeadEnd, 150, 150)]![0]!;
    expect(result.uncovered).toEqual([deadEnd]);
    expect(result.routes.some((r) => r.edges.includes(deadEnd))).toBe(false);
    for (const r of result.routes) expectSimpleRoute(withDeadEnd, r, b);
  });

  it('trouve un itinéraire même quand le plus court accès à la rue bloque la suite', () => {
    // Entrée → E ; E — w — u et E — x — y — u ; u — v — w — B. Le plus court
    // accès à u (ou à v) passe par w, seul accès à la base : pour emprunter
    // u — v, il faut le détour entrée → E → x → y → u → v → w → B.
    const streets = [
      street([-50, 0], [0, 0]), // entrée — E
      street([0, 0], [50, 0]), // E — w
      street([50, 0], [100, 0]), // w — u
      street([0, 0], [0, 60]), // E — x
      street([0, 60], [100, 60]), // x — y
      street([100, 60], [100, 0]), // y — u
      street([100, 0], [100, -30]), // u — v
      street([100, -30], [50, 0]), // v — w
      street([50, 0], [50, -60]), // w — B
    ];
    const graph = buildStreetGraph(streets);
    const entry = nodeAt(graph, -50, 0);
    const b = nodeAt(graph, 50, -60);
    const result = coverRoutes(graph, [entry], b);
    const uv = graph.edges.find(
      (e) => [e.a, e.b].includes(nodeAt(graph, 100, 0)) && [e.a, e.b].includes(nodeAt(graph, 100, -30)),
    )!;
    expect(result.routes.some((r) => r.edges.includes(uv.id))).toBe(true);
    for (const r of result.routes) expectSimpleRoute(graph, r, b);
  });

  it('ignore une entrée confondue avec la base', () => {
    const result = coverRoutes(g, [base, ...entries], base);
    for (const r of result.routes) {
      expect(r.entry).not.toBe(base);
      expectSimpleRoute(g, r, base);
    }
    expect(result.uncovered).toEqual([]);
  });

  it('le tracé d’un itinéraire va de l’entrée à la base sans point en double', () => {
    for (const r of routes) {
      const pts = routePoints(g, r);
      const start = g.nodes[r.entry]!;
      const end = g.nodes[base]!;
      expect([pts[0]!.x, pts[0]!.y]).toEqual([start.x, start.y]);
      expect([pts[pts.length - 1]!.x, pts[pts.length - 1]!.y]).toEqual([end.x, end.y]);
      for (let i = 1; i < pts.length; i++) {
        expect(Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)).toBeGreaterThan(0);
      }
      let length = 0;
      for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      expect(length).toBeCloseTo(r.length, 6);
    }
  });

  it('est déterministe', () => {
    expect(coverRoutes(g, entries, base)).toEqual({ routes, uncovered });
  });

  it('sur des quartiers aléatoires, ne laisse de côté que les rues vraiment impossibles à emprunter', () => {
    const rng = new Rng(2026);
    for (let trial = 0; trial < 60; trial++) {
      // Treillis 4 × 3 dont on garde une partie des rues, avec des rues qui sortent de la zone.
      const streets: Street[] = [];
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          if (i < 3 && rng.next() < 0.75) streets.push(street([i * 50, j * 50], [(i + 1) * 50, j * 50]));
          if (j < 2 && rng.next() < 0.75) streets.push(street([i * 50, j * 50], [i * 50, (j + 1) * 50]));
        }
      }
      for (const [x, y, dx, dy] of [[0, 50, -40, 0], [150, 0, 40, 0], [50, 100, 0, 40], [100, 0, 0, -40]] as const) {
        if (rng.next() < 0.7) streets.push(street([x, y], [x + dx, y + dy]));
      }
      if (streets.length === 0) continue;
      const graph = buildStreetGraph(streets);
      const bounds = { minX: -20, minY: -20, maxX: 170, maxY: 120 };
      const ents = findEntries(graph, bounds, 10);
      const b = nearestNode(graph, { x: 75, y: 50 });
      const result = coverRoutes(graph, ents, b);
      for (const r of result.routes) expectSimpleRoute(graph, r, b);
      const covered = new Set(result.routes.flatMap((r) => r.edges));
      const possible = coverableEdges(graph, ents, b);
      expect([...covered].sort((x, y) => x - y)).toEqual([...possible].sort((x, y) => x - y));
      expect(result.uncovered.sort((x, y) => x - y)).toEqual(
        graph.edges.map((e) => e.id).filter((id) => !possible.has(id)),
      );
    }
  });
});

/** Recherche exhaustive (petits graphes) : tronçons présents dans au moins un chemin simple entrée → base. */
function coverableEdges(g: StreetGraph, entries: readonly number[], base: number): Set<number> {
  const out = new Set<number>();
  const visit = (node: number, seen: Set<number>, edges: number[]) => {
    if (node === base) {
      for (const e of edges) out.add(e);
      return;
    }
    for (const eid of g.adjacency[node]!) {
      const e = g.edges[eid]!;
      const nextNode = e.a === node ? e.b : e.a;
      if (seen.has(nextNode)) continue;
      seen.add(nextNode);
      visit(nextNode, seen, [...edges, eid]);
      seen.delete(nextNode);
    }
  };
  for (const entry of entries) if (entry !== base) visit(entry, new Set([entry]), []);
  return out;
}

describe('graphe des rues : utilitaires', () => {
  it('trouve le nœud le plus proche', () => {
    const g = buildStreetGraph(gridStreets());
    expect(nearestNode(g, { x: 90, y: 112 })).toBe(nodeAt(g, 100, 100));
    expect(nearestNode(g, { x: -100, y: 95 })).toBe(nodeAt(g, -40, 100));
  });
});
