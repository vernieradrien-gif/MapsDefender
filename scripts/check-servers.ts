// Diagnostic des serveurs OpenStreetMap tels que les voit le jeu en ligne :
// un vrai navigateur (Chromium, profil Pixel 7) ouvre le site publié, puis
// appelle Nominatim et chaque serveur Overpass (GET et POST) depuis la page,
// avec les mêmes règles CORS que sur le téléphone. Les mêmes appels sont
// refaits hors navigateur pour voir le statut et les en-têtes bruts.
//
//   npx tsx scripts/check-servers.ts [--site https://…/MapsDefender/] [--query "adresse"]

import { chromium, devices } from 'playwright';
import { loadConfig } from '../src/config';
import { NOMINATIM_URL } from '../src/geo/osmClient';
import { placeQuery, type OsmPlace } from '../src/geo/osmMap';

function option(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const site = option('site', 'https://vernieradrien-gif.github.io/MapsDefender/');
const address = option('query', 'Villagexpo, Saint-Michel-sur-Orge');
const origin = new URL(site).origin;
const TIMEOUT_MS = 25_000;

// Serveurs actuels du jeu et autres instances publiques connues.
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

interface Probe {
  label: string;
  url: string;
  method: 'GET' | 'POST';
  body?: string;
}

interface Outcome {
  ok: boolean;
  status: number;
  ms: number;
  bytes: number;
  detail: string;
}

const short = (text: string) => text.replace(/\s+/g, ' ').slice(0, 160);

/** Appel hors navigateur : statut, en-tête CORS et début de la réponse. */
async function direct(probe: Probe): Promise<Outcome> {
  const start = Date.now();
  try {
    const res = await fetch(probe.url, {
      method: probe.method,
      headers: {
        Origin: origin,
        Referer: site,
        'User-Agent': devices['Pixel 7']!.userAgent,
        ...(probe.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: probe.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    const acao = res.headers.get('access-control-allow-origin');
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - start,
      bytes: text.length,
      detail: `CORS=${acao ?? 'absent'} type=${res.headers.get('content-type') ?? '?'}${res.ok ? '' : ` « ${short(text)} »`}`,
    };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - start, bytes: 0, detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

function line(where: string, probe: Probe, o: Outcome): string {
  const verdict = o.ok ? 'OK ' : 'ÉCHEC';
  return `${verdict} | ${where} | ${probe.method} ${probe.label} | HTTP ${o.status} | ${o.ms} ms | ${o.bytes} o | ${o.detail}`;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const lines: string[] = [];
  const log = (text: string) => {
    console.log(text);
    lines.push(text);
  };

  const search = `${NOMINATIM_URL}/search?${new URLSearchParams({ q: address, format: 'jsonv2', limit: '1', addressdetails: '1', 'accept-language': 'fr' })}`;
  const found = (await (await fetch(search, { headers: { 'User-Agent': 'StreetDefense diagnostic' } })).json()) as { lat: string; lon: string }[];
  const center = found[0] ? { lat: Number(found[0].lat), lon: Number(found[0].lon) } : { lat: 48.6304, lon: 2.3094 };
  const place: OsmPlace = { id: 'diagnostic', name: address, center, radius: config.places.defaultRadius };
  const query = placeQuery(place, config);
  log(`Site : ${site} · lieu : ${address} (${center.lat}, ${center.lon}) · requête ${query.length} caractères`);

  const probes: Probe[] = [{ label: 'nominatim', url: search, method: 'GET' }];
  for (const server of SERVERS) {
    const label = new URL(server).host;
    probes.push({ label, url: `${server}?data=${encodeURIComponent(query)}`, method: 'GET' });
    probes.push({ label, url: server, method: 'POST', body: new URLSearchParams({ data: query }).toString() });
  }

  // Un serveur après l'autre pour un même hôte, les hôtes en parallèle.
  const byHost = (list: Probe[]) => {
    const groups = new Map<string, Probe[]>();
    for (const p of list) groups.set(p.label, [...(groups.get(p.label) ?? []), p]);
    return [...groups.values()];
  };
  const run = async (run1: (p: Probe) => Promise<Outcome>, where: string) => {
    await Promise.all(
      byHost(probes).map(async (group) => {
        for (const probe of group) log(line(where, probe, await run1(probe)));
      }),
    );
  };

  log('--- Hors navigateur (statut brut, en-tête CORS renvoyé) ---');
  await run(direct, 'node');

  log('--- Navigateur Pixel 7 sur le site publié (règles CORS réelles) ---');
  const browser = await chromium.launch();
  const page = await browser.newPage({ ...devices['Pixel 7'] });
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(short(msg.text()));
  });
  const response = await page.goto(site, { waitUntil: 'load' });
  log(`Page : HTTP ${response?.status() ?? '?'} · titre « ${await page.title()} »`);
  const inPage = (probe: Probe) =>
    page.evaluate(async ({ p, timeout }: { p: Probe; timeout: number }): Promise<Outcome> => {
      const start = Date.now();
      try {
        const res = await fetch(p.url, {
          method: p.method,
          body: p.body,
          headers: p.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
          signal: AbortSignal.timeout(timeout),
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, ms: Date.now() - start, bytes: text.length, detail: res.ok ? '' : text.replace(/\s+/g, ' ').slice(0, 160) };
      } catch (error) {
        return { ok: false, status: 0, ms: Date.now() - start, bytes: 0, detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
      }
    }, { p: probe, timeout: TIMEOUT_MS });
  await run(inPage, 'navigateur');
  if (consoleErrors.length) log(`Erreurs de la console : ${consoleErrors.join(' ‖ ')}`);
  await browser.close();

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
