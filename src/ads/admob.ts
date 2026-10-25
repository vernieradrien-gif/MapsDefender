import type { AdService, RewardedResult } from './index';

// AdMob sur Android, chargé seulement sur l'appli native. Identifiants de
// TEST de Google uniquement (jamais de vrais identifiants dans le dépôt).
// L'identifiant d'application de test est déclaré dans
// android/app/src/main/AndroidManifest.xml.

export const ADMOB_TEST_IDS = {
  app: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
} as const;

type AdMobModule = typeof import('@capacitor-community/admob');
type Listener = Promise<{ remove(): Promise<void> }>;

/**
 * Affiche une publicité plein écran et attend sa fermeture. `listen` reçoit la
 * fonction de fin (fermeture ou échec) ; tous les écouteurs sont retirés ensuite.
 */
async function untilClosed(
  extra: Listener[],
  listen: (done: (result: RewardedResult) => void) => Listener[],
  show: () => Promise<void>,
): Promise<RewardedResult> {
  let finish: (result: RewardedResult) => void = () => {};
  const closed = new Promise<RewardedResult>((resolve) => (finish = resolve));
  const handles = await Promise.all([...extra, ...listen((result) => finish(result))]);
  try {
    await show();
    return await closed;
  } catch {
    return 'unavailable';
  } finally {
    await Promise.all(handles.map((h) => h.remove()));
  }
}

export function createAdMobService(): AdService {
  let ready: Promise<AdMobModule> | null = null;
  let consent: Promise<void> | null = null;
  let bannerWanted = false;
  let bannerShown = false;

  // Initialisation une seule fois (un échec sera retenté).
  const initialize = () =>
    (ready ??= (async () => {
      const mod = await import('@capacitor-community/admob');
      await mod.AdMob.initialize({ initializeForTesting: true });
      return mod;
    })().catch((error: unknown) => {
      ready = null;
      throw error;
    }));

  // Consentement (UMP), demandé une seule fois à la fois : le formulaire ne
  // s'affiche que s'il est requis (EEE). S'il n'a pas pu s'afficher (réseau
  // lent), on le redemandera avant la publicité suivante.
  const ensureConsent = (mod: AdMobModule) =>
    (consent ??= (async () => {
      try {
        const info = await mod.AdMob.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) {
          await mod.AdMob.showConsentForm();
        }
      } catch (error) {
        console.warn('Consentement publicitaire non obtenu', error);
        consent = null;
      }
    })());

  const load = async () => {
    const mod = await initialize();
    await ensureConsent(mod);
    return mod;
  };

  const removeBanner = async (mod: AdMobModule) => {
    await mod.AdMob.removeBanner();
    bannerShown = false;
  };

  return {
    native: true,
    prepare: async () => {
      try {
        await load();
      } catch (error) {
        console.warn('AdMob indisponible', error);
      }
    },
    // On attend la fermeture de la publicité (« Dismissed ») : sur Android, l'appel
    // d'affichage se termine dès la récompense, pub encore à l'écran, et jamais si
    // le joueur la ferme avant la fin. Le jeu reste figé jusqu'à la fermeture.
    showRewarded: async (): Promise<RewardedResult> => {
      try {
        const { AdMob, RewardAdPluginEvents } = await load();
        let rewarded = false;
        return await untilClosed(
          [
            AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
              rewarded = true;
            }),
          ],
          (done) => [
            AdMob.addListener(RewardAdPluginEvents.Dismissed, () => done(rewarded ? 'rewarded' : 'dismissed')),
            AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => done('unavailable')),
          ],
          async () => {
            await AdMob.prepareRewardVideoAd({ adId: ADMOB_TEST_IDS.rewarded, isTesting: true });
            void AdMob.showRewardVideoAd().catch(() => {});
          },
        );
      } catch {
        return 'unavailable';
      }
    },
    showInterstitial: async () => {
      try {
        const { AdMob, InterstitialAdPluginEvents } = await load();
        await untilClosed(
          [],
          (done) => [
            AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => done('dismissed')),
            AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => done('unavailable')),
          ],
          async () => {
            await AdMob.prepareInterstitial({ adId: ADMOB_TEST_IDS.interstitial, isTesting: true });
            void AdMob.showInterstitial().catch(() => {});
          },
        );
      } catch {
        // Pas de publicité : on continue sans.
      }
    },
    // La dernière demande (afficher ou retirer) l'emporte, même si le chargement est lent.
    showBanner: () => {
      bannerWanted = true;
      void load()
        .then(async (mod) => {
          if (!bannerWanted || bannerShown) return;
          await mod.AdMob.showBanner({
            adId: ADMOB_TEST_IDS.banner,
            isTesting: true,
            position: mod.BannerAdPosition.BOTTOM_CENTER,
            adSize: mod.BannerAdSize.ADAPTIVE_BANNER,
          });
          bannerShown = true;
          if (!bannerWanted) await removeBanner(mod);
        })
        .catch(() => {});
    },
    hideBanner: () => {
      bannerWanted = false;
      if (!bannerShown || !ready) return;
      void ready.then(removeBanner).catch(() => {});
    },
    showPrivacyOptions: async () => {
      try {
        const { AdMob } = await load();
        await AdMob.showPrivacyOptionsForm();
        return true;
      } catch {
        return false;
      }
    },
  };
}
