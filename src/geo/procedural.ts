import type { GameConfig } from '../config';
import { Rng } from '../game/rng';
import type { Area, Bounds, Building, Street, Vec2 } from '../game/types';
import { generateBuildings, type CityStyle } from './city';
import { assembleMap } from './mapBuilder';

// Générateur procédural de quartiers types, pour l'équilibrage (npm run
// simulate) : grilles, quartier dense d'immeubles, zone rurale clairsemée
// (socles), grilles traversées de diagonales, avec 1 à 4 rues d'entrée.

export type DistrictKind = 'grille' | 'dense' | 'rural' | 'diagonales';

export interface DistrictSpec {
  id: string;
  kind: DistrictKind;
  /** Nombre de rues qui entrent dans le quartier (1 à 4). */
  entries: number;
  seed: number;
  /** Taille de la zone de jeu (m). */
  width: number;
  height: number;
}

interface KindStyle {
  /** Taille visée des îlots (m). */
  block: [number, number];
  /** Probabilité de supprimer un tronçon de la grille. */
  removal: number;
  /** Décalage aléatoire des carrefours (m). */
  jitter: number;
  /** Part des bâtiments gardés (zone rurale clairsemée). */
  keep: number;
  parks: number;
  style: CityStyle;
}

const baseStyle: CityStyle = {
  sidewalk: 2.5,
  frontYard: [0.5, 2.5],
  gap: 2,
  house: { width: [9, 14], depth: [8, 11], height: [5, 9], gableChance: 0.65 },
  apartment: { chance: 0.15, width: [16, 24], depth: [11, 14], height: [11, 18] },
  paletteCount: 6,
  trees: { attempts: 0, parkAttempts: 0, spacing: 7, radius: [2.6, 4.2], paletteCount: 4 },
};

const KINDS: Record<DistrictKind, KindStyle> = {
  grille: { block: [90, 110], removal: 0.08, jitter: 0, keep: 1, parks: 1, style: baseStyle },
  dense: {
    block: [60, 72],
    removal: 0.05,
    jitter: 0,
    keep: 1,
    parks: 0,
    style: { ...baseStyle, gap: 1.5, apartment: { chance: 0.6, width: [14, 22], depth: [11, 14], height: [12, 24] } },
  },
  rural: {
    block: [150, 190],
    removal: 0.15,
    jitter: 10,
    keep: 0.22,
    parks: 2,
    style: { ...baseStyle, apartment: { ...baseStyle.apartment, chance: 0 } },
  },
  diagonales: {
    block: [100, 120],
    removal: 0.08,
    jitter: 0,
    keep: 1,
    parks: 1,
    style: { ...baseStyle, apartment: { ...baseStyle.apartment, chance: 0.25 } },
  },
};

/** Les 20 cartes types de la simulation d'équilibrage. */
export function simulationDistricts(): DistrictSpec[] {
  const list: [DistrictKind, number, number, number][] = [
    ['grille', 1, 350, 660],
    ['grille', 2, 350, 660],
    ['grille', 3, 350, 660],
    ['grille', 4, 350, 660],
    ['grille', 2, 300, 560],
    ['grille', 3, 400, 740],
    ['dense', 1, 350, 660],
    ['dense', 2, 350, 660],
    ['dense', 3, 300, 560],
    ['dense', 4, 350, 660],
    ['dense', 2, 400, 740],
    ['rural', 1, 350, 660],
    ['rural', 2, 400, 740],
    ['rural', 3, 350, 660],
    ['rural', 4, 400, 740],
    ['rural', 2, 300, 560],
    ['diagonales', 1, 350, 660],
    ['diagonales', 2, 350, 660],
    ['diagonales', 3, 400, 740],
    ['diagonales', 4, 350, 660],
  ];
  return list.map(([kind, entries, width, height], i) => ({
    id: `${kind}-${entries}-${i + 1}`,
    kind,
    entries,
    seed: 1000 + i * 7919,
    width,
    height,
  }));
}

/** Rues et surfaces d'un quartier type. */
export function districtLayout(spec: DistrictSpec): { zone: Bounds; streets: Street[]; areas: Area[] } {
  const kind = KINDS[spec.kind];
  const rng = new Rng(spec.seed);
  const zone = { minX: -spec.width / 2, minY: -spec.height / 2, maxX: spec.width / 2, maxY: spec.height / 2 };
  const margin = 30;
  const inner = { minX: zone.minX + margin, minY: zone.minY + margin, maxX: zone.maxX - margin, maxY: zone.maxY - margin };
  const nx = Math.max(2, Math.round((inner.maxX - inner.minX) / kind.block[0]));
  const ny = Math.max(2, Math.round((inner.maxY - inner.minY) / kind.block[1]));
  const node: Vec2[][] = [];
  for (let i = 0; i <= nx; i++) {
    node.push([]);
    for (let j = 0; j <= ny; j++) {
      const border = i === 0 || j === 0 || i === nx || j === ny;
      const jitter = border ? 0 : kind.jitter;
      node[i]!.push({
        x: inner.minX + ((inner.maxX - inner.minX) * i) / nx + rng.range(-jitter, jitter),
        y: inner.minY + ((inner.maxY - inner.minY) * j) / ny + rng.range(-jitter, jitter),
      });
    }
  }

  const width = spec.kind === 'dense' ? 7 : 8;
  const streets: Street[] = [];
  // Le pourtour de la grille est toujours gardé : les rues d'entrée y aboutissent, le quartier reste d'un seul tenant.
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const keepH = j === 0 || j === ny || rng.next() >= kind.removal;
      const keepV = i === 0 || i === nx || rng.next() >= kind.removal;
      if (i < nx && keepH) streets.push({ width, points: [node[i]![j]!, node[i + 1]![j]!] });
      if (j < ny && keepV) streets.push({ width, points: [node[i]![j]!, node[i]![j + 1]!] });
    }
  }
  if (spec.kind === 'diagonales') {
    streets.push({ width: 10, points: [node[0]![0]!, node[nx]![ny]!] });
    if (spec.entries >= 3) streets.push({ width: 10, points: [node[nx]![0]!, node[0]![ny]!] });
  }

  // Rues d'entrée : de 100 m hors de la carte jusqu'au bord de la grille (les virus viennent de l'extérieur).
  const sides = rng.shuffle(['ouest', 'est', 'nord', 'sud']).slice(0, Math.min(4, Math.max(1, spec.entries)));
  const pick = (n: number) => 1 + Math.floor(rng.next() * Math.max(1, n - 1));
  for (const side of sides) {
    let from: Vec2;
    let to: Vec2;
    if (side === 'ouest' || side === 'est') {
      to = node[side === 'ouest' ? 0 : nx]![pick(ny)]!;
      from = { x: side === 'ouest' ? zone.minX - 100 : zone.maxX + 100, y: to.y };
    } else {
      to = node[pick(nx)]![side === 'nord' ? 0 : ny]!;
      from = { x: to.x, y: side === 'nord' ? zone.minY - 100 : zone.maxY + 100 };
    }
    streets.push({ width: 10, points: [from, to] });
  }

  // Parcs ou bois : quelques îlots sans maisons.
  const areas: Area[] = [];
  for (let k = 0; k < kind.parks; k++) {
    const i = Math.floor(rng.next() * nx);
    const j = Math.floor(rng.next() * ny);
    const a = node[i]![j]!;
    const c = node[i + 1]![j + 1]!;
    const pad = 9;
    areas.push({
      kind: spec.kind === 'rural' ? 'wood' : 'park',
      polygon: [
        { x: a.x + pad, y: a.y + pad },
        { x: c.x - pad, y: a.y + pad },
        { x: c.x - pad, y: c.y - pad },
        { x: a.x + pad, y: c.y - pad },
      ],
    });
  }
  return { zone, streets, areas };
}

/** Quartier type complet, prêt à jouer. */
export function generateDistrict(spec: DistrictSpec, config: GameConfig) {
  const kind = KINDS[spec.kind];
  const { zone, streets, areas } = districtLayout(spec);
  const rng = new Rng(spec.seed ^ 0x5bd1e995);
  const generated = generateBuildings(streets, areas, zone, kind.style, rng).filter(() => rng.next() < kind.keep);
  const buildings: Building[] = generated.map((b, i) => ({
    ...b,
    id: i + 1,
    kind: b.height > 10 ? 'apartments' : 'house',
  }));
  return assembleMap(
    { id: spec.id, name: spec.id, seed: spec.seed, zone, streets, buildings, areas, trees: false },
    config,
  );
}
