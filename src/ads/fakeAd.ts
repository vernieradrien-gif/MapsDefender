import { t } from '../i18n';
import { el, escapeHtml } from '../ui/dom';
import type { AdService, RewardedResult } from './index';

// Fausse publicité pour le web : un écran « Publicité de test » avec un
// compte à rebours, pour essayer les récompenses sans régie publicitaire.

function showFakeAd(seconds: number, rewarded: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const root = el('div', 'overlay overlay-ad');
    const panel = el('div', 'panel');
    const count = el('p', 'ad-count');
    const close = el('button', 'button button-primary', escapeHtml(t('ad.close')));
    close.type = 'button';
    close.disabled = true;
    const skip = el('button', 'button button-secondary', escapeHtml(t('ad.skip')));
    skip.type = 'button';
    panel.append(
      el('p', 'ad-badge', escapeHtml(t('ad.badge'))),
      el('h2', 'title', escapeHtml(t('ad.title'))),
      el('p', 'tagline', escapeHtml(t(rewarded ? 'ad.rewardedText' : 'ad.interstitialText'))),
      count,
      close,
    );
    if (rewarded) panel.append(skip);
    root.append(panel);
    document.body.append(root);

    let left = seconds;
    const tick = () => {
      count.textContent = left > 0 ? t('ad.countdown', { seconds: left }) : t('ad.done');
      close.disabled = left > 0;
    };
    tick();
    const timer = setInterval(() => {
      left--;
      tick();
      if (left <= 0) clearInterval(timer);
    }, 1000);
    const finish = (watched: boolean) => {
      clearInterval(timer);
      root.remove();
      resolve(watched);
    };
    close.addEventListener('click', () => finish(true));
    skip.addEventListener('click', () => finish(false));
  });
}

export function createFakeAdService(seconds: number): AdService {
  return {
    native: false,
    prepare: async () => {},
    showRewarded: async (): Promise<RewardedResult> => ((await showFakeAd(seconds, true)) ? 'rewarded' : 'dismissed'),
    showInterstitial: async () => {
      await showFakeAd(seconds, false);
    },
    showBanner: () => {},
    hideBanner: () => {},
    showPrivacyOptions: async () => false,
  };
}
