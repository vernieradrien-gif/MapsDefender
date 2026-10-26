import type { AreaKind, Vec2 } from '../game/types';
import type { LatLon, LocalProjection } from './projection';

// Données OpenStreetMap : requête Overpass (une seule par carte) et lecture
// de la réponse (format JSON, `out geom`) en éléments projetés en mètres.

/** Types de voies retenus (§ 4 du cahier des charges). */
export const STREET_TYPES = ['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street'] as const;

export interface OsmMember {
  type: string;
  ref: number;
  role: string;
  geometry?: (LatLon | null)[];
}

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  geometry?: (LatLon | null)[];
  members?: OsmMember[];
}

export interface OverpassResponse {
  elements: OsmElement[];
}

export interface GeoBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const bbox = (box: GeoBox) => [box.south, box.west, box.north, box.east].map((v) => v.toFixed(6)).join(',');

/**
 * Requête Overpass QL : rues d'une emprise, et bâtiments, espaces verts et eau
 * d'une emprise de décor (par défaut la même, souvent plus petite : réponse plus légère).
 */
export function overpassQuery(box: GeoBox, options: { timeout?: number; decorBox?: GeoBox } = {}): string {
  const r = bbox(box);
  const b = bbox(options.decorBox ?? box);
  const types = STREET_TYPES.join('|');
  return [
    `[out:json][timeout:${options.timeout ?? 25}];`,
    '(',
    `way["highway"~"^(${types})$"](${r});`,
    `way["building"](${b});`,
    `relation["building"](${b});`,
    `way["leisure"~"^(park|garden)$"](${b});`,
    `way["landuse"~"^(grass|forest)$"](${b});`,
    `way["natural"~"^(wood|water)$"](${b});`,
    `relation["leisure"~"^(park|garden)$"](${b});`,
    `relation["landuse"~"^(grass|forest)$"](${b});`,
    `relation["natural"~"^(wood|water)$"](${b});`,
    ');',
    'out geom qt;',
  ].join('');
}

export interface OsmStreet {
  id: number;
  highway: string;
  name?: string;
  points: Vec2[];
}

export interface OsmBuilding {
  id: number;
  tags: Record<string, string>;
  /** Contour extérieur, sans répéter le premier point. */
  ring: Vec2[];
}

export interface OsmArea {
  id: number;
  kind: AreaKind;
  ring: Vec2[];
}

export interface OsmFeatures {
  streets: OsmStreet[];
  buildings: OsmBuilding[];
  areas: OsmArea[];
}

/** Type de surface décorative correspondant aux étiquettes, ou null. */
export function areaKind(tags: Record<string, string>): AreaKind | null {
  if (tags.natural === 'water') return 'water';
  if (tags.landuse === 'forest' || tags.natural === 'wood') return 'wood';
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.landuse === 'grass') return 'park';
  return null;
}

/** Lit la réponse Overpass et projette tout en mètres. */
export function extractFeatures(response: OverpassResponse, projection: LocalProjection): OsmFeatures {
  const streets: OsmStreet[] = [];
  const buildings: OsmBuilding[] = [];
  const areas: OsmArea[] = [];
  const project = (geometry: readonly (LatLon | null)[] | undefined): Vec2[] =>
    (geometry ?? []).filter((g): g is LatLon => g !== null).map((g) => projection.toLocal(g));

  // Ordre stable : par type puis identifiant (même réponse = même carte).
  const elements = [...response.elements].sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id);
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (el.type === 'way') {
      const points = project(el.geometry);
      if (points.length < 2) continue;
      if (tags.highway && (STREET_TYPES as readonly string[]).includes(tags.highway)) {
        streets.push({ id: el.id, highway: tags.highway, ...(tags.name ? { name: tags.name } : {}), points });
        continue;
      }
      const ring = openRing(points);
      if (!ring) continue;
      if (tags.building) buildings.push({ id: el.id, tags, ring });
      else {
        const kind = areaKind(tags);
        if (kind) areas.push({ id: el.id, kind, ring });
      }
    } else if (el.type === 'relation') {
      const outer = (el.members ?? []).filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => project(m.geometry));
      const rings = stitchRings(outer);
      if (tags.building) {
        // Bâtiment en plusieurs morceaux : on garde le plus grand contour.
        const ring = [...rings].sort((a, b) => ringArea(b) - ringArea(a))[0];
        if (ring) buildings.push({ id: el.id, tags, ring });
      } else {
        const kind = areaKind(tags);
        if (kind) rings.forEach((ring) => areas.push({ id: el.id, kind, ring }));
      }
    }
  }
  return { streets, buildings, areas };
}

const samePoint = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < 0.01;

/** Contour fermé sans répéter le premier point, ou null si la voie n'est pas fermée. */
function openRing(points: Vec2[]): Vec2[] | null {
  if (points.length < 4 || !samePoint(points[0]!, points[points.length - 1]!)) return null;
  return points.slice(0, -1);
}

function ringArea(ring: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Recolle les morceaux de contour d'une relation (multipolygone) en anneaux fermés. */
export function stitchRings(parts: readonly Vec2[][]): Vec2[][] {
  const rings: Vec2[][] = [];
  const pool = parts.filter((p) => p.length >= 2).map((p) => [...p]);
  while (pool.length > 0) {
    let ring = pool.shift()!;
    let grown = true;
    while (!samePoint(ring[0]!, ring[ring.length - 1]!) && grown) {
      grown = false;
      const end = ring[ring.length - 1]!;
      for (let i = 0; i < pool.length; i++) {
        const part = pool[i]!;
        if (samePoint(part[0]!, end)) ring = [...ring, ...part.slice(1)];
        else if (samePoint(part[part.length - 1]!, end)) ring = [...ring, ...[...part].reverse().slice(1)];
        else continue;
        pool.splice(i, 1);
        grown = true;
        break;
      }
    }
    const open = openRing(ring);
    if (open) rings.push(open);
  }
  return rings;
}
