import type { GameConfig, OsmRulesConfig } from '../config';
import { validateMap } from '../game/mapValidation';
import { distance } from '../game/path';
import { Rng } from '../game/rng';
import type { Area, Bounds, Building, EntryMarker, GameMap, MapPath, Street, Vec2 } from '../game/types';
import { generateTrees, type TreePlanting } from './city';
import { clipPolylineToRect, distanceToPolygon, interiorPoint, polygonArea, polylineToPolygonDistance } from './geometry';
import { buildStreetGraph, coverRoutes, routePoints, type GraphEdge, type StreetGraph } from './graph';
import { attachPoint, simplifyStreetGraph } from './simplify';
import { placeTowerSlots } from './slots';

// Assemblage d'une carte jouable à partir d'un quartier (rues, bâtiments,
// surfaces) : graphe des rues, base, entrées, itinéraires couvrant le réseau,
// emplacements de tourelles et arbres (§ 4 étapes 4 à 8 du cahier des charges).
// Sert pour les cartes OpenStreetMap et pour les quartiers générés.
//
// Le graphe couvre la zone de jeu et ses abords : deux rues de la zone
// reliées seulement par l'extérieur restent reliées, et les virus arrivent de
// l'extérieur de la carte, de tous les côtés, par les rues qui en sortent.

export interface MapSource {
  id: string;
  name: string;
  seed: number;
  /** Zone de jeu (carte affichée). */
  zone: Bounds;
  /** Rues dessinées (elles peuvent dépasser de la zone). */
  streets: Street[];
  /** Rues du réseau, abords compris (par défaut les rues dessinées). */
  network?: Street[];
  buildings: Building[];
  areas: Area[];
  /** Bâtiment à protéger ; à défaut, le plus imposant ou le plus central. */
  baseBuildingId?: number;
  /** Adresse précise : la base est le bâtiment à ce point (ou le plus proche, à moins de osm.addressMaxDistance). */
  baseAt?: Vec2;
  /** Centre du lieu, pour le choix de la base (par défaut le centre de la zone). */
  center?: Vec2;
  attribution?: string;
  /** Plante des arbres décoratifs (oui par défaut). */
  trees?: boolean;
}

export interface MapReport {
  routes: number;
  entries: number;
  /** Entrées par côté de la carte (N, S, E, O). */
  sides: Record<'N' | 'S' | 'E' | 'O', number>;
  averageRouteLength: number;
  /** Tronçons de la zone (après simplification) empruntés par au moins un itinéraire. */
  coveredEdges: number;
  totalEdges: number;
  /** Longueur des rues de la zone qu'aucun itinéraire ne peut emprunter (impasses…), en m. */
  uncoveredLength: number;
  networkLength: number;
  slots: number;
  roofSlots: number;
  baseName: string | null;
  /** La base est le bâtiment à l'adresse demandée. */
  baseAtAddress: boolean;
}

/** Zone agrandie d'une marge. */
export const expand = (b: Bounds, m: number): Bounds => ({
  minX: b.minX - m,
  minY: b.minY - m,
  maxX: b.maxX + m,
  maxY: b.maxY + m,
});

const inside = (p: Vec2, z: Bounds) => p.x > z.minX && p.x < z.maxX && p.y > z.minY && p.y < z.maxY;

/** Distance d'un point extérieur à la zone (0 dedans). */
function outsideDistance(p: Vec2, z: Bounds): number {
  const dx = Math.max(z.minX - p.x, 0, p.x - z.maxX);
  const dy = Math.max(z.minY - p.y, 0, p.y - z.maxY);
  return Math.hypot(dx, dy);
}

/** Le tronçon passe-t-il dans la zone ? */
const crossesZone = (e: GraphEdge, z: Bounds) => clipPolylineToRect(e.points, z).length > 0;

/**
 * Graphe simplifié des rues de la zone et de ses abords. Les nœuds hors de la
 * zone ne sont ni fusionnés ni supprimés : ils gardent les liaisons extérieures
 * et les rues d'entrée.
 */
export function networkGraph(streets: readonly Street[], zone: Bounds, rules: OsmRulesConfig): StreetGraph {
  const area = expand(zone, rules.graphMargin);
  const clipped = streets.flatMap((s) => clipPolylineToRect(s.points, area).map((points) => ({ points, width: s.width })));
  const core = expand(zone, -rules.entryMargin);
  return simplifyStreetGraph(buildStreetGraph(clipped, rules.graphTolerance), {
    mergeDistance: rules.mergeDistance,
    minDeadEnd: rules.minDeadEnd,
    tolerance: rules.simplifyTolerance,
    isProtected: (p) => !inside(p, core),
  });
}

/**
 * Base par défaut : le bâtiment le plus imposant ou le plus central
 * (emprise × hauteur, divisé selon l'éloignement du centre), proche d'une rue.
 */
export function chooseBaseBuilding(
  buildings: readonly Building[],
  graph: StreetGraph,
  zone: Bounds,
  center: Vec2,
  rules: OsmRulesConfig,
): Building | null {
  const mx = (zone.maxX - zone.minX) * 0.15;
  const my = (zone.maxY - zone.minY) * 0.15;
  const candidates = buildings
    .filter((b) => b.kind !== 'annex')
    .map((b) => {
      const p = interiorPoint(b.footprint);
      const d = distance(p, center);
      return { b, p, score: (polygonArea(b.footprint) * b.height) / (1 + (d / rules.baseProximity) ** 2) };
    })
    .filter(({ p }) => p.x > zone.minX + mx && p.x < zone.maxX - mx && p.y > zone.minY + my && p.y < zone.maxY - my)
    .sort((x, y) => y.score - x.score || x.b.id - y.b.id);
  for (const { b } of candidates) {
    const near = graph.edges.some(
      (e) => polylineToPolygonDistance(e.points, b.footprint) <= rules.baseMaxStreetDistance,
    );
    if (near) return b;
  }
  return null;
}

/**
 * Bâtiment à une adresse précise : celui qui contient le point, sinon le plus
 * proche à moins de `addressMaxDistance`, s'il est assez près d'une rue.
 */
export function buildingAt(
  buildings: readonly Building[],
  graph: StreetGraph,
  at: Vec2,
  rules: OsmRulesConfig,
): Building | null {
  const candidates = buildings
    .filter((b) => b.kind !== 'annex')
    .map((b) => ({ b, d: distanceToPolygon(at, b.footprint) }))
    .filter(({ d }) => d <= rules.addressMaxDistance)
    .sort((x, y) => x.d - y.d || x.b.id - y.b.id);
  for (const { b } of candidates) {
    if (graph.edges.some((e) => polylineToPolygonDistance(e.points, b.footprint) <= rules.baseMaxStreetDistance)) return b;
  }
  return null;
}

/**
 * Raccourcit le début d'un itinéraire : il commence `lead` mètres avant
 * d'entrer dans la zone. Renvoie aussi le point et la direction d'entrée.
 */
export function trimToZone(
  points: readonly Vec2[],
  zone: Bounds,
  lead: number,
): { points: Vec2[]; entry: EntryMarker } | null {
  let travelled = 0;
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push((travelled += distance(points[i - 1]!, points[i]!)));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const piece = clipPolylineToRect([a, b], zone)[0];
    if (!piece) continue;
    const at = piece[0]!;
    const len = distance(a, b) || 1;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const startAt = Math.max(0, cumulative[i - 1]! + distance(a, at) - lead);
    const out: Vec2[] = [];
    for (let k = 1; k < points.length; k++) {
      if (cumulative[k]! <= startAt) continue;
      if (out.length === 0) {
        const p = points[k - 1]!;
        const q = points[k]!;
        const t = (startAt - cumulative[k - 1]!) / (cumulative[k]! - cumulative[k - 1]! || 1);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
      out.push(points[k]!);
    }
    return { points: out, entry: { x: at.x, y: at.y, dirX: dir.x, dirY: dir.y } };
  }
  return null;
}

export function assembleMap(source: MapSource, config: GameConfig): { map: GameMap; report: MapReport } {
  const rules = config.osm;
  const zone = source.zone;
  let graph = networkGraph(source.network ?? source.streets, zone, rules);
  if (!graph.edges.some((e) => crossesZone(e, zone))) throw new Error('aucune rue dans la zone');

  const center = source.center ?? { x: (zone.minX + zone.maxX) / 2, y: (zone.minY + zone.maxY) / 2 };
  const atAddress = source.baseAt ? buildingAt(source.buildings, graph, source.baseAt, rules) : null;
  const baseBuilding =
    source.baseBuildingId !== undefined
      ? source.buildings.find((b) => b.id === source.baseBuildingId) ?? null
      : atAddress ?? chooseBaseBuilding(source.buildings, graph, zone, center, rules);
  const door = baseBuilding ? interiorPoint(baseBuilding.footprint) : center;
  const attached = attachPoint(graph, door);
  graph = attached.graph;
  const baseNode = attached.node;

  // Entrées : les rues qui sortent de la carte, loin de son bord (les virus viennent de l'extérieur).
  const entryNodes = graph.nodes
    .filter((n) => n.id !== baseNode && graph.adjacency[n.id]!.length === 1)
    .filter((n) => outsideDistance(n, zone) >= rules.entryLead / 2)
    .map((n) => n.id);
  const { routes, uncovered } = coverRoutes(graph, entryNodes, baseNode, (e) => crossesZone(e, zone));
  if (routes.length === 0) throw new Error('aucun itinéraire ne relie une entrée à la base');

  // Chaque itinéraire commence peu avant d'entrer dans la carte ; les itinéraires devenus identiques sont fusionnés.
  const paths: MapPath[] = [];
  const entries: EntryMarker[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    const trimmed = trimToZone(routePoints(graph, route), zone, rules.entryLead);
    if (!trimmed || trimmed.points.length < 2) continue;
    const key = trimmed.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push({ id: `r${paths.length + 1}`, points: trimmed.points });
    if (!entries.some((e) => distance(e, trimmed.entry) < 15)) entries.push(trimmed.entry);
  }
  const basePoint = { x: graph.nodes[baseNode]!.x, y: graph.nodes[baseNode]!.y };

  const slotBuildings = source.buildings.filter((b) => b.id !== baseBuilding?.id);
  const slots = placeTowerSlots(
    { paths, streets: source.streets, buildings: slotBuildings, areas: source.areas, bounds: zone, base: basePoint },
    config.mapRules,
  );

  const decor = expand(zone, rules.decorMargin);
  const hectares = ((decor.maxX - decor.minX) * (decor.maxY - decor.minY)) / 10000;
  const planting: TreePlanting = {
    sidewalk: 2.5,
    attempts: Math.round(rules.trees.density * hectares),
    attemptsIn: (area) =>
      Math.round(((area.kind === 'wood' ? rules.trees.woodDensity : rules.trees.parkDensity) * polygonArea(area.polygon)) / 10000),
    spacing: rules.trees.spacing,
    radius: rules.trees.radius,
    paletteCount: rules.trees.paletteCount,
  };
  const trees =
    source.trees === false
      ? []
      : generateTrees(source.streets, source.areas, source.buildings, slots, decor, planting, new Rng(source.seed));

  const map: GameMap = {
    id: source.id,
    name: source.name,
    seed: source.seed,
    bounds: { ...zone },
    paths,
    entries,
    slots,
    base: basePoint,
    baseBuildingId: baseBuilding?.id ?? null,
    streets: source.streets,
    buildings: source.buildings,
    areas: source.areas,
    trees,
    ...(source.attribution ? { attribution: source.attribution } : {}),
  };
  const zoneEdges = graph.edges.filter((e) => crossesZone(e, zone));
  const uncoveredSet = new Set(uncovered);
  const lengthOf = (pts: readonly Vec2[]) => pts.slice(1).reduce((s, p, i) => s + distance(pts[i]!, p), 0);
  const sides = { N: 0, S: 0, E: 0, O: 0 };
  for (const e of entries) {
    const d = { O: e.x - zone.minX, E: zone.maxX - e.x, N: e.y - zone.minY, S: zone.maxY - e.y };
    const side = (Object.keys(d) as (keyof typeof d)[]).sort((a, b) => d[a] - d[b])[0]!;
    sides[side]++;
  }
  const report: MapReport = {
    routes: paths.length,
    entries: entries.length,
    sides,
    averageRouteLength: paths.reduce((s, p) => s + lengthOf(p.points), 0) / Math.max(1, paths.length),
    coveredEdges: zoneEdges.length - zoneEdges.filter((e) => uncoveredSet.has(e.id)).length,
    totalEdges: zoneEdges.length,
    uncoveredLength: zoneEdges.filter((e) => uncoveredSet.has(e.id)).reduce((s, e) => s + e.length, 0),
    networkLength: zoneEdges.reduce((s, e) => s + e.length, 0),
    slots: slots.length,
    roofSlots: slots.filter((s) => s.kind === 'roof').length,
    baseName: baseBuilding?.name ?? null,
    baseAtAddress: atAddress !== null && atAddress === baseBuilding,
  };
  return { map, report };
}

/** Arrondit toutes les coordonnées (fichier JSON plus léger) ; les égalités sont conservées. */
export function roundMap(map: GameMap, decimals = 1): GameMap {
  const k = 10 ** decimals;
  const r = (v: number) => Math.round(v * k) / k;
  const v = (p: Vec2): Vec2 => ({ x: r(p.x), y: r(p.y) });
  return {
    ...map,
    bounds: { minX: r(map.bounds.minX), minY: r(map.bounds.minY), maxX: r(map.bounds.maxX), maxY: r(map.bounds.maxY) },
    paths: map.paths.map((p) => ({ id: p.id, points: dedupe(p.points.map(v)) })),
    entries: map.entries.map((e) => ({ x: r(e.x), y: r(e.y), dirX: Math.round(e.dirX * 1000) / 1000, dirY: Math.round(e.dirY * 1000) / 1000 })),
    slots: map.slots.map((s) => ({ ...s, x: r(s.x), y: r(s.y), elevation: r(s.elevation) })),
    base: v(map.base),
    streets: map.streets.map((s) => ({ width: s.width, points: dedupe(s.points.map(v)) })),
    buildings: map.buildings.map((b) => ({ ...b, footprint: b.footprint.map(v), height: r(b.height) })),
    areas: map.areas.map((a) => ({ kind: a.kind, polygon: a.polygon.map(v) })),
    trees: map.trees.map((t) => ({ ...t, x: r(t.x), y: r(t.y), radius: r(t.radius) })),
  };
}

const dedupe = (pts: Vec2[]) => pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y);

export interface MovedBase {
  map: GameMap;
  report: MapReport;
}

/**
 * Même carte, base déplacée sur un autre bâtiment (choix du joueur) :
 * itinéraires, emplacements et arbres refaits à partir des rues, bâtiments et
 * surfaces de la carte, sans réseau. Les rues connues s'arrêtant au bord du
 * décor, les entrées sont à ce bord. Renvoie null si ce bâtiment ne peut pas
 * être la base (abri, trop loin d'une rue) ou si la carte ne serait plus jouable.
 */
export function moveBase(map: GameMap, buildingId: number, config: GameConfig): MovedBase | null {
  const building = map.buildings.find((b) => b.id === buildingId);
  if (!building || building.kind === 'annex') return null;
  const nearStreet = map.streets.some(
    (s) => polylineToPolygonDistance(s.points, building.footprint) <= config.osm.baseMaxStreetDistance,
  );
  if (!nearStreet) return null;
  try {
    const { map: raw, report } = assembleMap(
      {
        id: map.id,
        name: map.name,
        seed: map.seed,
        zone: map.bounds,
        streets: map.streets,
        buildings: map.buildings,
        areas: map.areas,
        baseBuildingId: buildingId,
        trees: map.trees.length > 0,
        ...(map.attribution ? { attribution: map.attribution } : {}),
      },
      config,
    );
    const moved = roundMap(raw);
    return validateMap(moved, config.mapRules).length === 0 ? { map: moved, report } : null;
  } catch {
    return null;
  }
}
