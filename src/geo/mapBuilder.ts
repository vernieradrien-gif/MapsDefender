import type { GameConfig, OsmRulesConfig } from '../config';
import { distance } from '../game/path';
import { Rng } from '../game/rng';
import type { Area, Bounds, Building, EntryMarker, GameMap, MapPath, Street, Vec2 } from '../game/types';
import { generateTrees, type TreePlanting } from './city';
import { clipPolylineToRect, interiorPoint, polygonArea, polylineToPolygonDistance } from './geometry';
import { buildStreetGraph, coverRoutes, findEntries, routePoints, type StreetGraph } from './graph';
import { attachPoint, simplifyStreetGraph } from './simplify';
import { placeTowerSlots } from './slots';

// Assemblage d'une carte jouable à partir d'un quartier (rues, bâtiments,
// surfaces) : graphe des rues, base, entrées, itinéraires couvrant le réseau,
// emplacements de tourelles et arbres (§ 4 étapes 4 à 8 du cahier des charges).
// Sert pour les cartes OpenStreetMap et pour les quartiers générés.

export interface MapSource {
  id: string;
  name: string;
  seed: number;
  /** Zone de jeu : les rues qui en sortent sont les entrées des virus. */
  zone: Bounds;
  /** Rues dessinées (elles peuvent dépasser de la zone). */
  streets: Street[];
  buildings: Building[];
  areas: Area[];
  /** Bâtiment à protéger ; à défaut, le plus imposant ou le plus central. */
  baseBuildingId?: number;
  /** Centre du lieu, pour le choix de la base (par défaut le centre de la zone). */
  center?: Vec2;
  attribution?: string;
  /** Plante des arbres décoratifs (oui par défaut). */
  trees?: boolean;
}

export interface MapReport {
  routes: number;
  entries: number;
  averageRouteLength: number;
  /** Tronçons du réseau (après simplification) empruntés par au moins un itinéraire. */
  coveredEdges: number;
  totalEdges: number;
  /** Longueur des rues du réseau qu'aucun itinéraire ne peut emprunter (impasses…), en m. */
  uncoveredLength: number;
  networkLength: number;
  slots: number;
  roofSlots: number;
  baseName: string | null;
}

/** Zone agrandie d'une marge. */
export const expand = (b: Bounds, m: number): Bounds => ({
  minX: b.minX - m,
  minY: b.minY - m,
  maxX: b.maxX + m,
  maxY: b.maxY + m,
});

/** Graphe simplifié des rues de la zone (les extrémités au bord sont protégées : ce sont les entrées). */
export function zoneGraph(streets: readonly Street[], zone: Bounds, rules: OsmRulesConfig): StreetGraph {
  const inside = streets.flatMap((s) => clipPolylineToRect(s.points, zone).map((points) => ({ points, width: s.width })));
  const onBorder = (p: Vec2) =>
    Math.min(p.x - zone.minX, zone.maxX - p.x, p.y - zone.minY, zone.maxY - p.y) <= rules.entryMargin;
  return simplifyStreetGraph(buildStreetGraph(inside, rules.graphTolerance), {
    mergeDistance: rules.mergeDistance,
    minDeadEnd: rules.minDeadEnd,
    tolerance: rules.simplifyTolerance,
    isProtected: onBorder,
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

export function assembleMap(source: MapSource, config: GameConfig): { map: GameMap; report: MapReport } {
  const rules = config.osm;
  const zone = source.zone;
  let graph = zoneGraph(source.streets, zone, rules);
  if (graph.edges.length === 0) throw new Error('aucune rue dans la zone');

  const center = source.center ?? { x: (zone.minX + zone.maxX) / 2, y: (zone.minY + zone.maxY) / 2 };
  const baseBuilding =
    source.baseBuildingId !== undefined
      ? source.buildings.find((b) => b.id === source.baseBuildingId) ?? null
      : chooseBaseBuilding(source.buildings, graph, zone, center, rules);
  const door = baseBuilding ? interiorPoint(baseBuilding.footprint) : center;
  const attached = attachPoint(graph, door);
  graph = attached.graph;
  const baseNode = attached.node;

  const entryNodes = findEntries(graph, zone, rules.entryMargin).filter((n) => n !== baseNode);
  const { routes, uncovered } = coverRoutes(graph, entryNodes, baseNode);
  if (routes.length === 0) throw new Error('aucun itinéraire ne relie une entrée à la base');

  const paths: MapPath[] = routes.map((r, i) => ({ id: `r${i + 1}`, points: routePoints(graph, r) }));
  const entries: EntryMarker[] = [];
  const seenEntries = new Set<number>();
  routes.forEach((r, i) => {
    if (seenEntries.has(r.entry)) return;
    seenEntries.add(r.entry);
    const [a, b] = paths[i]!.points as [Vec2, Vec2];
    const len = distance(a, b) || 1;
    entries.push({ x: a.x, y: a.y, dirX: (b.x - a.x) / len, dirY: (b.y - a.y) / len });
  });
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
  const uncoveredSet = new Set(uncovered);
  const report: MapReport = {
    routes: routes.length,
    entries: entries.length,
    averageRouteLength: routes.reduce((s, r) => s + r.length, 0) / routes.length,
    coveredEdges: graph.edges.length - uncovered.length,
    totalEdges: graph.edges.length,
    uncoveredLength: graph.edges.filter((e) => uncoveredSet.has(e.id)).reduce((s, e) => s + e.length, 0),
    networkLength: graph.edges.reduce((s, e) => s + e.length, 0),
    slots: slots.length,
    roofSlots: slots.filter((s) => s.kind === 'roof').length,
    baseName: baseBuilding?.name ?? null,
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
    entries: map.entries.map((e) => ({ x: r(e.x), y: r(e.y), dirX: r(e.dirX * 100) / 100, dirY: r(e.dirY * 100) / 100 })),
    slots: map.slots.map((s) => ({ ...s, x: r(s.x), y: r(s.y), elevation: r(s.elevation) })),
    base: v(map.base),
    streets: map.streets.map((s) => ({ width: s.width, points: dedupe(s.points.map(v)) })),
    buildings: map.buildings.map((b) => ({ ...b, footprint: b.footprint.map(v), height: r(b.height) })),
    areas: map.areas.map((a) => ({ kind: a.kind, polygon: a.polygon.map(v) })),
    trees: map.trees.map((t) => ({ ...t, x: r(t.x), y: r(t.y), radius: r(t.radius) })),
  };
}

const dedupe = (pts: Vec2[]) => pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y);
