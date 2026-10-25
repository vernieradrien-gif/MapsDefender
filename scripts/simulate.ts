// Simulation d'équilibrage sans rendu : parties automatiques sur les 20
// cartes types (et sur Villagexpo), avec les joueurs « moyen » et « bon ».
//
//   npm run simulate                    # 3 parties par carte et par joueur
//   npm run simulate -- --games 1       # plus rapide
//   npm run simulate -- --only rural    # un type de carte
//
// Cible du cahier des charges : un joueur moyen atteint la vague 12 à 15.

import { loadConfig } from '../src/config';
import { createBot, playGame, type BotLevel } from '../src/game/bots';
import { Game } from '../src/game/game';
import { validateMap } from '../src/game/mapValidation';
import { averageRouteLength } from '../src/game/scaling';
import type { GameMap } from '../src/game/types';
import { villagexpoMap } from '../src/geo/maps';
import { generateDistrict, simulationDistricts } from '../src/geo/procedural';

function option(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const games = Number(option('games', '3'));
const only = option('only', '');
const config = loadConfig();
const levels: BotLevel[] = ['moyen', 'bon'];

interface Row {
  name: string;
  entries: number;
  routes: number;
  average: number;
  slots: number;
  results: Record<BotLevel, { waves: number[]; wins: number }>;
  problems: string[];
}

function play(map: GameMap, name: string, seed: number): Row {
  const row: Row = {
    name,
    entries: map.entries.length,
    routes: map.paths.length,
    average: averageRouteLength(map.paths),
    slots: map.slots.length,
    results: { moyen: { waves: [], wins: 0 }, bon: { waves: [], wins: 0 } },
    problems: validateMap(map, config.mapRules),
  };
  for (const level of levels) {
    for (let g = 0; g < games; g++) {
      const game = new Game(map, config, { seed: seed * 31 + g });
      const result = playGame(game, createBot(game, level, g + 1));
      row.results[level].waves.push(result.wave);
      if (result.victory) row.results[level].wins++;
    }
  }
  return row;
}

const pad = (text: string | number, width: number) => String(text).padEnd(width);
const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);

const rows: Row[] = [];
const started = Date.now();
for (const spec of simulationDistricts()) {
  if (only && spec.kind !== only) continue;
  try {
    const { map } = generateDistrict(spec, config);
    rows.push(play(map, spec.id, spec.seed));
  } catch (error) {
    console.error(`${spec.id} : carte injouable (${error instanceof Error ? error.message : String(error)})`);
  }
}
const real = only ? null : play(villagexpoMap(), 'villagexpo (réelle)', 7);

console.log(`\n${games} partie(s) par carte et par joueur — vague atteinte (moyenne, min–max) et victoires\n`);
console.log(
  `${pad('carte', 22)}${pad('entr.', 6)}${pad('itin.', 6)}${pad('long.', 7)}${pad('empl.', 6)}` +
    `${pad('moyen', 22)}${pad('bon', 22)}`,
);
for (const row of real ? [...rows, real] : rows) {
  const cell = (level: BotLevel) => {
    const r = row.results[level];
    const w = r.waves;
    return `${mean(w).toFixed(1)} (${Math.min(...w)}–${Math.max(...w)}) ${Math.round((r.wins / w.length) * 100)} %`;
  };
  console.log(
    `${pad(row.name, 22)}${pad(row.entries, 6)}${pad(row.routes, 6)}${pad(`${row.average.toFixed(0)} m`, 7)}` +
      `${pad(row.slots, 6)}${pad(cell('moyen'), 22)}${pad(cell('bon'), 22)}` +
      (row.problems.length > 0 ? `  ⚠ ${row.problems[0]}` : ''),
  );
}
for (const level of levels) {
  const waves = rows.flatMap((r) => r.results[level].waves);
  const wins = rows.reduce((s, r) => s + r.results[level].wins, 0);
  console.log(
    `\nJoueur ${level} sur les cartes types : vague moyenne ${mean(waves).toFixed(1)}, ` +
      `victoires ${Math.round((wins / Math.max(1, waves.length)) * 100)} %`,
  );
}
console.log(`\nDurée : ${((Date.now() - started) / 1000).toFixed(0)} s`);
