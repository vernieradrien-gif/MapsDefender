import { distance } from '../game/path';
import type { Bounds, Street, Vec2 } from '../game/types';

// Graphe des rues : nœuds = carrefours et extrémités, arêtes = tronçons de rue
// (avec leur tracé), pondérées par la longueur. Sert aux itinéraires des virus.

export interface GraphNode {
  id: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: number;
  a: number;
  b: number;
  /** Tracé de a vers b (premier point = nœud a, dernier = nœud b). */
  points: Vec2[];
  length: number;
}

export interface StreetGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Arêtes touchant chaque nœud. */
  adjacency: number[][];
}

const polylineLength = (pts: readonly Vec2[]) => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1]!, pts[i]!);
  return total;
};

/** Point d'intersection propre de deux segments (hors extrémités), ou null. */
function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): { t: number; u: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
  return { t, u };
}

/**
 * Construit le graphe : les extrémités posées sur une autre rue (jonctions en T)
 * et les croisements deviennent des carrefours ; les points intermédiaires
 * sans carrefour restent dans le tracé des arêtes.
 */
export function buildStreetGraph(streets: readonly Street[], tolerance = 0.5): StreetGraph {
  // 1. Points de coupure à insérer dans chaque segment : { rue, segment } -> [t].
  const lines = streets.map((s) => s.points.map((p) => ({ x: p.x, y: p.y })));
  const cuts = lines.map((line) => line.map(() => [] as number[]));
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < lines.length; j++) {
      if (i === j) continue;
      const li = lines[i]!;
      const lj = lines[j]!;
      // Extrémités de i posées sur un segment de j.
      for (const end of [li[0]!, li[li.length - 1]!]) {
        for (let k = 1; k < lj.length; k++) {
          const a = lj[k - 1]!;
          const b = lj[k]!;
          const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
          if (len2 === 0) continue;
          const t = ((end.x - a.x) * (b.x - a.x) + (end.y - a.y) * (b.y - a.y)) / len2;
          if (t <= 1e-6 || t >= 1 - 1e-6) continue;
          const px = a.x + (b.x - a.x) * t;
          const py = a.y + (b.y - a.y) * t;
          if (Math.hypot(end.x - px, end.y - py) <= tolerance) cuts[j]![k - 1]!.push(t);
        }
      }
      // Croisements en X (une seule fois par paire).
      if (j < i) continue;
      for (let k = 1; k < li.length; k++) {
        for (let m = 1; m < lj.length; m++) {
          const hit = segmentIntersection(li[k - 1]!, li[k]!, lj[m - 1]!, lj[m]!);
          if (!hit) continue;
          cuts[i]![k - 1]!.push(hit.t);
          cuts[j]![m - 1]!.push(hit.u);
        }
      }
    }
  }
  const split = lines.map((line, i) => {
    const out: Vec2[] = [line[0]!];
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1]!;
      const b = line[k]!;
      for (const t of [...new Set(cuts[i]![k - 1]!)].sort((x, y) => x - y)) {
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      out.push(b);
    }
    return out;
  });

  // 2. Fusion des points proches en nœuds.
  const points: GraphNode[] = [];
  const cell = (v: number) => Math.round(v / tolerance);
  const grid = new Map<string, number[]>();
  const nodeAt = (p: Vec2): number => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of grid.get(`${cell(p.x) + dx},${cell(p.y) + dy}`) ?? []) {
          const n = points[id]!;
          if (Math.hypot(n.x - p.x, n.y - p.y) <= tolerance) return id;
        }
      }
    }
    const id = points.length;
    points.push({ id, x: p.x, y: p.y });
    const key = `${cell(p.x)},${cell(p.y)}`;
    grid.set(key, [...(grid.get(key) ?? []), id]);
    return id;
  };
  const chains = split.map((line) => line.map(nodeAt).filter((id, k, arr) => k === 0 || id !== arr[k - 1]));

  // 3. Degré de chaque point : un carrefour est une extrémité ou un point partagé.
  const degree = new Map<number, number>();
  const bump = (id: number) => degree.set(id, (degree.get(id) ?? 0) + 1);
  for (const chain of chains) {
    for (let k = 1; k < chain.length; k++) {
      bump(chain[k - 1]!);
      bump(chain[k]!);
    }
  }
  const isJunction = (chain: number[], k: number) =>
    k === 0 || k === chain.length - 1 || (degree.get(chain[k]!) ?? 0) !== 2;

  // 4. Arêtes entre carrefours successifs.
  const nodeIds = new Map<number, number>();
  const nodes: GraphNode[] = [];
  const toNode = (pointId: number) => {
    let id = nodeIds.get(pointId);
    if (id === undefined) {
      const p = points[pointId]!;
      id = nodes.length;
      nodes.push({ id, x: p.x, y: p.y });
      nodeIds.set(pointId, id);
    }
    return id;
  };
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (ids: number[]) => {
    const a = toNode(ids[0]!);
    const b = toNode(ids[ids.length - 1]!);
    if (a === b) {
      // Rue en boucle : on la coupe en deux tronçons au point du milieu.
      if (ids.length < 4) return;
      const mid = Math.floor(ids.length / 2);
      addEdge(ids.slice(0, mid + 1));
      addEdge(ids.slice(mid));
      return;
    }
    const key = ids.length === 2 ? [Math.min(a, b), Math.max(a, b)].join('-') : '';
    if (key !== '' && seen.has(key)) return;
    if (key) seen.add(key);
    const pts = ids.map((id) => ({ x: points[id]!.x, y: points[id]!.y }));
    edges.push({ id: edges.length, a, b, points: pts, length: polylineLength(pts) });
  };
  for (const chain of chains) {
    if (chain.length < 2) continue;
    let start = 0;
    for (let k = 1; k < chain.length; k++) {
      if (!isJunction(chain, k)) continue;
      addEdge(chain.slice(start, k + 1));
      start = k;
    }
  }
  const adjacency = nodes.map(() => [] as number[]);
  for (const e of edges) {
    adjacency[e.a]!.push(e.id);
    adjacency[e.b]!.push(e.id);
  }
  return { nodes, edges, adjacency };
}

export const otherEnd = (edge: GraphEdge, node: number) => (edge.a === node ? edge.b : edge.a);

/** Tracé d'une arête parcourue depuis `from`. */
export const edgePointsFrom = (edge: GraphEdge, from: number): Vec2[] =>
  edge.a === from ? edge.points : [...edge.points].reverse();

export interface ShortestPaths {
  dist: number[];
  /** Arête par laquelle on arrive à chaque nœud (-1 pour la source ou un nœud inaccessible). */
  via: number[];
}

/** Dijkstra depuis `source`, en évitant les nœuds `blocked`. */
export function dijkstra(graph: StreetGraph, source: number, blocked?: ReadonlySet<number>): ShortestPaths {
  const n = graph.nodes.length;
  const dist = new Array<number>(n).fill(Infinity);
  const via = new Array<number>(n).fill(-1);
  dist[source] = 0;
  const heap = new MinHeap();
  heap.push(source, 0);
  while (heap.size > 0) {
    const [u, d] = heap.pop();
    if (d > dist[u]!) continue;
    for (const eid of graph.adjacency[u]!) {
      const e = graph.edges[eid]!;
      const v = otherEnd(e, u);
      if (blocked?.has(v)) continue;
      const nd = d + e.length;
      if (nd < dist[v]!) {
        dist[v] = nd;
        via[v] = eid;
        heap.push(v, nd);
      }
    }
  }
  return { dist, via };
}

/** Chemin (nœuds et arêtes) de la source de `paths` jusqu'à `target`, ou null. */
export function pathTo(graph: StreetGraph, paths: ShortestPaths, target: number): { nodes: number[]; edges: number[] } | null {
  if (!Number.isFinite(paths.dist[target]!)) return null;
  const nodes = [target];
  const edges: number[] = [];
  let cur = target;
  while (paths.via[cur]! >= 0) {
    const eid = paths.via[cur]!;
    edges.push(eid);
    cur = otherEnd(graph.edges[eid]!, cur);
    nodes.push(cur);
  }
  return { nodes: nodes.reverse(), edges: edges.reverse() };
}

export interface Route {
  entry: number;
  nodes: number[];
  edges: number[];
  length: number;
}

/**
 * Itinéraires des virus : le plus court chemin depuis chaque entrée, puis des
 * itinéraires supplémentaires (sans repasser par un même carrefour) jusqu'à ce
 * que chaque tronçon (de `required`, par défaut tous) soit emprunté par au
 * moins un itinéraire. Un tronçon qu'aucun itinéraire simple ne peut
 * emprunter (impasse, boucle accrochée par un seul carrefour) est renvoyé
 * dans `uncovered`.
 */
export function coverRoutes(
  graph: StreetGraph,
  entryNodes: readonly number[],
  base: number,
  required: (edge: GraphEdge) => boolean = () => true,
): { routes: Route[]; uncovered: number[] } {
  const entries = [...new Set(entryNodes)].filter((e) => e !== base);
  const routes: Route[] = [];
  const covered = new Set<number>();
  const fromEntry = new Map(entries.map((e) => [e, dijkstra(graph, e)]));
  // Pour le début des itinéraires supplémentaires : ne pas passer par la base.
  const fromEntryAvoidingBase = new Map(entries.map((e) => [e, dijkstra(graph, e, new Set([base]))]));
  const entrySet = new Set(entries);
  const toBase = dijkstra(graph, base);
  const baseDistance = (e: GraphEdge) => Math.min(toBase.dist[e.a]!, toBase.dist[e.b]!);
  const lengthOf = (edges: number[]) => edges.reduce((s, id) => s + graph.edges[id]!.length, 0);
  const addRoute = (entry: number, nodes: number[], edges: number[]) => {
    routes.push({ entry, nodes, edges, length: lengthOf(edges) });
    for (const id of edges) covered.add(id);
  };

  for (const entry of entries) {
    const p = pathTo(graph, fromEntry.get(entry)!, base);
    if (p && p.edges.length > 0) addRoute(entry, p.nodes, p.edges);
  }

  const uncovered: number[] = [];
  // Les tronçons les plus éloignés de la base d'abord : leurs itinéraires en couvrent d'autres au passage.
  const order = [...graph.edges].sort((x, y) => baseDistance(y) - baseDistance(x) || x.id - y.id);
  for (const edge of order) {
    if (covered.has(edge.id) || !required(edge)) continue;
    let best: { entry: number; nodes: number[]; edges: number[]; length: number } | null = null;
    for (const entry of entries) {
      for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]] as const) {
        if (from === base) continue;
        const head = pathTo(graph, fromEntryAvoidingBase.get(entry)!, from);
        if (!head || head.nodes.includes(to)) continue;
        // Suite jusqu'à la base sans repasser par les carrefours déjà traversés.
        const tail = pathTo(graph, dijkstra(graph, to, new Set(head.nodes)), base);
        if (!tail) continue;
        const nodes = [...head.nodes, ...tail.nodes];
        const edges = [...head.edges, edge.id, ...tail.edges];
        const length = lengthOf(edges);
        if (!best || length < best.length) best = { entry, nodes, edges, length };
      }
    }
    // Le plus court accès peut couper la suite : on cherche alors un itinéraire exact (flot).
    best ??= routeThroughEdge(graph, edge, entrySet, base);
    if (best) addRoute(best.entry, best.nodes, best.edges);
    else uncovered.push(edge.id);
  }
  return { routes, uncovered: uncovered.filter((id) => !covered.has(id)) };
}

/**
 * Itinéraire simple entrée → base empruntant `edge`, s'il en existe un.
 * Calcul exact par flot maximal (nœuds de capacité 1) : deux chemins disjoints
 * partent des extrémités de l'arête, l'un vers une entrée, l'autre vers la
 * base. L'itinéraire trouvé n'est pas forcément le plus court.
 */
function routeThroughEdge(
  graph: StreetGraph,
  edge: GraphEdge,
  entries: ReadonlySet<number>,
  base: number,
): { entry: number; nodes: number[]; edges: number[]; length: number } | null {
  const n = graph.nodes.length;
  const IN = (id: number) => 2 * id;
  const OUT = (id: number) => 2 * id + 1;
  const ENTRY = 2 * n;
  const SINK = 2 * n + 1;
  const SOURCE = 2 * n + 2;
  const head = new Array<number>(2 * n + 3).fill(-1);
  const to: number[] = [];
  const cap: number[] = [];
  const next: number[] = [];
  const tag: number[] = [];
  const arc = (from: number, target: number, capacity: number, edgeId = -1) => {
    const k = to.length;
    to.push(target, from);
    cap.push(capacity, 0);
    tag.push(edgeId, -1);
    next.push(head[from]!, head[target]!);
    head[from] = k;
    head[target] = k + 1;
  };

  const ends = [edge.a, edge.b];
  for (const node of graph.nodes) {
    if (ends.includes(node.id)) continue;
    arc(IN(node.id), node.id === base ? SINK : OUT(node.id), 1);
  }
  for (const id of ends) {
    arc(SOURCE, OUT(id), 1);
    if (id === base) arc(OUT(id), SINK, 1);
  }
  for (const id of entries) arc(OUT(id), ENTRY, 1);
  arc(ENTRY, SINK, 1);
  for (const e of graph.edges) {
    if (e.id === edge.id) continue;
    if (!ends.includes(e.b) && e.a !== base) arc(OUT(e.a), IN(e.b), 1, e.id);
    if (!ends.includes(e.a) && e.b !== base) arc(OUT(e.b), IN(e.a), 1, e.id);
  }

  // Deux augmentations par parcours en largeur.
  for (let flow = 0; flow < 2; flow++) {
    const prev = new Array<number>(head.length).fill(-1);
    const queue = [SOURCE];
    for (let qi = 0; qi < queue.length && prev[SINK] === -1; qi++) {
      const x = queue[qi]!;
      for (let k = head[x]!; k >= 0; k = next[k]!) {
        const y = to[k]!;
        if (cap[k]! > 0 && y !== SOURCE && prev[y] === -1) {
          prev[y] = k;
          queue.push(y);
        }
      }
    }
    if (prev[SINK] === -1) return null;
    for (let y = SINK; y !== SOURCE; ) {
      const k = prev[y]!;
      cap[k]!--;
      cap[k ^ 1]!++;
      y = to[k ^ 1]!;
    }
  }

  // Lecture des deux chemins : on suit les arcs portant du flot.
  const walk = (start: number) => {
    const nodes = [start];
    const edges: number[] = [];
    let x = OUT(start);
    for (;;) {
      let k = head[x]!;
      while (k >= 0 && (k % 2 !== 0 || cap[k]! !== 0)) k = next[k]!;
      if (k < 0) return null;
      const y = to[k]!;
      if (y === SINK) return { nodes, edges, toEntry: false };
      if (y === ENTRY) return { nodes, edges, toEntry: true };
      if (y % 2 === 0) {
        edges.push(tag[k]!);
        nodes.push(y / 2);
      }
      x = y;
    }
  };
  const pa = walk(edge.a);
  const pb = walk(edge.b);
  if (!pa || !pb || pa.toEntry === pb.toEntry) return null;
  const [toEntry, toBase] = pa.toEntry ? [pa, pb] : [pb, pa];
  const nodes = [...[...toEntry.nodes].reverse(), ...toBase.nodes];
  const edges = [...[...toEntry.edges].reverse(), edge.id, ...toBase.edges];
  const length = edges.reduce((s, id) => s + graph.edges[id]!.length, 0);
  return { entry: nodes[0]!, nodes, edges, length };
}

/** Tracé complet d'un itinéraire. */
export function routePoints(graph: StreetGraph, route: Route): Vec2[] {
  const out: Vec2[] = [];
  route.edges.forEach((eid, i) => {
    const pts = edgePointsFrom(graph.edges[eid]!, route.nodes[i]!);
    out.push(...(i === 0 ? pts : pts.slice(1)));
  });
  return out;
}

/** Entrées : extrémités de rue (degré 1) situées au bord de la zone ou au-delà. */
export function findEntries(graph: StreetGraph, bounds: Bounds, margin: number): number[] {
  return graph.nodes
    .filter((n) => graph.adjacency[n.id]!.length === 1)
    .filter(
      (n) =>
        n.x <= bounds.minX + margin ||
        n.x >= bounds.maxX - margin ||
        n.y <= bounds.minY + margin ||
        n.y >= bounds.maxY - margin,
    )
    .map((n) => n.id);
}

/** Nœud le plus proche d'un point. */
export function nearestNode(graph: StreetGraph, p: Vec2): number {
  let best = 0;
  let bestDist = Infinity;
  for (const n of graph.nodes) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < bestDist) {
      best = n.id;
      bestDist = d;
    }
  }
  return best;
}

class MinHeap {
  private items: [number, number][] = [];

  get size(): number {
    return this.items.length;
  }

  push(value: number, priority: number): void {
    const items = this.items;
    items.push([value, priority]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]![1] <= items[i]![1]) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }

  pop(): [number, number] {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l]![1] < items[smallest]![1]) smallest = l;
        if (r < items.length && items[r]![1] < items[smallest]![1]) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i]!, items[smallest]!];
        i = smallest;
      }
    }
    return top;
  }
}
