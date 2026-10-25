import { t } from '../i18n';
import { el, escapeHtml } from './dom';
import { icons, viruses } from './icons';

/** Écran superposé (accueil, pause, fin de partie). */
export class Overlay {
  readonly root: HTMLElement;
  protected readonly panel: HTMLElement;

  constructor(parent: HTMLElement, className: string) {
    this.root = el('div', `overlay hidden ${className}`);
    this.panel = el('div', 'panel');
    this.root.append(this.panel);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  protected button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = el('button', `button ${className}`);
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }
}

export class PauseScreen extends Overlay {
  constructor(parent: HTMLElement, onResume: () => void, onRestart: () => void, onHome: () => void) {
    super(parent, 'overlay-pause');
    this.panel.append(
      el('h2', 'title', escapeHtml(t('pause.title'))),
      this.button(t('pause.resume'), 'button-primary button-large', onResume),
      this.button(t('pause.restart'), 'button-secondary', onRestart),
      this.button(t('pause.home'), 'button-secondary', onHome),
      el('p', 'tagline small', escapeHtml(t('pause.saved'))),
    );
  }
}

export interface EndResult {
  victory: boolean;
  score: number;
  wave: number;
  totalWaves: number;
  kills: number;
  baseHp: number;
  /** Gemmes gagnées par cette partie (doublées si la pub a été regardée). */
  gems: number;
  /** « Continuer » est proposé (défaite, une fois par partie). */
  canRevive: boolean;
  /** « Doubler les gemmes » est proposé (une fois par partie). */
  canDouble: boolean;
}

export interface EndHandlers {
  onReplay(): void;
  onHome(): void;
  onRevive(): void;
  onDouble(): void;
  onShare(): void;
}

export class EndScreen extends Overlay {
  private readonly content: HTMLElement;
  private readonly actions: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly handlers: EndHandlers,
  ) {
    super(parent, 'overlay-end');
    this.content = el('div');
    this.actions = el('div', 'end-actions');
    this.panel.append(this.content, this.actions);
  }

  showResult(r: EndResult): void {
    const row = (label: string, value: string | number) =>
      `<div class="end-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
    const subtitle = r.victory
      ? t('end.victoryText', { total: r.totalWaves })
      : t('end.defeatText', { wave: r.wave });
    this.root.classList.toggle('victory', r.victory);
    this.root.classList.toggle('defeat', !r.victory);
    this.content.innerHTML =
      `<div class="mascots">${r.victory ? icons.base.replace('<svg', '<svg class="end-base"') : viruses.join('')}</div>` +
      `<h2 class="title">${escapeHtml(t(r.victory ? 'end.victory' : 'end.defeat'))}</h2>` +
      `<p class="tagline">${escapeHtml(subtitle)}</p>` +
      `<div class="end-score"><span>${escapeHtml(t('end.score'))}</span><strong>${r.score}</strong></div>` +
      row(t('end.wave'), t('hud.waveValue', { current: r.wave, total: r.totalWaves })) +
      row(t('end.kills'), r.kills) +
      row(t('end.baseHp'), r.baseHp) +
      `<div class="end-gems">${icons.gem}<strong>${escapeHtml(t('end.gems', { gems: r.gems }))}</strong></div>`;
    const h = this.handlers;
    this.actions.replaceChildren();
    if (r.canRevive) this.actions.append(this.adButton(t('end.revive'), 'button-primary button-large', h.onRevive));
    if (r.canDouble && r.gems > 0) this.actions.append(this.adButton(t('end.double'), 'button-gold', h.onDouble));
    this.actions.append(
      this.button(t('end.replay'), r.canRevive ? 'button-secondary' : 'button-primary button-large', h.onReplay),
    );
    const links = el('div', 'menu-row');
    links.append(this.button(t('end.home'), 'button-secondary', h.onHome), this.button(t('end.share'), 'button-secondary', h.onShare));
    this.actions.append(links);
    this.show();
  }

  /** Bouton qui lance une pub récompensée (mention « pub » visible). */
  private adButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const b = this.button(label, className, onClick);
    b.append(el('span', 'ad-tag', escapeHtml(t('ad.tag'))));
    return b;
  }
}

export class ErrorScreen extends Overlay {
  private readonly message: HTMLElement;

  constructor(parent: HTMLElement) {
    super(parent, 'overlay-error');
    this.message = el('pre', 'error-message');
    this.panel.append(
      el('h2', 'title', escapeHtml(t('error.title'))),
      this.message,
      this.button(t('error.reload'), 'button-primary', () => location.reload()),
    );
  }

  showError(text: string): void {
    this.message.textContent = text;
    this.show();
  }
}

/** Message bref en haut de l'écran. */
export class Toast {
  private readonly root: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'toast');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    parent.append(this.root);
  }

  show(text: string, durationMs = 1600): void {
    this.root.textContent = text;
    this.root.classList.add('visible');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.root.classList.remove('visible'), durationMs);
  }

  hide(): void {
    if (this.timer) clearTimeout(this.timer);
    this.root.classList.remove('visible');
  }
}
