import type { BuyCheck } from '../game/progression';
import { t } from '../i18n';
import type { MapRecord } from '../storage/progress';
import { el, escapeHtml } from './dom';
import { icons, towerIcon, viruses } from './icons';
import { Overlay } from './screens';

// Écrans de menu (§ 5) : accueil, améliorations permanentes, paramètres, aide.

export interface MapChoice {
  id: string;
  name: string;
  /** Ligne d'information (lieu réel, démo). */
  detail: string;
  record: MapRecord | null;
}

export interface HomeInfo {
  maps: MapChoice[];
  selectedMapId: string;
  gems: number;
  /** Partie sauvegardée à reprendre, ou null. */
  saved: { mapName: string; wave: number } | null;
  debugMoney: number | null;
  /** La carte réelle est invalide : la démo la remplace. */
  fallback: boolean;
}

export interface HomeHandlers {
  onPlay(): void;
  onResume(): void;
  onSelectMap(id: string): void;
  onUpgrades(): void;
  onSettings(): void;
  onHelp(): void;
}

const gemsBadge = (gems: number) =>
  `<span class="gems">${icons.gem}<strong>${gems}</strong><span class="sr-only">${escapeHtml(t('home.gems'))}</span></span>`;

function button(label: string, className: string, onClick: () => void, html = ''): HTMLButtonElement {
  const b = el('button', `button ${className}`, `${html}<span>${escapeHtml(label)}</span>`);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export class HomeScreen extends Overlay {
  private readonly content: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly handlers: HomeHandlers,
  ) {
    super(parent, 'overlay-start overlay-home');
    this.content = el('div', 'menu-content');
    this.panel.append(this.content);
  }

  update(info: HomeInfo): void {
    const h = this.handlers;
    this.content.replaceChildren();
    const header = el('div', 'home-header', gemsBadge(info.gems));
    this.content.append(
      header,
      el('div', 'mascots', viruses.map((m, i) => `<span class="mascot mascot-${i}">${m}</span>`).join('')),
      el('h1', 'title', escapeHtml(t('app.title'))),
      el('p', 'tagline', escapeHtml(t('app.tagline'))),
    );
    if (info.fallback) this.content.append(el('p', 'fallback-note', escapeHtml(t('start.fallback'))));

    const maps = el('div', 'home-maps');
    maps.setAttribute('role', 'radiogroup');
    maps.setAttribute('aria-label', t('home.chooseMap'));
    for (const map of info.maps) {
      const selected = map.id === info.selectedMapId;
      const record = map.record
        ? t('home.record', { wave: map.record.bestWave, score: map.record.bestScore })
        : t('home.noRecord');
      const card = el(
        'button',
        `map-card${selected ? ' selected' : ''}`,
        `<strong>${escapeHtml(map.name)}</strong><span>${escapeHtml(map.detail)}</span><small>${escapeHtml(record)}</small>`,
      );
      card.type = 'button';
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', String(selected));
      card.addEventListener('click', () => h.onSelectMap(map.id));
      maps.append(card);
    }
    this.content.append(maps);

    if (info.debugMoney !== null) {
      this.content.append(el('p', 'debug-note', escapeHtml(t('start.debug', { money: info.debugMoney }))));
    }
    if (info.saved) {
      this.content.append(
        button(t('home.resume', { map: info.saved.mapName, wave: info.saved.wave }), 'button-primary button-large', h.onResume),
        button(t('home.newGame'), 'button-secondary', h.onPlay),
      );
    } else {
      this.content.append(button(t('start.play'), 'button-primary button-large', h.onPlay));
    }
    const row = el('div', 'menu-row menu-row-icons');
    row.append(
      button(t('home.upgrades'), 'button-secondary', h.onUpgrades, icons.gem),
      button(t('home.settings'), 'button-secondary', h.onSettings, icons.gear),
      button(t('home.help'), 'button-secondary', h.onHelp, icons.help),
    );
    this.content.append(row, el('p', 'attribution', escapeHtml(t('start.attribution'))));
  }
}

export interface UpgradeView {
  id: string;
  name: string;
  description: string;
  level: number;
  maxLevel: number;
  cost: number | null;
  state: BuyCheck;
  /** Prérequis non atteint (texte), sinon null. */
  requires: string | null;
}

export class UpgradesScreen extends Overlay {
  private readonly content: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly handlers: { onBuy(id: string): void; onBack(): void },
  ) {
    super(parent, 'overlay-menu');
    this.content = el('div', 'menu-content');
    this.panel.append(this.content);
  }

  update(gems: number, upgrades: UpgradeView[]): void {
    this.content.replaceChildren(
      el('div', 'home-header', gemsBadge(gems)),
      el('h2', 'title', escapeHtml(t('upgrades.title'))),
      el('p', 'tagline small', escapeHtml(t('upgrades.intro'))),
    );
    for (const u of upgrades) {
      const card = el('div', `upgrade-card${u.state === 'locked' ? ' locked' : ''}`);
      const pips = Array.from({ length: u.maxLevel }, (_, i) => `<i class="${i < u.level ? 'on' : ''}"></i>`).join('');
      card.append(
        el(
          'div',
          'upgrade-text',
          `<strong>${escapeHtml(u.name)}</strong><span>${escapeHtml(u.description)}</span>` +
            `<span class="upgrade-pips" aria-label="${escapeHtml(t('tower.level', { level: u.level, max: u.maxLevel }))}">${pips}</span>` +
            (u.requires ? `<small>${escapeHtml(u.requires)}</small>` : ''),
        ),
      );
      const label = u.state === 'max' ? t('upgrades.max') : t('upgrades.buy', { cost: u.cost ?? 0 });
      const buy = button(label, 'button-primary button-buy', () => this.handlers.onBuy(u.id), u.state === 'max' ? '' : icons.gem);
      buy.disabled = u.state !== 'ok';
      card.append(buy);
      this.content.append(card);
    }
    this.content.append(button(t('menu.back'), 'button-secondary', this.handlers.onBack));
  }
}

export interface SettingsHandlers {
  onExport(): string;
  /** Renvoie vrai si le code a été accepté. */
  onImport(code: string): boolean;
  onReset(): void;
  /** Choix publicitaires (RGPD), seulement sur l'appli Android. */
  onPrivacyOptions: (() => void) | null;
  onBack(): void;
}

export class SettingsScreen extends Overlay {
  private readonly content: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly handlers: SettingsHandlers,
    private readonly version: string,
  ) {
    super(parent, 'overlay-menu');
    this.content = el('div', 'menu-content');
    this.panel.append(this.content);
  }

  override show(): void {
    this.render();
    super.show();
  }

  private render(): void {
    const h = this.handlers;
    const status = el('p', 'settings-status');
    status.setAttribute('role', 'status');
    const code = el('textarea', 'settings-code');
    code.rows = 3;
    code.setAttribute('aria-label', t('settings.codeLabel'));
    code.placeholder = t('settings.codePlaceholder');

    const exportButton = button(t('settings.export'), 'button-secondary', () => {
      code.value = h.onExport();
      code.select();
      void navigator.clipboard?.writeText(code.value).then(
        () => (status.textContent = t('settings.copied')),
        () => (status.textContent = t('settings.exported')),
      );
      status.textContent = t('settings.exported');
    });
    const importButton = button(t('settings.import'), 'button-secondary', () => {
      status.textContent = h.onImport(code.value) ? t('settings.imported') : t('settings.importFailed');
    });
    let armed = false;
    const reset = button(t('settings.reset'), 'button-danger', () => {
      if (!armed) {
        armed = true;
        reset.querySelector('span')!.textContent = t('settings.resetConfirm');
        return;
      }
      h.onReset();
      status.textContent = t('settings.resetDone');
      armed = false;
      reset.querySelector('span')!.textContent = t('settings.reset');
    });

    this.content.replaceChildren(
      el('h2', 'title', escapeHtml(t('settings.title'))),
      el('h3', 'menu-subtitle', escapeHtml(t('settings.progress'))),
      el('p', 'tagline small', escapeHtml(t('settings.progressHelp'))),
      code,
      el('div', 'menu-row'),
      status,
    );
    this.content.querySelector('.menu-row')!.append(exportButton, importButton);
    this.content.append(reset, el('h3', 'menu-subtitle', escapeHtml(t('settings.privacy'))));
    const privacy = el('a', 'button button-secondary', escapeHtml(t('settings.privacyPolicy')));
    privacy.href = 'confidentialite.html';
    privacy.target = '_blank';
    privacy.rel = 'noopener';
    this.content.append(privacy);
    if (h.onPrivacyOptions) this.content.append(button(t('settings.adChoices'), 'button-secondary', h.onPrivacyOptions));
    this.content.append(
      el('h3', 'menu-subtitle', escapeHtml(t('settings.about'))),
      el('p', 'about', escapeHtml(t('settings.aboutText', { version: this.version }))),
      el('p', 'attribution', escapeHtml(t('start.attribution'))),
      button(t('menu.back'), 'button-secondary', h.onBack),
    );
  }
}

export interface HelpTower {
  id: string;
  name: string;
  role: string;
  cost: number;
}

export class HelpScreen extends Overlay {
  constructor(parent: HTMLElement, towers: HelpTower[], onBack: () => void) {
    super(parent, 'overlay-menu');
    const step = (icon: string, key: string) =>
      `<li><span class="step-icon">${icon}</span><span>${escapeHtml(t(key))}</span></li>`;
    const content = el('div', 'menu-content');
    content.append(
      el('h2', 'title', escapeHtml(t('help.title'))),
      el(
        'ul',
        'steps',
        step(icons.marker, 'start.step1') +
          step(icons.entry, 'start.step2') +
          step(icons.base, 'start.step3') +
          step(icons.zoomIn, 'help.zoom') +
          step(icons.gem, 'help.gems'),
      ),
      el(
        'div',
        'start-towers',
        towers
          .map(
            (tower) =>
              `<div class="start-tower">${towerIcon(tower.id)}<span><strong>${escapeHtml(tower.name)}</strong>` +
              `<small>${escapeHtml(tower.role)}</small></span><em>${escapeHtml(t('tower.cost', { cost: tower.cost }))}</em></div>`,
          )
          .join(''),
      ),
      button(t('menu.back'), 'button-secondary', onBack),
    );
    this.panel.append(content);
  }
}
