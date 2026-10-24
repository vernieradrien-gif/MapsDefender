import './ui/style.css';
import { App } from './app';
import { t } from './i18n';
import { ErrorScreen } from './ui/screens';

document.title = t('app.title');

const root = document.getElementById('app');
if (!root) throw new Error('#app introuvable');

// En cas d'erreur, on l'affiche à l'écran : pratique pour signaler un bogue
// depuis un téléphone (capture d'écran).
const errorScreen = new ErrorScreen(document.body);
const report = (error: unknown) => {
  const text = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  errorScreen.showError(text);
};
window.addEventListener('error', (e) => report(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => report(e.reason));

try {
  new App(root, { debug: new URLSearchParams(location.search).has('debug') });
} catch (error) {
  report(error);
}
