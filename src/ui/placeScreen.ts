import { t } from '../i18n';
import { el, escapeHtml } from './dom';
import { icons } from './icons';
import { button, mapList, type MapChoice } from './menus';
import { Overlay } from './screens';

// Écran « Choisir un lieu » (§ 5) : adresse (recherche lancée par un bouton,
// pas d'autocomplétion), Ma position, rayon, résultats, cartes enregistrées et
// quartier imaginaire (hors connexion).

export interface PlaceResult {
  name: string;
  detail: string;
}

export interface PlaceScreenState {
  radius: number;
  radii: readonly number[];
  busy: 'search' | 'locate' | null;
  message: { text: string; error: boolean } | null;
  results: readonly PlaceResult[];
  saved: readonly MapChoice[];
  selectedMapId: string;
  /** Les cartes ne survivront pas à la fermeture (navigation privée). */
  volatileCache: boolean;
}

export interface PlaceScreenHandlers {
  onSearch(query: string): void;
  onPick(index: number): void;
  onMyPosition(): void;
  onRadius(radius: number): void;
  onSelectMap(id: string): void;
  onImaginary(): void;
  onBack(): void;
}

export class PlaceScreen extends Overlay {
  private readonly input: HTMLInputElement;
  private readonly searchButton: HTMLButtonElement;
  private readonly positionButton: HTMLButtonElement;
  private readonly radiusRow: HTMLElement;
  private readonly status: HTMLElement;
  private readonly results: HTMLElement;
  private readonly saved: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly handlers: PlaceScreenHandlers,
  ) {
    super(parent, 'overlay-menu overlay-place');
    const h = handlers;
    const content = el('div', 'menu-content');

    const form = el('form', 'place-form');
    form.setAttribute('role', 'search');
    this.input = el('input', 'place-input');
    this.input.type = 'search';
    this.input.enterKeyHint = 'search';
    this.input.autocomplete = 'street-address';
    this.input.placeholder = t('place.searchPlaceholder');
    this.input.setAttribute('aria-label', t('place.searchLabel'));
    this.input.maxLength = 200;
    this.searchButton = button(t('place.search'), 'button-primary place-search', () => {}, icons.search);
    this.searchButton.type = 'submit';
    form.append(this.input, this.searchButton);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.input.blur();
      h.onSearch(this.input.value);
    });

    this.positionButton = button(t('place.myPosition'), 'button-secondary place-position', h.onMyPosition, icons.locate);
    this.radiusRow = el('div', 'radius-row');
    this.radiusRow.setAttribute('role', 'radiogroup');
    this.radiusRow.setAttribute('aria-label', t('place.radius'));
    this.status = el('p', 'place-status');
    this.status.setAttribute('role', 'status');
    this.results = el('div', 'place-results');
    this.saved = el('div', 'place-saved');

    content.append(
      el('h2', 'title', escapeHtml(t('place.title'))),
      el('p', 'tagline small', escapeHtml(t('place.intro'))),
      form,
      this.positionButton,
      el('p', 'place-label', escapeHtml(t('place.radius'))),
      this.radiusRow,
      this.status,
      this.results,
      this.saved,
      button(t('place.imaginary'), 'button-secondary', h.onImaginary, icons.dice),
      el('p', 'attribution', escapeHtml(t('start.attribution'))),
      button(t('menu.back'), 'button-secondary', h.onBack),
    );
    this.panel.append(content);
  }

  /** Vide la recherche (nouvelle visite de l'écran). */
  reset(): void {
    this.input.value = '';
  }

  update(state: PlaceScreenState): void {
    const h = this.handlers;
    this.searchButton.disabled = state.busy !== null;
    this.positionButton.disabled = state.busy !== null;
    this.searchButton.querySelector('span')!.textContent = state.busy === 'search' ? t('place.searching') : t('place.search');
    this.positionButton.querySelector('span')!.textContent = state.busy === 'locate' ? t('place.locating') : t('place.myPosition');

    this.radiusRow.replaceChildren(
      ...state.radii.map((r) => {
        const option = button(t('place.radiusOption', { radius: r }), `radius-option${r === state.radius ? ' selected' : ''}`, () =>
          h.onRadius(r),
        );
        option.setAttribute('role', 'radio');
        option.setAttribute('aria-checked', String(r === state.radius));
        return option;
      }),
    );

    this.status.textContent = state.message?.text ?? '';
    this.status.classList.toggle('error', state.message?.error ?? false);

    this.results.replaceChildren();
    if (state.results.length > 0) {
      this.results.append(el('p', 'place-label', escapeHtml(t('place.results'))));
      state.results.forEach((r, i) => {
        const item = el(
          'button',
          'map-card place-result',
          `<strong>${escapeHtml(r.name)}</strong>${r.detail ? `<span>${escapeHtml(r.detail)}</span>` : ''}`,
        );
        item.type = 'button';
        item.addEventListener('click', () => h.onPick(i));
        this.results.append(item);
      });
    }

    this.saved.replaceChildren(
      el('h3', 'menu-subtitle', escapeHtml(t('place.saved'))),
      el('p', 'tagline small', escapeHtml(state.volatileCache ? t('place.cacheVolatile') : t('place.savedHelp'))),
      mapList(state.saved, state.selectedMapId, h.onSelectMap),
    );
  }
}
