import type { EconomyConfig, HeightBonusConfig, TowerConfig, UpgradesConfig } from '../config';
import type { TowerSlot } from './types';

// Caractéristiques des tourelles : niveau d'amélioration, bonus de hauteur,
// coût des améliorations et valeur de revente.

export interface TowerStats {
  range: number;
  damage: number;
  fireInterval: number;
  slow: number;
}

/** Bonus de portée d'un emplacement : seulement sur un toit, selon sa hauteur, plafonné. */
export function heightBonus(slot: Pick<TowerSlot, 'kind' | 'elevation'>, cfg: HeightBonusConfig): number {
  if (slot.kind !== 'roof') return 0;
  return Math.min(cfg.maxBonus, Math.max(0, slot.elevation) * cfg.rangePerMeter);
}

/** Caractéristiques effectives d'une tourelle à un niveau donné (0 = juste posée). */
export function towerStats(config: TowerConfig, level: number, bonus: number): TowerStats {
  const p = config.perLevel;
  return {
    range: config.range * (1 + p.range * level) * (1 + bonus),
    damage: config.damage * (1 + p.damage * level),
    fireInterval: config.fireInterval / (1 + p.fireRate * level),
    slow: Math.min(1, config.slow + p.slow * level),
  };
}

/** Coût pour passer au niveau `level` : coût de la tourelle × costGrowth^level. */
export function upgradeCost(config: TowerConfig, level: number, upgrades: UpgradesConfig): number {
  return Math.round(config.cost * Math.pow(upgrades.costGrowth, level));
}

/** Total investi dans une tourelle de ce niveau (pose + améliorations). */
export function totalInvested(config: TowerConfig, level: number, upgrades: UpgradesConfig): number {
  let total = config.cost;
  for (let l = 1; l <= level; l++) total += upgradeCost(config, l, upgrades);
  return total;
}

/** Argent rendu à la revente : une part du total investi, arrondie à l'inférieur. */
export function sellValue(invested: number, economy: EconomyConfig): number {
  return Math.floor(invested * economy.sellRefund);
}
