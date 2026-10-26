import type { GameConfig } from '../config';
import { validateMap } from '../game/mapValidation';
import type { GameMap } from '../game/types';
import { roundMap, type MapReport } from './mapBuilder';
import { OsmError } from './osmClient';
import type { OverpassResponse } from './osm';
import { buildOsmMap, placeQuery, playZone, type OsmPlace } from './osmMap';
import {
  generatedMapId,
  placeKey,
  placeMapId,
  placeSeedKey,
  placeSeedOf,
  radiusSteps,
  type PlaceTarget,
} from './places';
import { generateDistrict, type DistrictKind } from './procedural';
import type { LatLon } from './projection';

// Génération d'une carte à partir d'un lieu (§ 4 du cahier des charges) :
// téléchargement Overpass, construction, vérification ; zone agrandie si le
// lieu manque de rues ou si les itinéraires sont trop courts ; enfin, carte
// imaginaire de secours avec un message.

/**
 * Version du générateur : une carte en cache construite par une version plus
 * ancienne est reconstruite quand on redemande le lieu (elle reste jouable d'ici là).
 */
export const PLACE_MAP_VERSION = 1;

/** Description d'une carte générée (cache, accueil, aperçu). */
export interface PlaceMapInfo {
  /** Version du générateur (PLACE_MAP_VERSION au moment de la construction). */
  version: number;
  /** Clé de cache (coordonnées arrondies + rayon, ou graine d'une carte imaginaire). */
  key: string;
  mapId: string;
  name: string;
  detail: string;
  center: LatLon | null;
  /** Rayon demandé et rayon finalement utilisé (zone agrandie). */
  requestedRadius: number;
  radius: number;
  /** Carte imaginaire (lieu sans assez de rues, ou hors connexion). */
  imaginary: boolean;
  createdAt: number;
  lastPlayed: number;
  averageRouteLength: number;
  routes: number;
  entries: number;
  slots: number;
  /** La base est le bâtiment à l'adresse demandée. */
  baseAtAddress: boolean;
  /** Date des données OpenStreetMap. */
  osmDate: string | null;
}

export interface PlaceMap {
  info: PlaceMapInfo;
  map: GameMap;
}

export type GenerationProgress =
  | { step: 'download'; radius: number; enlarged: boolean }
  | { step: 'build'; radius: number }
  | { step: 'fallback' };

export interface BuildRequest {
  place: OsmPlace;
  /** Réponse Overpass brute (texte JSON), lue par le constructeur. */
  responseText: string;
}

export type BuildResult =
  | { ok: true; map: GameMap; report: MapReport; problems: string[]; osmDate: string | null }
  | { ok: false; error: string };

/** Construit une carte (dans un worker de préférence, pour garder l'écran fluide). */
export type MapBuildFn = (request: BuildRequest) => Promise<BuildResult>;

/** Ce qui rend une carte injouable : validation et longueur moyenne des itinéraires. */
export function mapProblems(map: GameMap, report: MapReport, config: GameConfig): string[] {
  const problems = validateMap(map, config.mapRules);
  if (report.averageRouteLength < config.places.minAverageRouteLength) {
    problems.push(
      `itinéraires trop courts (${Math.round(report.averageRouteLength)} m < ${config.places.minAverageRouteLength} m)`,
    );
  }
  return problems;
}

/** Construction pure d'une carte à partir de la réponse Overpass. */
export function buildPlaceMap(request: BuildRequest, config: GameConfig): BuildResult {
  try {
    const response = JSON.parse(request.responseText) as OverpassResponse & { osm3s?: { timestamp_osm_base?: string } };
    const { map: raw, report } = buildOsmMap(request.place, response, config);
    const map = roundMap(raw);
    return { ok: true, map, report, problems: mapProblems(map, report, config), osmDate: response.osm3s?.timestamp_osm_base ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface GenerateDeps {
  config: GameConfig;
  /** Requête Overpass (texte JSON de la réponse). */
  overpass: (query: string, signal: AbortSignal) => Promise<string>;
  build: MapBuildFn;
  onProgress?: (progress: GenerationProgress) => void;
  signal: AbortSignal;
  now?: () => number;
}

export interface GenerationOutcome {
  place: PlaceMap;
  /** Pourquoi le lieu a été remplacé par une carte imaginaire (null sinon). */
  fallbackReason: string | null;
}

/**
 * Carte d'un lieu. Les erreurs réseau remontent (le joueur peut réessayer) ;
 * un lieu sans carte jouable, même agrandi, donne une carte imaginaire.
 */
export async function generatePlaceMap(target: PlaceTarget, radius: number, deps: GenerateDeps): Promise<GenerationOutcome> {
  const { config, signal } = deps;
  const now = deps.now ?? Date.now;
  const key = placeKey(target.center, radius);
  const problems: string[] = [];
  for (const r of radiusSteps(radius, config)) {
    if (signal.aborted) throw new OsmError('aborted', 'annulé');
    const place: OsmPlace = {
      id: placeMapId(key),
      name: target.name,
      center: target.center,
      radius: r,
      seedKey: placeSeedKey(target, radius),
      precise: target.precise,
    };
    deps.onProgress?.({ step: 'download', radius: r, enlarged: r > radius });
    const text = await deps.overpass(placeQuery(place, config), signal);
    if (signal.aborted) throw new OsmError('aborted', 'annulé');
    deps.onProgress?.({ step: 'build', radius: r });
    const result = await deps.build({ place, responseText: text });
    if (signal.aborted) throw new OsmError('aborted', 'annulé');
    if (result.ok && result.problems.length === 0) {
      const { map, report } = result;
      const info: PlaceMapInfo = {
        version: PLACE_MAP_VERSION,
        key,
        mapId: map.id,
        name: target.name,
        detail: target.detail,
        center: target.center,
        requestedRadius: radius,
        radius: r,
        imaginary: false,
        createdAt: now(),
        lastPlayed: 0,
        averageRouteLength: Math.round(report.averageRouteLength),
        routes: report.routes,
        entries: report.entries,
        slots: report.slots,
        baseAtAddress: report.baseAtAddress,
        osmDate: result.osmDate,
      };
      return { place: { info, map }, fallbackReason: null };
    }
    problems.push(`${r} m : ${result.ok ? result.problems.join(', ') : result.error}`);
  }
  deps.onProgress?.({ step: 'fallback' });
  const place = imaginaryMap(placeSeedOf(target, radius), radius, target.name, config, now());
  return { place: { ...place, info: { ...place.info, center: target.center } }, fallbackReason: problems.join(' ; ') };
}

const IMAGINARY_KINDS: DistrictKind[] = ['grille', 'diagonales', 'dense', 'grille'];

/** Quartier imaginaire jouable (secours, ou hors connexion), déterminé par la graine. */
export function imaginaryMap(seed: number, radius: number, name: string, config: GameConfig, now: number): PlaceMap {
  const zone = playZone(config, radius);
  const width = zone.maxX - zone.minX;
  const height = zone.maxY - zone.minY;
  for (let attempt = 0; attempt < config.places.fallbackAttempts; attempt++) {
    const s = (seed + attempt * 7919) >>> 0;
    const spec = { id: generatedMapId(seed), kind: IMAGINARY_KINDS[s % IMAGINARY_KINDS.length]!, entries: 2 + (s % 2), seed: s, width, height };
    try {
      const { map: raw, report } = generateDistrict(spec, config, { name, trees: true });
      const map = roundMap(raw);
      if (validateMap(map, config.mapRules).length > 0) continue;
      return {
        map,
        info: {
          version: PLACE_MAP_VERSION,
          key: map.id,
          mapId: map.id,
          name,
          detail: '',
          center: null,
          requestedRadius: radius,
          radius,
          imaginary: true,
          createdAt: now,
          lastPlayed: 0,
          averageRouteLength: Math.round(report.averageRouteLength),
          routes: report.routes,
          entries: report.entries,
          slots: report.slots,
          baseAtAddress: false,
          osmDate: null,
        },
      };
    } catch {
      // Graine suivante.
    }
  }
  throw new Error('aucun quartier imaginaire jouable');
}
