import type { EconomyConfig, EnemyConfig, ScoreConfig } from '../config';

/** Bonus versé à la fin d'une vague : base + parVague × numéro de vague. */
export function waveBonus(wave: number, economy: EconomyConfig): number {
  return economy.waveBonusBase + economy.waveBonusPerWave * wave;
}

export function canAfford(money: number, cost: number): boolean {
  return money >= cost;
}

/** Points gagnés pour un ennemi tué : plus la vague est avancée, plus il rapporte. */
export function killScore(enemy: EnemyConfig, wave: number): number {
  return enemy.score * wave;
}

export function waveClearScore(wave: number, score: ScoreConfig): number {
  return score.perWaveCleared * wave;
}

export function victoryScore(baseHp: number, score: ScoreConfig): number {
  return Math.max(0, baseHp) * score.perBaseHpOnVictory;
}
