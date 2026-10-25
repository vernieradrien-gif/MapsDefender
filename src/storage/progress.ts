import type { GameSnapshot } from '../game/game';
import type { UpgradeLevels } from '../game/progression';
import { readJSON, removeKey, writeJSON } from './index';

// Progression du joueur (§ 7) : un JSON versionné dans localStorage, migré
// depuis les versions précédentes, exportable en code texte. La partie en
// cours est sauvegardée à part à chaque fin de vague.

export const PROGRESS_VERSION = 1;

export interface MapRecord {
  bestWave: number;
  bestScore: number;
  plays: number;
  /** Date de la dernière partie (AAAA-MM-JJ). */
  lastPlayed: string;
}

export interface Progress {
  version: typeof PROGRESS_VERSION;
  gems: number;
  upgrades: UpgradeLevels;
  /** Records par lieu (identifiant de carte). */
  records: Record<string, MapRecord>;
  settings: { speedIndex: number; mapId: string };
  /** Rythme des interstitiels : dernier affiché (ms) et parties du jour. */
  ads: { lastInterstitialAt: number; day: string; gamesToday: number };
}

export interface SavedGame {
  savedAt: number;
  snapshot: GameSnapshot;
}

const KEY = 'progress';
const SAVE_KEY = 'savedGame';
/** Clé du jalon 1 (vitesse choisie), reprise par la migration. */
const LEGACY_SPEED_KEY = 'speedIndex';

export function defaultProgress(): Progress {
  return {
    version: PROGRESS_VERSION,
    gems: 0,
    upgrades: {},
    records: {},
    settings: { speedIndex: 0, mapId: 'villagexpo' },
    ads: { lastInterstitialAt: 0, day: '', gamesToday: 0 },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

/**
 * Lit une progression enregistrée, quelle que soit sa version : rien (jalon 1
 * ou 2, seule la vitesse était gardée) ou version 1. Les champs absents ou
 * abîmés reprennent leur valeur par défaut.
 */
export function migrateProgress(raw: unknown, legacySpeedIndex?: unknown): Progress {
  const p = defaultProgress();
  if (!isRecord(raw)) {
    p.settings.speedIndex = Math.max(0, Math.floor(num(legacySpeedIndex, 0)));
    return p;
  }
  p.gems = Math.max(0, Math.floor(num(raw.gems, 0)));
  if (isRecord(raw.upgrades)) {
    for (const [id, level] of Object.entries(raw.upgrades)) {
      const l = Math.floor(num(level, 0));
      if (l > 0) p.upgrades[id] = l;
    }
  }
  if (isRecord(raw.records)) {
    for (const [id, r] of Object.entries(raw.records)) {
      if (!isRecord(r)) continue;
      p.records[id] = {
        bestWave: Math.max(0, num(r.bestWave, 0)),
        bestScore: Math.max(0, num(r.bestScore, 0)),
        plays: Math.max(0, num(r.plays, 0)),
        lastPlayed: str(r.lastPlayed, ''),
      };
    }
  }
  if (isRecord(raw.settings)) {
    p.settings.speedIndex = Math.max(0, Math.floor(num(raw.settings.speedIndex, 0)));
    p.settings.mapId = str(raw.settings.mapId, p.settings.mapId);
  }
  if (isRecord(raw.ads)) {
    p.ads.lastInterstitialAt = num(raw.ads.lastInterstitialAt, 0);
    p.ads.day = str(raw.ads.day, '');
    p.ads.gamesToday = Math.max(0, num(raw.ads.gamesToday, 0));
  }
  return p;
}

export function loadProgress(): Progress {
  return migrateProgress(readJSON<unknown>(KEY, null), readJSON<unknown>(LEGACY_SPEED_KEY, undefined));
}

export function saveProgress(p: Progress): void {
  writeJSON(KEY, p);
}

/**
 * Enregistre une partie terminée : record du lieu et parties du jour.
 * `countPlay` faux : la même partie se termine à nouveau après « Continuer »,
 * seuls les records sont mis à jour.
 */
export function recordGame(p: Progress, mapId: string, wave: number, score: number, day: string, countPlay = true): Progress {
  const old = p.records[mapId] ?? { bestWave: 0, bestScore: 0, plays: 0, lastPlayed: '' };
  return {
    ...p,
    records: {
      ...p.records,
      [mapId]: {
        bestWave: Math.max(old.bestWave, wave),
        bestScore: Math.max(old.bestScore, score),
        plays: old.plays + (countPlay ? 1 : 0),
        lastPlayed: day,
      },
    },
    ads: countPlay ? { ...p.ads, day, gamesToday: p.ads.day === day ? p.ads.gamesToday + 1 : 1 } : p.ads,
  };
}

// --- Export / import en code texte ---------------------------------------------

const CODE_PREFIX = 'SD1';

function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (code: string) => {
  const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

/** Code texte à recopier sur un autre appareil (gemmes, améliorations, records). */
export function exportProgress(p: Progress): string {
  const { gems, upgrades, records } = p;
  const body = toBase64Url(JSON.stringify({ version: p.version, gems, upgrades, records }));
  return `${CODE_PREFIX}.${body}.${checksum(body)}`;
}

/** Relit un code exporté ; null s'il est abîmé. Les réglages de l'appareil sont gardés. */
export function importProgress(code: string, current: Progress): Progress | null {
  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== CODE_PREFIX || checksum(parts[1]!) !== parts[2]) return null;
  try {
    const imported = migrateProgress(JSON.parse(fromBase64Url(parts[1]!)));
    return { ...imported, settings: current.settings, ads: current.ads };
  } catch {
    return null;
  }
}

// --- Partie en cours --------------------------------------------------------------

export function loadSavedGame(): SavedGame | null {
  const saved = readJSON<SavedGame | null>(SAVE_KEY, null);
  return saved && isRecord(saved.snapshot) && saved.snapshot.version === 1 ? saved : null;
}

export function saveGame(snapshot: GameSnapshot, now: number): void {
  writeJSON(SAVE_KEY, { savedAt: now, snapshot } satisfies SavedGame);
}

export function clearSavedGame(): void {
  removeKey(SAVE_KEY);
}
