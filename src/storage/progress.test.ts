import { describe, expect, it } from 'vitest';
import { canShowInterstitial, dayOf } from '../ads/policy';
import { defaultProgress, exportProgress, importProgress, migrateProgress, PROGRESS_VERSION, recordGame } from './progress';

describe('progression enregistrée', () => {
  it('sans rien d’enregistré, part de zéro en reprenant la vitesse choisie au jalon 1', () => {
    const p = migrateProgress(null, 2);
    expect(p).toEqual({ ...defaultProgress(), settings: { ...defaultProgress().settings, speedIndex: 2 } });
    expect(p.version).toBe(PROGRESS_VERSION);
  });

  it('répare les champs abîmés et garde les bons', () => {
    const p = migrateProgress({
      version: 1,
      gems: 42.7,
      upgrades: { degats: 2, credits: 'beaucoup', portee: -3 },
      records: { villagexpo: { bestWave: 14, bestScore: 9000, plays: 3, lastPlayed: '2026-10-24' }, cassé: 5 },
      settings: { speedIndex: 1, mapId: 'fixed-demo' },
      ads: { lastInterstitialAt: 1000, day: '2026-10-24', gamesToday: 2 },
    });
    expect(p.gems).toBe(42);
    expect(p.upgrades).toEqual({ degats: 2 });
    expect(Object.keys(p.records)).toEqual(['villagexpo']);
    expect(p.settings).toEqual({ speedIndex: 1, mapId: 'fixed-demo' });
    expect(p.ads.gamesToday).toBe(2);
  });

  it('enregistre les records par lieu et les parties du jour', () => {
    let p = recordGame(defaultProgress(), 'villagexpo', 12, 8000, '2026-10-25');
    p = recordGame(p, 'villagexpo', 9, 9500, '2026-10-25');
    expect(p.records.villagexpo).toEqual({ bestWave: 12, bestScore: 9500, plays: 2, lastPlayed: '2026-10-25' });
    expect(p.ads).toMatchObject({ day: '2026-10-25', gamesToday: 2 });
    // Après « Continuer », la même partie finit à nouveau : records mis à jour, partie non recomptée.
    p = recordGame(p, 'villagexpo', 15, 12000, '2026-10-25', false);
    expect(p.records.villagexpo).toMatchObject({ bestWave: 15, plays: 2 });
    expect(p.ads.gamesToday).toBe(2);
    // Un autre jour, le compteur repart.
    expect(recordGame(p, 'fixed-demo', 3, 100, '2026-10-26').ads.gamesToday).toBe(1);
  });

  it('exporte et réimporte la progression en code texte', () => {
    const p = { ...defaultProgress(), gems: 77, upgrades: { degats: 3 } };
    p.records.villagexpo = { bestWave: 20, bestScore: 30000, plays: 5, lastPlayed: '2026-10-25' };
    const code = exportProgress(p);
    expect(code.startsWith('SD1.')).toBe(true);
    const here = { ...defaultProgress(), settings: { speedIndex: 2, mapId: 'fixed-demo' } };
    const imported = importProgress(code, here)!;
    expect(imported.gems).toBe(77);
    expect(imported.upgrades).toEqual({ degats: 3 });
    expect(imported.records.villagexpo!.bestWave).toBe(20);
    expect(imported.settings).toEqual(here.settings);
  });

  it('refuse un code abîmé', () => {
    const code = exportProgress({ ...defaultProgress(), gems: 5 });
    expect(importProgress(code.slice(0, -2), defaultProgress())).toBeNull();
    expect(importProgress(code.replace('SD1', 'XX9'), defaultProgress())).toBeNull();
    expect(importProgress('n’importe quoi', defaultProgress())).toBeNull();
  });
});

describe('rythme des interstitiels', () => {
  const now = new Date(2026, 9, 25, 15, 0, 0).getTime();
  const today = dayOf(now);

  it('jamais après la première partie du jour', () => {
    expect(canShowInterstitial({ lastInterstitialAt: 0, day: today, gamesToday: 1 }, now, 180)).toBe(false);
    expect(canShowInterstitial({ lastInterstitialAt: 0, day: '2026-10-24', gamesToday: 5 }, now, 180)).toBe(false);
  });

  it('au plus toutes les 3 minutes', () => {
    expect(canShowInterstitial({ lastInterstitialAt: now - 60_000, day: today, gamesToday: 3 }, now, 180)).toBe(false);
    expect(canShowInterstitial({ lastInterstitialAt: now - 181_000, day: today, gamesToday: 3 }, now, 180)).toBe(true);
  });

  it('date locale au format AAAA-MM-JJ', () => {
    expect(dayOf(now)).toBe('2026-10-25');
  });
});
