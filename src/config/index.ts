import balance from './balance.json';

// Types de la configuration d'équilibrage. Les valeurs vivent dans
// balance.json (documenté dans README.md de ce dossier) : aucune valeur
// d'équilibrage ne doit être écrite en dur dans le code.

export interface SimulationConfig {
  /** Mises à jour de la simulation par seconde (pas de temps fixe). */
  stepsPerSecond: number;
  /** Durée maximale d'une image prise en compte (évite l'emballement après une pause). */
  maxFrameSeconds: number;
  /** Nombre maximal de pas de simulation par image. */
  maxStepsPerFrame: number;
  /** Vitesses proposées par le bouton de vitesse. */
  speeds: number[];
}

export interface EconomyConfig {
  startMoney: number;
  /** Bonus de fin de vague = waveBonusBase + waveBonusPerWave × numéro de vague. */
  waveBonusBase: number;
  waveBonusPerWave: number;
}

export interface ScoreConfig {
  /** Points par vague terminée, multipliés par le numéro de la vague. */
  perWaveCleared: number;
  /** Points par PV de base restant en cas de victoire. */
  perBaseHpOnVictory: number;
}

export interface WaveCompositionEntry {
  enemy: string;
  fromWave: number;
  weight: number;
}

export interface WavesConfig {
  total: number;
  prepSeconds: number;
  interWaveSeconds: number;
  /** PV = PV de base × hpGrowth^(vague − 1). */
  hpGrowth: number;
  /** Nombre d'ennemis = countBase + countPerWave × (vague − 1). */
  countBase: number;
  countPerWave: number;
  spawnIntervalStart: number;
  spawnIntervalPerWave: number;
  spawnIntervalMin: number;
  /** Décalage latéral maximal (m) des ennemis par rapport à l'axe de la rue. */
  laneOffsetMax: number;
  composition: WaveCompositionEntry[];
}

export interface EnemyConfig {
  id: string;
  hp: number;
  /** Vitesse en m/s. */
  speed: number;
  /** Argent gagné quand l'ennemi est tué. */
  reward: number;
  /** PV retirés à la base si l'ennemi l'atteint. */
  baseDamage: number;
  /** Points de score, multipliés par le numéro de la vague. */
  score: number;
}

interface TowerConfigBase {
  id: string;
  cost: number;
  /** Portée en mètres. */
  range: number;
  damage: number;
  /** Secondes entre deux tirs. */
  fireInterval: number;
}

/** Tir instantané sur une cible (Mitrailleuse). */
export interface HitscanTowerConfig extends TowerConfigBase {
  kind: 'hitscan';
}

/** Obus qui explose et touche tous les ennemis dans un rayon (Canon). */
export interface ShellTowerConfig extends TowerConfigBase {
  kind: 'shell';
  splashRadius: number;
  /** Vitesse de l'obus en m/s. */
  projectileSpeed: number;
}

export type TowerConfig = HitscanTowerConfig | ShellTowerConfig;

export interface MapRulesConfig {
  slotMinDistanceFromPath: number;
  slotMinSpacing: number;
  baseMaxDistanceFromPathEnd: number;
}

export interface GameConfig {
  version: number;
  simulation: SimulationConfig;
  base: { hp: number };
  economy: EconomyConfig;
  score: ScoreConfig;
  waves: WavesConfig;
  enemies: EnemyConfig[];
  towers: TowerConfig[];
  mapRules: MapRulesConfig;
  debug: { startMoney: number };
}

/** Vérifie la cohérence d'une configuration ; renvoie la liste des erreurs. */
export function validateConfig(config: GameConfig): string[] {
  const errors: string[] = [];
  const positive = (value: number, name: string) => {
    if (!(Number.isFinite(value) && value > 0)) errors.push(`${name} doit être > 0`);
  };
  const nonNegative = (value: number, name: string) => {
    if (!(Number.isFinite(value) && value >= 0)) errors.push(`${name} doit être >= 0`);
  };

  positive(config.simulation.stepsPerSecond, 'simulation.stepsPerSecond');
  positive(config.simulation.maxFrameSeconds, 'simulation.maxFrameSeconds');
  positive(config.simulation.maxStepsPerFrame, 'simulation.maxStepsPerFrame');
  if (config.simulation.speeds.length === 0) errors.push('simulation.speeds est vide');
  config.simulation.speeds.forEach((s, i) => positive(s, `simulation.speeds[${i}]`));

  positive(config.base.hp, 'base.hp');
  nonNegative(config.economy.startMoney, 'economy.startMoney');
  nonNegative(config.economy.waveBonusBase, 'economy.waveBonusBase');
  nonNegative(config.economy.waveBonusPerWave, 'economy.waveBonusPerWave');

  const w = config.waves;
  positive(w.total, 'waves.total');
  nonNegative(w.prepSeconds, 'waves.prepSeconds');
  nonNegative(w.interWaveSeconds, 'waves.interWaveSeconds');
  positive(w.hpGrowth, 'waves.hpGrowth');
  positive(w.countBase, 'waves.countBase');
  nonNegative(w.countPerWave, 'waves.countPerWave');
  positive(w.spawnIntervalStart, 'waves.spawnIntervalStart');
  positive(w.spawnIntervalMin, 'waves.spawnIntervalMin');
  nonNegative(w.laneOffsetMax, 'waves.laneOffsetMax');

  const enemyIds = new Set<string>();
  for (const e of config.enemies) {
    if (enemyIds.has(e.id)) errors.push(`ennemi en double : ${e.id}`);
    enemyIds.add(e.id);
    positive(e.hp, `enemies.${e.id}.hp`);
    positive(e.speed, `enemies.${e.id}.speed`);
    nonNegative(e.reward, `enemies.${e.id}.reward`);
    nonNegative(e.baseDamage, `enemies.${e.id}.baseDamage`);
    nonNegative(e.score, `enemies.${e.id}.score`);
  }
  if (w.composition.length === 0) errors.push('waves.composition est vide');
  for (const c of w.composition) {
    if (!enemyIds.has(c.enemy)) errors.push(`waves.composition : ennemi inconnu ${c.enemy}`);
    positive(c.weight, `waves.composition.${c.enemy}.weight`);
    positive(c.fromWave, `waves.composition.${c.enemy}.fromWave`);
  }
  if (!w.composition.some((c) => c.fromWave <= 1)) {
    errors.push('waves.composition : aucun ennemi disponible à la vague 1');
  }

  const towerIds = new Set<string>();
  if (config.towers.length === 0) errors.push('towers est vide');
  for (const t of config.towers) {
    if (towerIds.has(t.id)) errors.push(`tour en double : ${t.id}`);
    towerIds.add(t.id);
    positive(t.cost, `towers.${t.id}.cost`);
    positive(t.range, `towers.${t.id}.range`);
    positive(t.damage, `towers.${t.id}.damage`);
    positive(t.fireInterval, `towers.${t.id}.fireInterval`);
    if (t.kind === 'shell') {
      positive(t.splashRadius, `towers.${t.id}.splashRadius`);
      positive(t.projectileSpeed, `towers.${t.id}.projectileSpeed`);
    } else if (t.kind !== 'hitscan') {
      errors.push(`towers.${(t as TowerConfigBase).id}.kind inconnu`);
    }
  }
  return errors;
}

/** Configuration par défaut, validée au chargement. */
export function loadConfig(): GameConfig {
  const config = balance as unknown as GameConfig;
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Configuration invalide :\n- ${errors.join('\n- ')}`);
  }
  return config;
}
