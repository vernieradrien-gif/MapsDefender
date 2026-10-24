/**
 * Événements émis par la simulation, consommés par le rendu (effets) et
 * l'interface. La simulation ne sait pas qui les écoute.
 */
export type GameEvent =
  | { type: 'waveStarted'; wave: number }
  | { type: 'waveCleared'; wave: number; bonus: number }
  | { type: 'towerPlaced'; towerId: number; slotId: number; towerType: string }
  | {
      type: 'shot';
      towerId: number;
      towerType: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }
  | { type: 'impact'; towerType: string; x: number; y: number; radius: number }
  | { type: 'enemyDefeated'; enemyId: number; enemyType: string; x: number; y: number; reward: number }
  | { type: 'baseHit'; damage: number; baseHp: number }
  | { type: 'gameOver'; victory: boolean; score: number };
