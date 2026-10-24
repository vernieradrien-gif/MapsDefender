import { t } from '../i18n';
import { el, escapeHtml } from './dom';
import { icons, mascots, towerIcon } from './icons';

/** Écran superposé (accueil, pause, fin de partie). */
class Overlay {
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

export class StartScreen extends Overlay {
  private readonly debugNote: HTMLElement;

  constructor(parent: HTMLElement, onPlay: () => void) {
    super(parent, 'overlay-start');
    const step = (icon: string, key: string) =>
      `<li><span class="step-icon">${icon}</span><span>${escapeHtml(t(key))}</span></li>`;
    this.panel.append(
      el('div', 'mascots', mascots.map((m, i) => `<span class="mascot mascot-${i}">${m}</span>`).join('')),
      el('h1', 'title', escapeHtml(t('app.title'))),
      el('p', 'tagline', escapeHtml(t('app.tagline'))),
      el(
        'ul',
        'steps',
        step(icons.marker, 'start.step1') + step(icons.arrow, 'start.step2') + step(icons.cake, 'start.step3'),
      ),
      el('div', 'start-towers', towerIcon('bulles') + towerIcon('ballons')),
    );
    this.debugNote = el('p', 'debug-note hidden');
    this.panel.append(this.debugNote, this.button(t('start.play'), 'button-primary button-large', onPlay));
  }

  setDebugMoney(money: number | null): void {
    this.debugNote.classList.toggle('hidden', money === null);
    if (money !== null) this.debugNote.textContent = t('start.debug', { money });
  }
}

export class PauseScreen extends Overlay {
  constructor(parent: HTMLElement, onResume: () => void, onRestart: () => void) {
    super(parent, 'overlay-pause');
    this.panel.append(
      el('h2', 'title', escapeHtml(t('pause.title'))),
      this.button(t('pause.resume'), 'button-primary button-large', onResume),
      this.button(t('pause.restart'), 'button-secondary', onRestart),
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
}

export class EndScreen extends Overlay {
  private readonly content: HTMLElement;

  constructor(parent: HTMLElement, onReplay: () => void) {
    super(parent, 'overlay-end');
    this.content = el('div');
    this.panel.append(this.content, this.button(t('end.replay'), 'button-primary button-large', onReplay));
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
      `<div class="mascots">${r.victory ? icons.cake.replace('<svg', '<svg class="end-cake"') : mascots.join('')}</div>` +
      `<h2 class="title">${escapeHtml(t(r.victory ? 'end.victory' : 'end.defeat'))}</h2>` +
      `<p class="tagline">${escapeHtml(subtitle)}</p>` +
      `<div class="end-score"><span>${escapeHtml(t('end.score'))}</span><strong>${r.score}</strong></div>` +
      row(t('end.wave'), t('hud.waveValue', { current: r.wave, total: r.totalWaves })) +
      row(t('end.kills'), r.kills) +
      row(t('end.baseHp'), r.baseHp);
    this.show();
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
