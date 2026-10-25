import { distanceToSegment } from '../game/path';
import type { Vec2 } from '../game/types';
import { douglasPeucker } from './geometry';
import type { StreetGraph } from './graph';

// Simplification du graphe des rues (§ 4 étape 5 du cahier des charges) :
// plus grande composante connexe, fusion des carrefours très proches,
// suppression des impasses courtes, tracés simplifiés (Douglas-Peucker).

export interface SimplifyOptions {
  /** Deux carrefours reliés par un tronçon plus court sont fusionnés (m). */
  mergeDistance: number;
  /** Les impasses plus courtes sont supprimées (m). */
  minDeadEnd: number;
  /** Tolérance de Douglas-Peucker (m). */
  tolerance: number;
  /** Nœuds à ne jamais déplacer ni supprimer (entrées au bord de la zone). */
  isProtected?: (p: Vec2) => boolean;
}

interface WorkEdge {
  a: number;
  b: number;
  points: Vec2[];
}

/** Graphe modifiable : les éléments supprimés valent null. */
interface Work {
  nodes: (Vec2 | null)[];
  edges: (WorkEdge | null)[];
}

const lengthOf = (pts: readonly Vec2[]) => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return total;
};

function toWork(graph: StreetGraph): Work {
  return {
    nodes: graph.nodes.map((n) => ({ x: n.x, y: n.y })),
    edges: graph.edges.map((e) => ({ a: e.a, b: e.b, points: e.points.map((p) => ({ x: p.x, y: p.y })) })),
  };
}

/** Reconstruit un graphe propre (identifiants consécutifs, longueurs, adjacence). */
function fromWork(work: Work): StreetGraph {
  const used = new Set<number>();
  for (const e of work.edges) {
    if (!e) continue;
    used.add(e.a);
    used.add(e.b);
  }
  const ids = new Map<number, number>();
  const nodes = [...used]
    .sort((x, y) => x - y)
    .map((old, id) => {
      ids.set(old, id);
      const p = work.nodes[old]!;
      return { id, x: p.x, y: p.y };
    });
  const edges = work.edges
    .filter((e): e is WorkEdge => e !== null)
    .map((e, id) => ({ id, a: ids.get(e.a)!, b: ids.get(e.b)!, points: e.points, length: lengthOf(e.points) }));
  const adjacency = nodes.map(() => [] as number[]);
  for (const e of edges) {
    adjacency[e.a]!.push(e.id);
    adjacency[e.b]!.push(e.id);
  }
  return { nodes, edges, adjacency };
}

function incidence(work: Work): number[][] {
  const inc = work.nodes.map(() => [] as number[]);
  work.edges.forEach((e, id) => {
    if (!e) return;
    inc[e.a]!.push(id);
    if (e.b !== e.a) inc[e.b]!.push(id);
  });
  return inc;
}

/** Garde la composante connexe la plus longue (somme des tronçons). */
export function largestComponent(graph: StreetGraph): StreetGraph {
  const component = new Array<number>(graph.nodes.length).fill(-1);
  const totals: number[] = [];
  for (const start of graph.nodes) {
    if (component[start.id] !== -1) continue;
    const c = totals.length;
    totals.push(0);
    component[start.id] = c;
    const stack = [start.id];
    while (stack.length > 0) {
      const u = stack.pop()!;
      for (const eid of graph.adjacency[u]!) {
        const e = graph.edges[eid]!;
        const v = e.a === u ? e.b : e.a;
        if (component[v] === -1) {
          component[v] = c;
          stack.push(v);
        }
      }
    }
  }
  for (const e of graph.edges) totals[component[e.a]!]! += e.length;
  let best = 0;
  totals.forEach((t, i) => {
    if (t > totals[best]!) best = i;
  });
  const work = toWork(graph);
  work.edges = work.edges.map((e) => (e && component[e.a] === best ? e : null));
  return fromWork(work);
}

/** Simplifie le graphe : voir `SimplifyOptions`. Les tracés restent continus. */
export function simplifyStreetGraph(graph: StreetGraph, options: SimplifyOptions): StreetGraph {
  const work = toWork(largestComponent(graph));
  const protectedNode = (id: number) => options.isProtected?.(work.nodes[id]!) ?? false;

  for (let pass = 0; pass < 50; pass++) {
    const changed = dissolveDegreeTwo(work, protectedNode) + removeDeadEnds(work, options.minDeadEnd, protectedNode) +
      mergeShortEdges(work, options.mergeDistance, protectedNode);
    if (changed === 0) break;
  }
  for (const e of work.edges) if (e) e.points = douglasPeucker(e.points, options.tolerance);
  return fromWork(work);
}

/** Les nœuds de degré 2 (simple point de passage) disparaissent : leurs deux tronçons n'en font qu'un. */
function dissolveDegreeTwo(work: Work, isProtected: (id: number) => boolean): number {
  let count = 0;
  let inc = incidence(work);
  for (let n = 0; n < work.nodes.length; n++) {
    const list = inc[n]!;
    if (work.nodes[n] === null || list.length !== 2 || isProtected(n)) continue;
    const e1 = work.edges[list[0]!]!;
    const e2 = work.edges[list[1]!]!;
    if (e1.a === e1.b || e2.a === e2.b) continue;
    const x = e1.a === n ? e1.b : e1.a;
    const y = e2.a === n ? e2.b : e2.a;
    if (x === y) continue; // éviterait une boucle
    const p1 = e1.b === n ? e1.points : [...e1.points].reverse();
    const p2 = e2.a === n ? e2.points : [...e2.points].reverse();
    work.edges[list[0]!] = { a: x, b: y, points: [...p1, ...p2.slice(1)] };
    work.edges[list[1]!] = null;
    work.nodes[n] = null;
    inc = incidence(work);
    count++;
  }
  return count;
}

function removeDeadEnds(work: Work, minLength: number, isProtected: (id: number) => boolean): number {
  let count = 0;
  let inc = incidence(work);
  for (let n = 0; n < work.nodes.length; n++) {
    const list = inc[n]!;
    if (work.nodes[n] === null || list.length !== 1 || isProtected(n)) continue;
    const e = work.edges[list[0]!]!;
    if (lengthOf(e.points) >= minLength) continue;
    const other = e.a === n ? e.b : e.a;
    // Ne supprime pas un tronçon isolé (deux extrémités libres) : il disparaîtrait entièrement.
    if (inc[other]!.length <= 1) continue;
    work.edges[list[0]!] = null;
    work.nodes[n] = null;
    inc = incidence(work);
    count++;
  }
  return count;
}

function mergeShortEdges(work: Work, maxLength: number, isProtected: (id: number) => boolean): number {
  let count = 0;
  for (let id = 0; id < work.edges.length; id++) {
    const e = work.edges[id];
    if (!e || e.a === e.b || isProtected(e.a) || isProtected(e.b)) continue;
    if (lengthOf(e.points) >= maxLength) continue;
    const pa = work.nodes[e.a]!;
    const pb = work.nodes[e.b]!;
    const merged = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const keep = e.a;
    const drop = e.b;
    work.edges[id] = null;
    work.nodes[keep] = merged;
    work.nodes[drop] = null;
    for (let j = 0; j < work.edges.length; j++) {
      const f = work.edges[j];
      if (!f) continue;
      if (f.a === drop) f.a = keep;
      if (f.b === drop) f.b = keep;
      if (f.a === keep) f.points[0] = { ...merged };
      if (f.b === keep) f.points[f.points.length - 1] = { ...merged };
      // Une boucle sur un seul carrefour ne peut pas être empruntée : on l'enlève.
      if (f.a === f.b) work.edges[j] = null;
    }
    count++;
  }
  return count;
}

/**
 * Raccorde un point au graphe : renvoie le nœud le plus proche s'il est à
 * moins de `snap` mètres du point de la rue le plus proche, sinon coupe le
 * tronçon le plus proche à cet endroit pour y créer un nœud.
 */
export function attachPoint(graph: StreetGraph, p: Vec2, snap = 3): { graph: StreetGraph; node: number } {
  let best = { edge: -1, segment: 0, dist: Infinity, q: { x: 0, y: 0 } };
  for (const e of graph.edges) {
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1]!;
      const b = e.points[i]!;
      const d = distanceToSegment(p, a, b);
      if (d >= best.dist) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0), 1);
      best = { edge: e.id, segment: i, dist: d, q: { x: a.x + dx * t, y: a.y + dy * t } };
    }
  }
  if (best.edge < 0) throw new Error('graphe vide');
  const edge = graph.edges[best.edge]!;
  for (const id of [edge.a, edge.b]) {
    const n = graph.nodes[id]!;
    if (Math.hypot(n.x - best.q.x, n.y - best.q.y) <= snap) return { graph, node: id };
  }
  const work = toWork(graph);
  const node = work.nodes.length;
  work.nodes.push(best.q);
  const pts = edge.points;
  work.edges[edge.id] = { a: edge.a, b: node, points: [...pts.slice(0, best.segment), { ...best.q }] };
  work.edges.push({ a: node, b: edge.b, points: [{ ...best.q }, ...pts.slice(best.segment)] });
  const rebuilt = fromWork(work);
  // fromWork renumérote les nœuds : on retrouve le nouveau par sa position.
  const id = rebuilt.nodes.findIndex((n) => n.x === best.q.x && n.y === best.q.y);
  return { graph: rebuilt, node: id };
}
