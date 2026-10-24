// Interface publicitaire unique du jeu. Au jalon 3, une implémentation AdMob
// (Capacitor, identifiants de TEST uniquement, consentement UMP) la remplacera
// sur Android. Sur le web, la version factice ne montre rien.
// Règle : jamais de publicité pendant une vague.

export type RewardedResult = 'rewarded' | 'dismissed' | 'unavailable';

export interface AdService {
  /** Pub récompensée ; résout 'rewarded' si le joueur l'a regardée jusqu'au bout. */
  showRewarded(placement: string): Promise<RewardedResult>;
  /** Interstitiel entre deux parties. */
  showInterstitial(placement: string): Promise<void>;
}

/** Version factice pour le web : aucune publicité, aucune récompense. */
export function createWebAdService(): AdService {
  return {
    showRewarded: async () => 'unavailable',
    showInterstitial: async () => {},
  };
}
