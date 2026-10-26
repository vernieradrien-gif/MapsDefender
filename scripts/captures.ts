// Captures d'écran automatiques (Playwright, viewport Pixel 7) et mesure de
// fluidité avec 150 virus. Construit le site, le sert localement, joue les
// scènes demandées et enregistre les images dans docs/captures/.
//
//   npm run captures

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, type Page } from 'playwright';
import { preview } from 'vite';
import type { DebugHooks } from '../src/app';
import { loadConfig } from '../src/config';
import { NOMINATIM_URL, OVERPASS_MIRRORS } from '../src/geo/osmClient';
import { placeQuery } from '../src/geo/osmMap';
import { dedupePlaces, placeFromNominatim, placeKey, placeMapId, type NominatimResult } from '../src/geo/places';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'captures');
const PORT = 4174;
const base = `http://localhost:${PORT}/`;

interface HookWindow {
  streetDefense: DebugHooks;
}

/** Appelle une commande de test dans la page (mode ?debug). */
async function hook<T>(page: Page, fn: (h: DebugHooks) => T): Promise<T> {
  return page.evaluate(`(${fn.toString()})(window.streetDefense)`) as Promise<T>;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(outDir, `${name}.jpg`), type: 'jpeg', quality: 78 });
  console.log(`  ✓ ${name}.jpg`);
}

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${base}${query}`);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForTimeout(400);
}

async function tap(page: Page, x: number, y: number): Promise<void> {
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(350);
}

/** Joue vite (le joueur automatique construit) jusqu'à la condition, ou la fin de partie. */
async function playUntil(page: Page, until: string, options: { maxSteps?: number; early?: boolean } = {}): Promise<void> {
  const { maxSteps = 400, early = true } = options;
  for (let i = 0; i < maxSteps; i++) {
    const done = (await page.evaluate(`(() => { const h = window.streetDefense; const g = h.game(); return g.isOver || (${until}); })()`)) as boolean;
    if (done) return;
    // early : on appelle les vagues en avance pour aller vite (elles se chevauchent alors).
    await page.evaluate(`(() => { const h = window.streetDefense; h.autoBuild(); ${early ? 'h.callNextWave();' : ''} h.fastForward(2); })()`);
  }
}

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 16);
const placesCache = join(root, 'scripts', '.cache', 'places');

async function cachedResponse(url: string): Promise<string | null> {
  try {
    return await readFile(join(placesCache, `${sha1(url)}.json`), 'utf8');
  } catch {
    return null;
  }
}

/** Réponse Overpass gardée pour cette requête, quel que soit le serveur qui l'a donnée. */
async function cachedOverpass(url: string): Promise<string | null> {
  const data = new URL(url).searchParams.get('data') ?? '';
  for (const mirror of OVERPASS_MIRRORS) {
    const text = await cachedResponse(`${mirror}?data=${encodeURIComponent(data)}`);
    if (text) return text;
  }
  return null;
}

/** Même adresse de recherche que l'appli (OsmClient). */
const searchUrl = (q: string) =>
  `${NOMINATIM_URL}/search?${new URLSearchParams({ q, limit: '5', format: 'jsonv2', addressdetails: '1', 'accept-language': 'fr' })}`;

/** Lieu des captures : la place Bellecour si l'essai des 20 adresses l'a gardée, sinon Villagexpo. */
async function captureQuery(): Promise<string> {
  const config = loadConfig();
  const query = 'Place Bellecour, Lyon';
  const search = await cachedResponse(searchUrl(query));
  if (!search) return 'Villagexpo, Saint-Michel-sur-Orge';
  const target = dedupePlaces((JSON.parse(search) as NominatimResult[]).map((r) => placeFromNominatim(r, query)))[0]!;
  const radius = config.places.defaultRadius;
  const place = {
    id: placeMapId(placeKey(target.center, radius)),
    name: target.name,
    center: target.center,
    radius,
    precise: target.precise,
  };
  const overpass = `${OVERPASS_MIRRORS[0]}?data=${encodeURIComponent(placeQuery(place, config))}`;
  return (await cachedOverpass(overpass)) ? query : 'Villagexpo, Saint-Michel-sur-Orge';
}

/**
 * Rejoue Nominatim et Overpass depuis le disque (aucun appel réseau) : réponses de
 * l'essai des 20 adresses, sinon celles de l'import de Villagexpo. Overpass répond
 * en 2,5 s pour laisser voir l'écran de chargement.
 */
async function replayOsm(page: Page): Promise<void> {
  await page.route(/nominatim\.openstreetmap\.org|\/api\/interpreter/, async (route) => {
    const url = route.request().url();
    const overpass = url.includes('/api/interpreter');
    const fallback = join(root, 'scripts', '.cache', overpass ? 'villagexpo.overpass.json' : 'villagexpo.nominatim.json');
    let body = overpass ? await cachedOverpass(url) : await cachedResponse(url);
    if (body === null) {
      // L'import de Villagexpo garde un seul résultat Nominatim ; l'appli attend une liste.
      const saved: unknown = JSON.parse(await readFile(fallback, 'utf8'));
      body = JSON.stringify(overpass || Array.isArray(saved) ? saved : [saved]);
    }
    if (overpass) await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
  });
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const server = await preview({ root, preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const report: Record<string, unknown> = { viewport: devices['Pixel 7'].viewport };

  try {
    console.log('Captures (Pixel 7, 412 × 915) :');
    await open(page, '');
    await shot(page, '1-accueil');

    // Pose : toucher un toit près de la base, choisir le Pulvérisateur.
    await open(page, '?debug');
    await page.getByRole('button', { name: 'Jouer', exact: true }).click();
    await page.waitForTimeout(300);
    const slot = await hook(page, (h) => h.slotNearBase());
    if (!slot) throw new Error('aucun emplacement libre');
    await tap(page, slot.x, slot.y);
    await shot(page, '2-pose');
    await page.getByRole('button', { name: /^Pulvérisateur/ }).click();
    await page.waitForTimeout(300);

    // Amélioration : toucher la tourelle, puis « Améliorer ».
    await tap(page, slot.x, slot.y);
    await page.getByRole('button', { name: /^Améliorer/ }).click();
    await page.waitForTimeout(250);
    await shot(page, '3-amelioration');

    // Revente.
    await page.getByRole('button', { name: /^Vendre/ }).click();
    await page.waitForTimeout(250);
    await shot(page, '4-revente');

    // Boss : on avance jusqu'à la vague 10 et l'arrivée du Méga-virus dans le quartier.
    await playUntil(page, "g.enemies.some((e) => e.config.id === 'megavirus' && e.distance > 30)");
    await page.waitForTimeout(200);
    report.boss = await hook(page, (h) => ({ wave: h.game().wavesLaunched, baseHp: h.game().baseHp }));
    await shot(page, '5-boss');

    // Défaite : aucune tourelle.
    await open(page, '?debug');
    await hook(page, (h) => h.start());
    await page.evaluate(`(() => { const h = window.streetDefense; for (let i = 0; i < 200 && !h.game().isOver; i++) { h.callNextWave(); h.fastForward(3); } })()`);
    await page.waitForTimeout(1300);
    report.defeat = await hook(page, (h) => ({ phase: h.game().phase, wave: h.game().wavesLaunched }));
    await shot(page, '6-defaite');

    // Victoire en mode test (5 000 crédits) : le joueur automatique construit et améliore.
    await open(page, '?debug');
    await hook(page, (h) => h.start());
    await playUntil(page, 'false', { maxSteps: 2000, early: false });
    await page.waitForTimeout(1300);
    report.victory = await hook(page, (h) => ({ phase: h.game().phase, wave: h.game().wavesLaunched, baseHp: h.game().baseHp }));
    await shot(page, '7-victoire');

    // Fluidité : 150 virus à l'écran.
    await open(page, '?debug');
    await hook(page, (h) => h.stress(150));
    await hook(page, (h) => h.fastForward(8));
    // Écrit en texte : tsx ajoute des fonctions auxiliaires absentes de la page.
    const fps = (await page.evaluate(
      'new Promise((resolve) => { let frames = 0; const start = performance.now(); ' +
        'const tick = () => { frames++; if (performance.now() - start < 5000) requestAnimationFrame(tick); ' +
        'else resolve((frames * 1000) / (performance.now() - start)); }; requestAnimationFrame(tick); })',
    )) as number;
    const enemies = await hook(page, (h) => h.game().enemies.length);
    const renderMs = await hook(page, (h) => h.renderCost(120));
    report.performance = { enemies, fps: Math.round(fps * 10) / 10, renderMs: Math.round(renderMs * 100) / 100 };
    await shot(page, '8-perf-150-virus');

    // Zoom : deux crans de « + » pendant une vague.
    await open(page, '?debug');
    await hook(page, (h) => h.start());
    await hook(page, (h) => h.autoBuild());
    await hook(page, (h) => h.fastForward(16));
    await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
    await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
    await page.waitForTimeout(300);
    await shot(page, '9-zoom');

    // Améliorations permanentes et paramètres, avec une progression déjà entamée.
    await page.evaluate(() =>
      localStorage.setItem(
        'streetdefense:v1:progress',
        JSON.stringify({ version: 1, gems: 64, upgrades: { degats: 2, credits: 1 }, records: { villagexpo: { bestWave: 17, bestScore: 52000, plays: 6, lastPlayed: '2026-10-25' } } }),
      ),
    );
    await open(page, '');
    await shot(page, '10-accueil-progression');
    await page.getByRole('button', { name: 'Améliorations' }).click();
    await page.waitForTimeout(300);
    await shot(page, '11-ameliorations');
    await page.getByRole('button', { name: 'Retour' }).click();
    await page.getByRole('button', { name: 'Paramètres' }).click();
    await page.getByRole('button', { name: 'Copier mon code' }).click();
    await page.waitForTimeout(300);
    await shot(page, '12-parametres');

    // Déplacer la base : avant la première vague, la carte en plein écran, on touche un bâtiment.
    await open(page, '?debug');
    await hook(page, (h) => h.start());
    await page.getByRole('button', { name: 'Déplacer la base' }).click();
    await page.waitForTimeout(500);
    await shot(page, '18-deplacer-la-base');

    // Publicité de test (web) : boost de crédits avant la première vague.
    await open(page, '?debug');
    await hook(page, (h) => h.start());
    await page.getByRole('button', { name: /crédits/ }).click();
    await page.waitForTimeout(400);
    await shot(page, '13-pub-test');

    // Jalon 4 : choisir un lieu, chargement, aperçu du tracé, partie sur la carte créée.
    const query = await captureQuery();
    console.log(`  (lieu des captures : ${query})`);
    await replayOsm(page);
    await open(page, '');
    await page.getByRole('button', { name: 'Choisir un lieu' }).click();
    await page.getByRole('searchbox', { name: 'Adresse, rue ou lieu' }).fill(query);
    await page.getByRole('button', { name: 'Chercher' }).click();
    await page.locator('.place-result').first().waitFor();
    await page.waitForTimeout(300);
    await shot(page, '14-choix-du-lieu');
    await page.locator('.place-result').first().click();
    await page.waitForTimeout(900);
    await shot(page, '15-chargement');
    await page.locator('.map-preview').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(600);
    await shot(page, '16-apercu');
    report.place = await page.evaluate(() => document.querySelector('.preview-stats')?.textContent ?? '');
    await page.getByRole('button', { name: 'Jouer ici' }).click();
    await page.waitForTimeout(800);
    await shot(page, '17-carte-creee');

    report.pageErrors = errors;
    await writeFile(join(outDir, 'rapport.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

export type { HookWindow };
