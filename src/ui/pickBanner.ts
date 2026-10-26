import { t } from '../i18n';
import { el, escapeHtml } from './dom';
import { icons } from './icons';

// Bandeau du mode « Choisir la base » : la carte reste visible et zoomable
// dessous ; le joueur touche le bâtiment voulu.

export class PickBanner {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, onCancel: () => void) {
    this.root = el('div', 'pick-banner hidden', `<span class="pick-icon">${icons.base}</span>`);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', t('loading.pickBase'));
    const text = el('p', 'pick-text', escapeHtml(t('pick.hint')));
    const cancel = el('button', 'button button-secondary pick-cancel', escapeHtml(t('pick.cancel')));
    cancel.type = 'button';
    cancel.addEventListener('click', onCancel);
    this.root.append(text, cancel);
    parent.append(this.root);
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
