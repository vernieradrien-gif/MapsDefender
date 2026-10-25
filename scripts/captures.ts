// Captures d'écran automatiques (Playwright, viewport Pixel 7) et mesure de
// fluidité avec 150 virus. Construit le site, le sert localement, joue les
// scènes demandées et enregistre les images dans docs/captures/.
//
//   npm run captures

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, type Page } from 'playwright';
import { preview } from 'vite';
import type { DebugHooks } from '../src/app';

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
