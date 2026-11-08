// Diagnostic des serveurs OpenStreetMap tels que les voit le jeu en ligne :
// un vrai navigateur (Chromium, profil Pixel 7) ouvre le site publié, puis
// appelle Nominatim et chaque serveur Overpass (GET et POST) depuis la page,
// avec les mêmes règles CORS que sur le téléphone. Les mêmes appels sont
// refaits hors navigateur pour voir le statut et les en-têtes bruts.
//
// Avec --local dist : parcours réel du jeu construit localement (servi à
// l'adresse du site publié, donc mêmes règles CORS) : Choisir un lieu,
// Chercher, premier résultat, jusqu'à l'aperçu de la carte.
//
//   npx tsx scripts/check-servers.ts [--site https://…/MapsDefender/] [--query "adresse"] [--local dist] [--no-probes]

import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium, devices, type Page } from 'playwright';
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
const localDir = process.argv.includes('--local') ? option('local', 'dist') : null;
const probesWanted = !process.argv.includes('--no-probes');
// Navigateur déjà installé ailleurs (CHROMIUM_PATH), sinon celui de Playwright.
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const TIMEOUT_MS = 60_000;

// Serveurs actuels du jeu et autres instances publiques connues.
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
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

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

/** Le build local répond à la place du site publié (même origine, mêmes règles CORS). */
async function serveLocal(page: Page, dir: string): Promise<void> {
  const base = new URL(site);
  await page.context().route(
    (url) => url.origin === base.origin && url.pathname.startsWith(base.pathname),
    async (route) => {
      const rel = new URL(route.request().url()).pathname.slice(base.pathname.length) || 'index.html';
      try {
        const body = await readFile(join(dir, rel));
        await route.fulfill({ status: 200, body, contentType: MIME[extname(rel)] ?? 'application/octet-stream' });
      } catch {
        await route.fulfill({ status: 404, body: '' });
      }
    },
  );
}

/** Parcours réel : Choisir un lieu → Chercher → premier résultat → aperçu (ou erreur). */
async function playFlow(dir: string, log: (text: string) => void): Promise<void> {
  log(`--- Parcours du jeu (build local ${dir}, servi comme ${site}) : « ${address} » ---`);
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ ...devices['Pixel 7'] });
  const overpassCalls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/interpreter')) overpassCalls.push(`${r.method()} ${new URL(r.url()).host}`);
  });
  page.on('requestfailed', (r) => {
    if (r.url().includes('/api/interpreter')) log(`  requête interrompue : ${new URL(r.url()).host} (${r.failure()?.errorText ?? '?'})`);
  });
  await serveLocal(page, dir);
  await page.goto(site);
  await page.getByRole('button', { name: 'Choisir un lieu' }).click();
  await page.getByRole('searchbox', { name: 'Adresse, rue ou lieu' }).fill(address);
  const start = Date.now();
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.locator('.place-result').first().waitFor({ timeout: 30_000 });
  log(`  recherche : ${Date.now() - start} ms · « ${short(await page.locator('.place-result').first().innerText())} »`);
  await page.locator('.place-result').first().click();
  const t0 = Date.now();
  let last = '';
  for (;;) {
    const state = await page.evaluate(() => ({
      preview: !!document.querySelector('.map-preview'),
      error: document.querySelector('.loading-error')?.textContent ?? null,
      step: [...document.querySelectorAll('.loading-step.active .step-label')].map((e) => e.textContent).join(' / '),
    }));
    if (state.step && state.step !== last) {
      last = state.step;
      log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s : ${state.step}`);
    }
    if (state.preview) {
      const stats = await page.locator('.preview-stats').innerText();
      log(`OK  | carte créée en ${((Date.now() - t0) / 1000).toFixed(1)} s · ${short(stats)}`);
      break;
    }
    if (state.error) {
      log(`ÉCHEC | erreur après ${((Date.now() - t0) / 1000).toFixed(1)} s : ${short(state.error)}`);
      break;
    }
    if (Date.now() - t0 > 360_000) {
      log('ÉCHEC | toujours en chargement après 6 min');
      break;
    }
    await page.waitForTimeout(500);
  }
  log(`  requêtes Overpass : ${overpassCalls.join(', ') || 'aucune'}`);
  await browser.close();
}

async function main(): Promise<void> {
  const config = loadConfig();
  const lines: string[] = [];
  const log = (text: string) => {
    console.log(text);
    lines.push(text);
  };

  if (localDir) await playFlow(localDir, log);
  if (!probesWanted) return writeSummary(lines);

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
  const browser = await chromium.launch(launchOptions);
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

  await writeSummary(lines);
}

/** Résumé de l'exécution GitHub Actions. */
async function writeSummary(lines: string[]): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const { appendFile } = await import('node:fs/promises');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
