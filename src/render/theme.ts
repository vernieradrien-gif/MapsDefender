// Thème visuel « ville miniature » : couleurs douces, lumière venant du
// nord-ouest, ombres vers le sud-est. Les tailles des personnages et tourelles
// sont en pixels CSS à l'échelle de référence, multipliées par un facteur
// d'adaptation à l'écran ; les rues et bâtiments sont en mètres.

export const theme = {
  font: "'Fredoka Variable', 'Fredoka', system-ui, sans-serif",

  /** Hauteur projetée : 1 m de hauteur = heightFactor m vers le haut de l'écran. */
  heightFactor: 0.5,
  /** Ombre portée par mètre de hauteur (m au sol). */
  shadow: { dx: 0.45, dy: 0.32, color: '#29405a', alpha: 0.2 },
  /** Direction (au sol) d'où vient la lumière, pour l'ombrage des murs et des toits. */
  light: { x: -0.7, y: -0.55 },

  ground: '#cfe6ad',
  groundSpeckle: 'rgba(120, 170, 90, 0.18)',
  park: '#b5dc8e',
  parkEdge: '#9fcd78',
  parkPath: '#f3e7c9',
  water: '#7fcdf2',
  waterDeep: '#5fb6e6',
  waterRim: '#e9f6fb',
  plaza: '#f6ead8',
  plazaLine: '#e8d6bd',

  sidewalk: '#ece6dc',
  curb: '#d9d1c4',
  road: '#8e95a8',
  roadLine: 'rgba(255, 255, 255, 0.75)',
  route: '#ffb648',
  routeEdge: 'rgba(255, 182, 72, 0.35)',

  walls: ['#f7e8cc', '#f6cfb8', '#d3eadb', '#d4e2f4', '#e6d8f2', '#f8e7a8'],
  gableRoofs: ['#e2785e', '#6f84ad', '#58a8a0', '#d76b8c', '#a99c90', '#e3a456'],
  flatRoofs: ['#efebe4', '#e3e9ee', '#ece4ea', '#e9ede3', '#f1ece0', '#e6e6ef'],
  window: 'rgba(90, 120, 160, 0.35)',

  trees: ['#6fbf5e', '#5aae55', '#86c96a', '#4f9f63'],
  trunk: '#9a6b47',

  pad: { top: '#eef0f3', side: '#c5cbd6', stripe: '#ffb648' },
  slotMarker: { ring: '#ffffff', fill: 'rgba(255, 255, 255, 0.7)', plus: '#ff7a59' },

  cake: {
    plate: '#ffffff',
    sponge: '#e9a96b',
    cream: '#fff6ea',
    frosting: ['#ff9ec4', '#ffb3d1'],
    cherry: '#e83f5b',
    crumbs: '#d9925a',
  },

  towers: {
    bulles: { main: '#3cc6cc', dark: '#2a9aa5', accent: '#ff8fbf' },
    ballons: { main: '#ffb648', dark: '#e08e2b', accent: '#4fa3ff' },
  } as Record<string, { main: string; dark: string; accent: string }>,

  enemies: {
    glouton: { body: '#74d36b', dark: '#4fb04a', size: 8 },
    filou: { body: '#b083f0', dark: '#8a5fd0', size: 6.8 },
    bouboule: { body: '#ffa24c', dark: '#e57f25', size: 10.5 },
  } as Record<string, { body: string; dark: string; size: number }>,

  bubble: { fill: 'rgba(200, 245, 255, 0.45)', stroke: 'rgba(120, 200, 255, 0.9)', shine: '#ffffff' },
  balloon: { fill: '#4fa3ff', dark: '#2f7fe0', splash: '#7cc4ff' },

  hpBar: { back: 'rgba(40, 50, 70, 0.55)', good: '#5fd46a', mid: '#ffcc4d', low: '#ff6b6b' },
  range: { stroke: 'rgba(255, 255, 255, 0.95)', fill: 'rgba(255, 255, 255, 0.18)' },
  confetti: ['#ff7a59', '#ffcc4d', '#5fd46a', '#4fa3ff', '#b083f0', '#ff8fbf'],
  coinText: '#ffc93c',
  textOutline: 'rgba(60, 50, 40, 0.75)',
  fallback: '#cccccc',

  /** Échelle (px CSS par mètre) pour laquelle les tailles ci-dessus sont prévues. */
  referenceScale: 1.7,
  minUnit: 0.75,
  maxUnit: 1.5,
};

export const pickColor = (list: readonly string[], index: number): string =>
  list[((index % list.length) + list.length) % list.length] ?? '#cccccc';

/** Éclaircit (k > 0) ou assombrit (k < 0) une couleur hexadécimale #rrggbb. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const v = k >= 0 ? c + (255 - c) * k : c * (1 + k);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
