/**
 * Événements émis par la simulation, consommés par le rendu (effets) et
 * l'interface. La simulation ne sait pas qui les écoute.
 */
export type GameEvent =
  | { type: 'waveStarted'; wave: number; boss: boolean }
  | { type: 'waveCleared'; wave: number; bonus: number }
  | { type: 'towerPlaced'; towerId: number; slotId: number; towerType: string }
  | { type: 'towerUpgraded'; towerId: number; level: number; cost: number }
  | { type: 'towerSold'; towerId: number; slotId: number; refund: number; x: number; y: number }
  | {
      type: 'shot';
      towerId: number;
      towerType: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }
  | { type: 'beam'; towerId: number; towerType: string; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'impact'; towerType: string; x: number; y: number; radius: number }
  | { type: 'enemyDefeated'; enemyId: number; enemyType: string; x: number; y: number; reward: number }
  | { type: 'enemySplit'; enemyType: string; x: number; y: number; count: number }
  | { type: 'bossSpawned'; enemyId: number; wave: number }
  | { type: 'baseHit'; damage: number; baseHp: number }
  | { type: 'gameOver'; victory: boolean; score: number };
