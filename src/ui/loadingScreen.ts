import type { GameMap } from '../game/types';
import { t } from '../i18n';
import { drawMapPreview } from '../render/preview';
import { el, escapeHtml } from './dom';
import { icons } from './icons';
import { button } from './menus';
import { Overlay } from './screens';

// Écran de chargement d'une carte (§ 5) : étapes animées et « Annuler », puis
// l'aperçu du tracé avec « Jouer ici », ou un message et « Réessayer ».

export type StepState = 'pending' | 'active' | 'done';

export interface LoadingHandlers {
  onCancel(): void;
  onRetry(): void;
  onPlay(): void;
  onBack(): void;
  /** Quartier imaginaire à la place (serveurs indisponibles). */
  onImaginary(): void;
  /** Choisir soi-même le bâtiment de la base, sur la carte. */
  onPickBase(): void;
}

export interface LoadingResult {
  map: GameMap;
  title: string;
  stats: string;
  notes: readonly string[];
  /** Carte tirée d'OpenStreetMap (mention de la licence). */
  osm: boolean;
  /** Le joueur peut choisir la base (carte réelle). */
  canPickBase: boolean;
}

export class LoadingScreen extends Overlay {
  private readonly content: HTMLElement;
  private readonly steps = new Map<string, HTMLLIElement>();
  private list: HTMLElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly handlers: LoadingHandlers,
  ) {
    super(parent, 'overlay-menu overlay-loading');
    this.content = el('div', 'menu-content');
    this.panel.append(this.content);
  }

  /** Nouveau chargement : titre et étapes prévues (toutes en attente). */
  start(title: string, steps: readonly { id: string; label: string }[]): void {
    this.steps.clear();
    this.list = el('ol', 'loading-steps');
    for (const step of steps) this.addStep(step.id, step.label);
    this.content.replaceChildren(
      el('h2', 'title loading-title', escapeHtml(title)),
      this.list,
      button(t('loading.cancel'), 'button-secondary', this.handlers.onCancel),
    );
    this.show();
  }

  private addStep(id: string, label: string): HTMLLIElement {
    const item = el('li', 'loading-step pending', `<span class="step-mark"></span><span class="step-label">${escapeHtml(label)}</span>`);
    this.steps.set(id, item);
    this.list?.append(item);
    return item;
  }

  /** Change l'état d'une étape (ajoutée si elle n'était pas prévue), et son libellé si donné. */
  setStep(id: string, state: StepState, label?: string): void {
    const item = this.steps.get(id) ?? this.addStep(id, label ?? '');
    item.className = `loading-step ${state}`;
    item.querySelector('.step-mark')!.innerHTML = state === 'done' ? icons.check : '';
    if (label !== undefined) item.querySelector('.step-label')!.textContent = label;
    if (state === 'active') {
      // Les étapes précédentes sont terminées.
      for (const [otherId, other] of this.steps) {
        if (otherId === id) break;
        if (!other.classList.contains('done')) this.setStep(otherId, 'done');
      }
    }
  }

  showError(message: string, canRetry: boolean): void {
    const actions = el('div', 'menu-row');
    if (canRetry) actions.append(button(t('loading.retry'), 'button-primary', this.handlers.onRetry));
    actions.append(button(t('loading.back'), 'button-secondary', this.handlers.onBack));
    this.content.replaceChildren(
      el('h2', 'title loading-title', escapeHtml(t('loading.failed'))),
      el('p', 'loading-error', escapeHtml(message)),
      actions,
    );
    if (canRetry) this.content.append(button(t('place.imaginary'), 'button-secondary', this.handlers.onImaginary, icons.dice));
    this.show();
  }

  showResult(result: LoadingResult): void {
    const canvas = el('canvas', 'map-preview');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', t('loading.previewLabel'));
    this.content.replaceChildren(
      el('h2', 'title loading-title', escapeHtml(result.title)),
      canvas,
      el('p', 'preview-stats', escapeHtml(result.stats)),
      ...result.notes.map((note) => el('p', 'preview-note', escapeHtml(note))),
      button(t('loading.play'), 'button-primary button-large', this.handlers.onPlay, icons.play),
    );
    if (result.canPickBase) this.content.append(button(t('loading.pickBase'), 'button-secondary', this.handlers.onPickBase, icons.base));
    this.content.append(button(t('loading.back'), 'button-secondary', this.handlers.onBack));
    if (result.osm) this.content.append(el('p', 'attribution', escapeHtml(t('start.attribution'))));
    this.show();
    // Dessin une fois l'aperçu mis en page (taille connue).
    requestAnimationFrame(() => drawMapPreview(canvas, result.map));
  }
}
