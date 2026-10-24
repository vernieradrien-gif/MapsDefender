// Thème visuel « néon sur fond sombre ». Les tailles des objets sont en pixels
// CSS à l'échelle de référence, multipliées par un facteur d'adaptation à
// l'écran ; les largeurs de rue sont en mètres (échelle de la carte).

export const theme = {
  background: '#070b16',
  grid: 'rgba(80, 120, 200, 0.07)',
  gridStep: 20,

  street: {
    asphalt: '#0f1a30',
    edge: 'rgba(70, 110, 180, 0.55)',
    width: 8,
  },
  path: {
    asphalt: '#0d1a33',
    neon: '#28d7ff',
    glow: 'rgba(40, 215, 255, 0.85)',
    centerLine: 'rgba(255, 220, 120, 0.35)',
    width: 12,
    edgeWidth: 1.1,
  },
  entry: '#28d7ff',

  slot: {
    ring: 'rgba(40, 215, 255, 0.55)',
    fill: 'rgba(40, 215, 255, 0.08)',
    selected: '#ffffff',
    radius: 9,
  },
  base: {
    fill: '#2a0f45',
    neon: '#c06bff',
    hpGood: '#5dff9d',
    hpLow: '#ff4d5e',
    radius: 13,
  },
  towers: {
    mitrailleuse: { color: '#3dffb0', body: '#0c2a22' },
    canon: { color: '#ffa53d', body: '#2e1a08' },
  } as Record<string, { color: string; body: string }>,
  enemies: {
    pieton: '#ffd84d',
    cycliste: '#ff7ad9',
    voiture: '#ff4d5e',
  } as Record<string, string>,
  hpBar: { back: 'rgba(0, 0, 0, 0.7)', good: '#5dff9d', mid: '#ffd84d', low: '#ff4d5e' },
  range: { stroke: 'rgba(255, 255, 255, 0.55)', fill: 'rgba(255, 255, 255, 0.07)' },
  shell: '#ffe1b0',
  explosion: '#ffa53d',
  moneyText: '#ffd84d',
  fallback: '#cccccc',

  /** Échelle (px CSS par mètre) pour laquelle les tailles ci-dessus sont prévues. */
  referenceScale: 1.6,
  minUnit: 0.75,
  maxUnit: 1.5,
};
