// Règles d'affichage des publicités (§ 6), pures et testables.
// - Jamais de publicité pendant une vague : les pubs récompensées ne sont
//   proposées qu'entre deux vagues (boost) ou sur l'écran de fin de partie ;
// - interstitiel seulement au retour à l'accueil après une partie, au plus
//   toutes les 3 minutes, jamais à la première partie du jour.

export interface AdPacing {
  /** Dernier interstitiel affiché (ms depuis 1970). */
  lastInterstitialAt: number;
  /** Jour (AAAA-MM-JJ) auquel se rapporte `gamesToday`. */
  day: string;
  /** Parties terminées ce jour-là, celle qui vient de finir comprise. */
  gamesToday: number;
}

/** Date locale au format AAAA-MM-JJ. */
export function dayOf(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function canShowInterstitial(pacing: AdPacing, now: number, minSeconds: number): boolean {
  if (pacing.day !== dayOf(now) || pacing.gamesToday <= 1) return false;
  return now - pacing.lastInterstitialAt >= minSeconds * 1000;
}
