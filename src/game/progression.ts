import type { PermanentUpgradeConfig, ProgressionConfig } from '../config';

// Progression permanente (§ 3 « Économie ») : gemmes gagnées selon le score,
// dépensées dans un petit arbre d'améliorations qui s'appliquent à chaque partie.

/** Niveau atteint dans chaque amélioration permanente. */
export type UpgradeLevels = Record<string, number>;

/** Effets des améliorations permanentes sur une partie. */
export interface GameBonuses {
  /** Multiplicateur de dégâts des dispositifs (1 = aucun bonus). */
  damage: number;
  /** Multiplicateur de portée. */
  range: number;
  /** Crédits ajoutés au départ. */
  startMoney: number;
  /** Nombre de Pulvérisateurs offerts (pose gratuite). */
  freeTowers: number;
}

export const NO_BONUSES: GameBonuses = { damage: 1, range: 1, startMoney: 0, freeTowers: 0 };

/** Gemmes gagnées en fin de partie : gemFactor × √score. */
export function gemsForScore(score: number, progression: ProgressionConfig): number {
  return Math.floor(progression.gemFactor * Math.sqrt(Math.max(0, score)));
}

export const levelOf = (levels: UpgradeLevels, id: string): number => levels[id] ?? 0;

/** Coût du prochain niveau, ou null au niveau maximal. */
export function nextCost(upgrade: PermanentUpgradeConfig, levels: UpgradeLevels): number | null {
  const level = levelOf(levels, upgrade.id);
  return level >= upgrade.maxLevel ? null : (upgrade.costs[level] ?? null);
}

export type BuyCheck = 'ok' | 'max' | 'locked' | 'gems';

/** Peut-on acheter le prochain niveau ? (niveau maximal, prérequis de l'arbre, gemmes) */
export function canBuy(upgrade: PermanentUpgradeConfig, levels: UpgradeLevels, gems: number): BuyCheck {
  const cost = nextCost(upgrade, levels);
  if (cost === null) return 'max';
  if (upgrade.requires && levelOf(levels, upgrade.requires.id) < upgrade.requires.level) return 'locked';
  return gems >= cost ? 'ok' : 'gems';
}

/** Achète le prochain niveau ; renvoie les nouveaux niveaux et gemmes, ou null si impossible. */
export function buyUpgrade(
  id: string,
  levels: UpgradeLevels,
  gems: number,
  progression: ProgressionConfig,
): { levels: UpgradeLevels; gems: number } | null {
  const upgrade = progression.upgrades.find((u) => u.id === id);
  if (!upgrade || canBuy(upgrade, levels, gems) !== 'ok') return null;
  const cost = nextCost(upgrade, levels)!;
  return { levels: { ...levels, [id]: levelOf(levels, id) + 1 }, gems: gems - cost };
}

/** Effets cumulés des niveaux achetés. */
export function bonusesFrom(levels: UpgradeLevels, progression: ProgressionConfig): GameBonuses {
  const bonuses = { ...NO_BONUSES };
  for (const u of progression.upgrades) {
    const level = Math.min(levelOf(levels, u.id), u.maxLevel);
    if (level <= 0) continue;
    const total = u.effect * level;
    if (u.id === 'degats') bonuses.damage += total;
    else if (u.id === 'portee') bonuses.range += total;
    else if (u.id === 'credits') bonuses.startMoney += total;
    else if (u.id === 'offert') bonuses.freeTowers += total;
  }
  return bonuses;
}
