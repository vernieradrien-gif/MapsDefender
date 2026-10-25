// Import d'une carte réelle depuis OpenStreetMap, enregistrée en JSON statique
// dans le dépôt (src/geo/maps/<id>.json).
//
//   npm run import-map                  # Villagexpo (Saint-Michel-sur-Orge)
//   npm run import-map -- --offline     # rejoue les dernières réponses (scripts/.cache)
//   npm run import-map -- --query "Place du Capitole, Toulouse" --id capitole --name "Capitole"
//
// Une requête Nominatim (géocodage) puis une requête Overpass, avec des
// miroirs de secours. Données © OpenStreetMap contributors (licence ODbL).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config';
import { validateMap } from '../src/game/mapValidation';
import { roundMap } from '../src/geo/mapBuilder';
import { overpassQuery, type OverpassResponse } from '../src/geo/osm';
import { buildOsmMap, queryBox, type OsmPlace } from '../src/geo/osmMap';

const USER_AGENT = 'StreetDefense/0.1 (+https://github.com/vernieradrien-gif/MapsDefender; import de carte)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function option(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const query = option('query', 'Villagexpo, Saint-Michel-sur-Orge');
const id = option('id', 'villagexpo');
const name = option('name', 'Villagexpo');
const offline = process.argv.includes('--offline');
const cacheDir = join(root, 'scripts', '.cache');
const outFile = join(root, 'src', 'geo', 'maps', `${id}.json`);

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

async function cached<T>(file: string, fetcher: () => Promise<T>): Promise<T> {
  const path = join(cacheDir, file);
  if (offline) return JSON.parse(await readFile(path, 'utf8')) as T;
  const data = await fetcher();
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path, JSON.stringify(data));
  return data;
}

async function geocode(): Promise<NominatimResult> {
  const url = `${NOMINATIM}?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr' } });
  if (!res.ok) throw new Error(`Nominatim : HTTP ${res.status}`);
  const results = (await res.json()) as NominatimResult[];
  if (results.length === 0) throw new Error(`Nominatim : adresse introuvable (« ${query} »)`);
  return results[0]!;
}

async function overpass(body: string): Promise<OverpassResponse> {
  const errors: string[] = [];
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: body }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as OverpassResponse;
    } catch (error) {
      errors.push(`${mirror} : ${error instanceof Error ? error.message : String(error)}`);
      console.warn(`Overpass indisponible (${mirror}), miroir suivant…`);
    }
  }
  throw new Error(`Overpass : aucun serveur n'a répondu\n${errors.join('\n')}`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const found = await cached(`${id}.nominatim.json`, geocode);
  const place: OsmPlace = { id, name, center: { lat: Number(found.lat), lon: Number(found.lon) } };
  console.log(`Lieu : ${found.display_name} (${place.center.lat}, ${place.center.lon})`);

  const request = overpassQuery(queryBox(place, config));
  const response = await cached(`${id}.overpass.json`, () => overpass(request));
  console.log(`Overpass : ${response.elements.length} éléments`);

  const { map: raw, report } = buildOsmMap(place, response, config);
  const map = roundMap(raw);
  const errors = validateMap(map, config.mapRules);

  console.log(`Base : ${report.baseName ?? 'bâtiment sans nom'}`);
  console.log(`Entrées : ${report.entries}, itinéraires : ${report.routes}`);
  console.log(`Longueur moyenne des itinéraires : ${report.averageRouteLength.toFixed(0)} m`);
  console.log(
    `Réseau : ${report.coveredEdges}/${report.totalEdges} tronçons empruntés ` +
      `(${(report.networkLength - report.uncoveredLength).toFixed(0)} m sur ${report.networkLength.toFixed(0)} m ; ` +
      `le reste : impasses impossibles à emprunter sans demi-tour)`,
  );
  console.log(`Emplacements : ${report.slots} (${report.roofSlots} toits, ${report.slots - report.roofSlots} socles)`);
  console.log(`Décor : ${map.buildings.length} bâtiments, ${map.streets.length} rues, ${map.areas.length} surfaces, ${map.trees.length} arbres`);
  if (errors.length > 0) {
    console.error(`Carte invalide :\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }

  const file = {
    meta: {
      query,
      displayName: found.display_name,
      center: place.center,
      osmTimestamp: (response as { osm3s?: { timestamp_osm_base?: string } }).osm3s?.timestamp_osm_base ?? null,
      averageRouteLength: Math.round(report.averageRouteLength),
      license: 'ODbL 1.0 — © OpenStreetMap contributors',
    },
    map,
  };
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(file)}\n`);
  console.log(`Carte enregistrée : ${outFile}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
