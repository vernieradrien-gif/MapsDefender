import type { GameConfig } from '../config';
import { hashString } from './buildings';
import type { LatLon } from './projection';

// Lieux choisis par le joueur (adresse géocodée par Nominatim ou position GPS) :
// libellés, clé de cache, graine. Fonctions pures.

/** Résultat Nominatim (format jsonv2, avec addressdetails). */
export interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
}

/** Lieu prêt à devenir une carte. */
export interface PlaceTarget {
  center: LatLon;
  /** Nom court (ex. « 12 Rue de la Paix », « Place du Capitole »). */
  name: string;
  /** Précision (code postal, commune). */
  detail: string;
  /** Adresse précise (avec numéro) : la base est le bâtiment à cette adresse. */
  precise: boolean;
  /** Recherche d'origine, normalisée (null pour une position GPS). */
  query: string | null;
  /**
   * Le joueur a donné un numéro qu'OpenStreetMap ne connaît pas : Nominatim a
   * renvoyé la rue seule. Le joueur pourra placer la base lui-même.
   */
  numberMissing?: boolean;
}

/** La recherche commence par un numéro de rue (« 12 », « 12 bis », « 12B »…). */
export const hasHouseNumber = (query: string) => /^\s*\d{1,4}\s*(bis|ter|quater|[a-z])?(?![\p{L}\d])/iu.test(query);

/** Recherche normalisée : minuscules, sans accents ni ponctuation, espaces simples. */
export function normalizeQuery(query: string): string {
  return query
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ROAD_KEYS = ['road', 'pedestrian', 'square', 'place', 'footway', 'residential'];
const LOCALITY_KEYS = ['village', 'town', 'city', 'municipality', 'hamlet', 'suburb', 'county'];

const firstOf = (address: Record<string, string>, keys: readonly string[]) =>
  keys.map((k) => address[k]).find((v): v is string => Boolean(v));

/** Lieu à partir d'un résultat Nominatim. */
export function placeFromNominatim(result: NominatimResult, query: string | null): PlaceTarget {
  const address = result.address ?? {};
  const number = address.house_number;
  const road = firstOf(address, ROAD_KEYS);
  const locality = firstOf(address, LOCALITY_KEYS);
  const parts = result.display_name.split(',').map((p) => p.trim()).filter(Boolean);
  const named = result.name && result.name !== road && result.name !== locality ? result.name : undefined;
  const name =
    named ?? (number && road ? `${number} ${road}` : undefined) ?? road ?? locality ?? parts[0] ?? result.display_name;
  const detail = [address.postcode, locality].filter(Boolean).join(' ') || parts.slice(1, 3).join(', ');
  return {
    center: { lat: Number(result.lat), lon: Number(result.lon) },
    name,
    detail: detail === name ? '' : detail,
    precise: Boolean(number),
    query: query === null ? null : normalizeQuery(query),
    ...(query !== null && !number && hasHouseNumber(query) ? { numberMissing: true } : {}),
  };
}

/** Distance approximative entre deux points (m). */
function metersBetween(a: LatLon, b: LatLon): number {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lon - b.lon) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
}

/**
 * Retire les doublons d'une recherche : même nom et même précision à moins de
 * `radius` mètres (la place, sa station de métro, ses rues…), on garde le premier.
 */
export function dedupePlaces(places: readonly PlaceTarget[], radius = 400): PlaceTarget[] {
  const kept: PlaceTarget[] = [];
  for (const p of places) {
    const twin = kept.some((k) => k.name === p.name && k.detail === p.detail && metersBetween(k.center, p.center) < radius);
    if (!twin) kept.push(p);
  }
  return kept;
}

/** Clé de cache : coordonnées arrondies (environ 10 m) et rayon. */
export function placeKey(center: LatLon, radius: number): string {
  return `${center.lat.toFixed(4)},${center.lon.toFixed(4)},${radius}`;
}

/** Identifiant de la carte d'un lieu (records, sauvegarde). */
export const placeMapId = (key: string) => `place:${key}`;

/** Identifiant d'une carte imaginaire de secours. */
export const generatedMapId = (seed: number) => `generated:${seed}`;

/** Graine dérivée de l'adresse normalisée (ou de la position) et du rayon : même adresse, même carte. */
export function placeSeedKey(target: PlaceTarget, radius: number): string {
  const where = target.query ?? `gps:${target.center.lat.toFixed(4)},${target.center.lon.toFixed(4)}`;
  return `${where}|${radius}`;
}

export const placeSeedOf = (target: PlaceTarget, radius: number) => hashString(placeSeedKey(target, radius));

/** Rayons à essayer : celui demandé, puis agrandi jusqu'au maximum (zone rurale, itinéraires trop courts). */
export function radiusSteps(radius: number, config: GameConfig): number[] {
  const steps = [radius];
  for (let r = radius + config.places.radiusStep; r <= config.places.maxRadius; r += config.places.radiusStep) steps.push(r);
  return steps;
}
