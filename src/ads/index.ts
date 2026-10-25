import { Capacitor } from '@capacitor/core';
import { createAdMobService } from './admob';
import { createFakeAdService } from './fakeAd';

// Interface publicitaire unique du jeu. Sur Android (Capacitor) : AdMob avec
// les identifiants de TEST uniquement et le consentement RGPD (UMP). Sur le
// web : une fausse publicité de quelques secondes, pour tester les parcours.
// Règle : jamais de publicité pendant une vague (voir policy.ts).

export type RewardedResult = 'rewarded' | 'dismissed' | 'unavailable';

export type RewardedPlacement = 'double-gems' | 'continue' | 'boost';

export interface AdService {
  /** Prépare le service (consentement RGPD au premier lancement sur Android). */
  prepare(): Promise<void>;
  /** Pub récompensée ; résout 'rewarded' si le joueur l'a regardée jusqu'au bout. */
  showRewarded(placement: RewardedPlacement): Promise<RewardedResult>;
  /** Interstitiel entre deux parties. */
  showInterstitial(): Promise<void>;
  /** Bannière facultative de l'accueil (Android seulement). */
  showBanner(): void;
  hideBanner(): void;
  /** Formulaire de choix publicitaires (RGPD), si disponible. */
  showPrivacyOptions(): Promise<boolean>;
  readonly native: boolean;
}

export function createAdService(fakeAdSeconds: number): AdService {
  return Capacitor.isNativePlatform() ? createAdMobService() : createFakeAdService(fakeAdSeconds);
}
