// Critère du jalon 4 : 20 adresses variées donnent un niveau jouable ou un
// message clair. Même chaîne que l'appli (Nominatim, Overpass avec miroirs,
// construction, agrandissement, carte imaginaire de secours).
//
//   npm run test-places                 # interroge les serveurs (quelques minutes)
//   npm run test-places -- --offline    # rejoue les réponses gardées (scripts/.cache/places)
//   npm run test-places -- --only 3     # une seule adresse (numéro dans la liste)
//
// Le script est plus patient que l'appli (90 s par serveur au lieu de 25) pour
// mesurer la génération même quand les serveurs publics sont lents ; si tous
// sont saturés, l'adresse est réessayée plus tard (jusqu'à 4 fois, 90 s
// d'écart). Les réponses déjà reçues sont gardées.
// Écrit le compte rendu dans docs/essai-adresses.md.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, type GameConfig } from '../src/config';
import { USER_AGENT, fetchHttp } from '../src/geo/http';
import { OsmClient, OsmError, type HttpClient } from '../src/geo/osmClient';
import { buildPlaceMap, generatePlaceMap } from '../src/geo/placeMap';

const ADDRESSES = [
  '10 rue de Rivoli, Paris',
  'Place Bellecour, Lyon',
  'Vieux-Port, Marseille',
  'Place du Capitole, Toulouse',
  'Grand Place, Lille',
  'Petite France, Strasbourg',
  'Rue Sainte-Catherine, Bordeaux',
  'Place de la Comédie, Montpellier',
  'Villagexpo, Saint-Michel-sur-Orge',
  '1 avenue du Général de Gaulle, Créteil',
  'La Défense, Puteaux',
  'Aéroport Paris-Charles de Gaulle',
  'Gordes',
  'Chamonix-Mont-Blanc',
  'La Cité, Carcassonne',
  'Mont-Saint-Michel',
  'Île de Sein',
  'Millevaches',
  'Grand-Place, Bruxelles',
  'zzqxw introuvable',
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'scripts', '.cache', 'places');
const offline = process.argv.includes('--offline');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg >= 0 ? Number(process.argv[onlyArg + 1]) : null;
const RETRIES = 4;
const RETRY_PAUSE_MS = 90_000;
const PATIENT_TIMEOUT_S = 90;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CachingHttp = HttpClient & { bytes: number };

/** Garde chaque réponse sur le disque ; --offline les rejoue sans réseau. */
function cachingHttp(inner: HttpClient): CachingHttp {
  const client = {
    bytes: 0,
    async getText(url: string, options: { signal: AbortSignal; timeoutMs: number }) {
      const file = join(cacheDir, `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.json`);
      let text: string;
      try {
        text = await readFile(file, 'utf8');
      } catch {
        if (offline) throw new Error('réponse absente du cache');
        text = await inner.getText(url, options);
        await mkdir(cacheDir, { recursive: true });
        await writeFile(file, text);
      }
      client.bytes += text.length;
      return text;
    },
  };
  return client;
}

interface Row {
  n: number;
  query: string;
  outcome: string;
  details: string;
  seconds: string;
}

async function tryAddress(n: number, query: string, config: GameConfig, http: CachingHttp, client: OsmClient): Promise<Row> {
  const signal = new AbortController().signal;
  http.bytes = 0;
  let downloadMs = 0;
  let buildMs = 0;
  try {
    const [target] = await client.search(query, signal);
    const { place, fallbackReason } = await generatePlaceMap(target!, config.places.defaultRadius, {
      config,
      signal,
      overpass: async (q, s) => {
        const t = performance.now();
        const text = await client.overpass(q, s);
        downloadMs += performance.now() - t;
        return text;
      },
      build: async (request) => {
        const t = performance.now();
        const result = buildPlaceMap(request, config);
        buildMs += performance.now() - t;
        return result;
      },
    });
    const info = place.info;
    const kb = Math.round(http.bytes / 1024);
    const seconds = `${(downloadMs / 1000).toFixed(1)} s de téléchargement (${kb} Ko), ${(buildMs / 1000).toFixed(1)} s de construction`;
    if (fallbackReason) {
      return { n, query, outcome: 'carte imaginaire + message', details: `${target!.name} : ${fallbackReason}`, seconds };
    }
    const address = target!.precise
      ? info.baseAtAddress
        ? ', base à l’adresse'
        : ', aucun bâtiment à l’adresse : base la plus imposante'
      : '';
    return {
      n,
      query,
      outcome: info.radius > info.requestedRadius ? `jouable (rayon ${info.radius} m)` : 'jouable',
      details:
        `${info.name}${info.detail ? ` (${info.detail})` : ''} : ${info.entries} entrées, ${info.routes} itinéraires de ` +
        `${info.averageRouteLength} m en moyenne, ${info.slots} emplacements${address}`,
      seconds,
    };
  } catch (error) {
    const code = error instanceof OsmError ? error.code : 'erreur';
    const message = error instanceof Error ? error.message : String(error);
    return { n, query, outcome: `message (${code})`, details: message, seconds: '' };
  }
}

async function report(rows: Row[], radius: number): Promise<void> {
  const playable = rows.filter((r) => r.outcome.startsWith('jouable')).length;
  const lines = [
    '# Essai sur 20 adresses (jalon 4)',
    '',
    `Généré par \`npm run test-places\` le ${new Date().toLocaleDateString('fr-FR')}, rayon ${radius} m.`,
    'Critère du cahier des charges : chaque adresse donne un niveau jouable ou un message clair.',
    '',
    `**Résultat : ${playable} cartes réelles jouables sur ${rows.length} adresses ; les autres donnent une carte imaginaire avec un message, ou un message clair.**`,
    '',
    '| # | Adresse | Résultat | Détails | Temps |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.n} | ${r.query} | ${r.outcome} | ${r.details.replace(/\|/g, '/')} | ${r.seconds} |`),
    '',
    'Données © OpenStreetMap contributors (licence ODbL).',
    '',
  ];
  await writeFile(join(root, 'docs', 'essai-adresses.md'), lines.join('\n'));
  console.log(`\n${playable}/${rows.length} jouables — compte rendu : docs/essai-adresses.md`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const http = cachingHttp(fetchHttp({ 'User-Agent': `${USER_AGENT} essai-adresses` }));
  const client = new OsmClient(http, { ...config.places, requestTimeout: PATIENT_TIMEOUT_S });
  const rows: Row[] = [];
  for (const [i, query] of ADDRESSES.entries()) {
    if (only !== null && only !== i + 1) continue;
    const t0 = performance.now();
    let row = await tryAddress(i + 1, query, config, http, client);
    for (let attempt = 1; attempt < RETRIES && !offline; attempt++) {
      if (row.outcome !== 'message (overpass)' && row.outcome !== 'message (network)') break;
      console.log(`${i + 1}. ${query} : serveurs saturés, nouvel essai dans ${RETRY_PAUSE_MS / 1000} s`);
      await pause(RETRY_PAUSE_MS);
      row = await tryAddress(i + 1, query, config, http, client);
    }
    rows.push(row);
    console.log(`${row.n}. ${query} → ${row.outcome} — ${row.details}${row.seconds ? ` — ${row.seconds}` : ''}`);
    console.log(`   (${((performance.now() - t0) / 1000).toFixed(1)} s au total)`);
  }
  if (only === null) await report(rows, config.places.defaultRadius);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
