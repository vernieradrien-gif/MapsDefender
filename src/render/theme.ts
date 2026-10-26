// Thème visuel « ville miniature » : couleurs douces, lumière venant du
// nord-ouest, ombres vers le sud-est. Les tailles des virus et des dispositifs
// sont en pixels CSS à l'échelle de référence, multipliées par un facteur
// d'adaptation à l'écran ; les rues et bâtiments sont en mètres.

import type { BuildingKind } from '../game/types';

export interface BuildingColors {
  walls: string[];
  gableRoofs: string[];
  flatRoofs: string[];
}

export const theme = {
  font: "'Fredoka Variable', 'Fredoka', system-ui, sans-serif",

  /** Zoom maximal (× la carte entière) et marge visible au-delà de la carte quand on est zoomé (m). */
  camera: { maxZoom: 4, overscroll: 50 },

  /** Hauteur projetée : 1 m de hauteur = heightFactor m vers le haut de l'écran. */
  heightFactor: 0.5,
  /** Ombre portée par mètre de hauteur (m au sol). */
  shadow: { dx: 0.45, dy: 0.32, color: '#29405a', alpha: 0.2 },
  /** Direction (au sol) d'où vient la lumière, pour l'ombrage des murs et des toits. */
  light: { x: -0.7, y: -0.55 },

  ground: '#d3e6b5',
  groundSpeckle: 'rgba(120, 170, 90, 0.16)',
  park: '#b9dc94',
  parkEdge: '#a3cf7f',
  parkPath: '#f3e7c9',
  wood: '#93c47a',
  woodEdge: '#7fb468',
  water: '#7fcdf2',
  waterDeep: '#5fb6e6',
  waterRim: '#e9f6fb',
  plaza: '#eef0f2',
  plazaLine: '#d9dee5',

  sidewalk: '#ece8e1',
  curb: '#d6d0c6',
  road: '#8f97a8',
  roadLine: 'rgba(255, 255, 255, 0.7)',

  /** Couleurs par usage de bâtiment (variantes choisies par `palette`). */
  buildings: {
    house: {
      walls: ['#f7ead2', '#f4dcc8', '#e1ecdf', '#e0e8f2', '#ece3ef', '#f6ecc4'],
      gableRoofs: ['#d9806a', '#8191b3', '#6aa9a2', '#c98a73', '#a99c90', '#d6a25e'],
      flatRoofs: ['#efebe4', '#e3e9ee', '#ece4ea', '#e9ede3', '#f1ece0', '#e6e6ef'],
    },
    apartments: {
      walls: ['#eef0f4', '#f1ebe3', '#e5ecef', '#ece9f1', '#efede6', '#e6eee8'],
      gableRoofs: ['#8191b3'],
      flatRoofs: ['#d9dee6', '#dcd8d0', '#d3dde0', '#dad6e0', '#dedbd2', '#d4ddd6'],
    },
    public: {
      walls: ['#fbf6ec', '#f3f1ea', '#f6efe6'],
      gableRoofs: ['#b5705c', '#7f8fae'],
      flatRoofs: ['#e9d9c2', '#dfe3d2', '#e5dccf'],
    },
    commercial: {
      walls: ['#e4e6ea', '#e9e3da', '#dfe5e3'],
      gableRoofs: ['#9aa3b2'],
      flatRoofs: ['#c9ced6', '#cfcac2', '#c6cfcc'],
    },
    annex: {
      walls: ['#d8cbb8', '#cfd3d8', '#d9d0c4'],
      gableRoofs: ['#a58a73', '#8d96a3'],
      flatRoofs: ['#b9b2a8', '#b3b8bf', '#bdb4a9'],
    },
  } as Record<BuildingKind, BuildingColors>,
  window: 'rgba(90, 120, 160, 0.35)',

  /** Bâtiments publics reconnaissables : clocher, drapeau de la mairie, toit des écoles. */
  landmarks: {
    steeple: '#f3ece0',
    spire: '#7d8bab',
    pole: '#8a8f9c',
    flag: ['#1f5fbf', '#ffffff', '#e5414b'],
    schoolFlatRoof: '#f2c35b',
    schoolGableRoof: '#e48a4f',
  },

  /** Bâtiment à protéger : blanc et bleu-vert, croix sur le toit. */
  base: {
    walls: '#ffffff',
    roof: '#2bb3a6',
    roofEdge: '#1f8f85',
    cross: '#ffffff',
    halo: 'rgba(43, 179, 166, 0.28)',
  },

  trees: ['#6fbf5e', '#5aae55', '#86c96a', '#4f9f63'],
  trunk: '#9a6b47',

  pad: { top: '#f4f6f8', side: '#c5cbd6', stripe: '#2bb3a6' },
  /**
   * Repères ⊕ des emplacements libres. Chaque bâtiment en a un : sans zoom, on ne
   * montre qu'une sélection lisible (à moins de `nearRoute` m d'un itinéraire,
   * espacés d'au moins `spacing` m ; les autres bâtiments restent touchables) ;
   * à partir du zoom `allFromZoom`, tous ceux visibles.
   */
  slotMarker: { ring: '#ffffff', fill: 'rgba(255, 255, 255, 0.75)', plus: '#1f9e93', nearRoute: 40, spacing: 28, allFromZoom: 2 },

  /** Repères d'entrée des virus. */
  entry: { fill: 'rgba(232, 72, 85, 0.22)', ring: '#e84855', arrow: '#ffffff', pulse: 'rgba(232, 72, 85, 0.5)' },

  /** Dispositifs sanitaires : blanc et bleu-vert, une couleur d'accent chacun. */
  towers: {
    pulverisateur: { main: '#ffffff', dark: '#cfe3e1', accent: '#20a99d' },
    diffuseur: { main: '#ffffff', dark: '#cfe3e1', accent: '#3a86c8' },
    laser: { main: '#ffffff', dark: '#d5dbe8', accent: '#7b5cff' },
    purificateur: { main: '#ffffff', dark: '#cfe3e1', accent: '#36c2b4' },
  } as Record<string, { main: string; dark: string; accent: string }>,
  towerBody: '#2bb3a6',
  towerBodyDark: '#1f8f85',
  levelPip: '#ffc93c',

  /** Virus stylisés : corps, pointes et taille (px à l'échelle de référence). */
  enemies: {
    virus: { body: '#e8636f', dark: '#c4404f', spikes: 10, size: 7 },
    variant: { body: '#f2a03d', dark: '#d07b16', spikes: 8, size: 5.8 },
    amas: { body: '#9b6fd6', dark: '#7a4fb8', spikes: 12, size: 9 },
    blinde: { body: '#5b7a8c', dark: '#3e5a6b', spikes: 14, size: 11 },
    megavirus: { body: '#c0304a', dark: '#8f1f36', spikes: 18, size: 17 },
  } as Record<string, { body: string; dark: string; spikes: number; size: number }>,
  slowTint: 'rgba(100, 200, 255, 0.55)',

  droplet: { fill: 'rgba(170, 235, 230, 0.9)', stroke: '#20a99d' },
  capsule: { fill: '#ffffff', band: '#3a86c8' },
  cloud: { fill: 'rgba(190, 240, 235, 0.55)', edge: 'rgba(120, 210, 200, 0.8)' },
  beam: { core: '#f3eeff', glow: 'rgba(123, 92, 255, 0.55)' },
  field: { fill: 'rgba(54, 194, 180, 0.10)', ring: 'rgba(54, 194, 180, 0.55)' },

  hpBar: { back: 'rgba(40, 50, 70, 0.55)', good: '#3fbf6b', mid: '#ffcc4d', low: '#ff5a6e' },
  range: { stroke: 'rgba(255, 255, 255, 0.95)', fill: 'rgba(255, 255, 255, 0.18)', next: 'rgba(43, 179, 166, 0.9)' },
  dissolve: ['#ffffff', '#d8f3ef', '#bfe9e3'],
  coinText: '#ffc93c',
  damageText: '#ff5a6e',
  textOutline: 'rgba(40, 45, 60, 0.75)',
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
