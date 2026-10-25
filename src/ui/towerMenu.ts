import type { Vec2 } from '../game/types';
import { t } from '../i18n';
import type { ViewRect } from '../render/camera';
import { el, escapeHtml, setText } from './dom';
import { icons } from './icons';
import { radialPositions } from './radialMenu';

/** Ce qu'affiche le menu d'une tourelle posée. */
export interface TowerMenuInfo {
  name: string;
  level: number;
  maxLevel: number;
  /** Portée effective (m), niveau et bonus de hauteur compris. */
  range: number;
  /** Bonus de hauteur (0,07 = +7 %) et hauteur du toit (m) ; null sur un socle. */
  roof: { bonus: number; height: number } | null;
  /** Coût de la prochaine amélioration, ou null au niveau maximal. */
  upgradeCost: number | null;
  sellValue: number;
}

export interface TowerMenuHandlers {
  onUpgrade(): void;
  onSell(): void;
}

/** Menu radial d'une tourelle posée : améliorer et vendre, avec sa fiche (niveau, portée). */
export class TowerMenu {
  readonly root: HTMLElement;
  private readonly upgrade: HTMLButtonElement;
  private readonly upgradeIcon: HTMLElement;
  private readonly upgradePrice: HTMLElement;
  private readonly upgradeLabel: HTMLElement;
  private readonly sell: HTMLButtonElement;
  private readonly sellPrice: HTMLElement;
  private readonly card: HTMLElement;
  private readonly cardTitle: HTMLElement;
  private readonly cardRange: HTMLElement;
  private readonly cardBonus: HTMLElement;
  private _towerId: number | null = null;
  private info: TowerMenuInfo | null = null;

  constructor(parent: HTMLElement, handlers: TowerMenuHandlers) {
    this.root = el('div', 'radial hidden');
    const button = (onClick: () => void) => {
      const b = el('button', 'radial-item');
      b.type = 'button';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      return b;
    };
    this.upgrade = button(() => handlers.onUpgrade());
    this.upgradeIcon = el('span', 'radial-icon radial-icon-small', icons.upgrade);
    this.upgradePrice = el('span', 'radial-price');
    this.upgradeLabel = el('span', 'radial-label');
    this.upgrade.append(this.upgradeIcon, this.upgradePrice, this.upgradeLabel);

    this.sell = button(() => handlers.onSell());
    this.sellPrice = el('span', 'radial-price radial-price-refund');
    this.sell.append(
      el('span', 'radial-icon radial-icon-small', icons.sell),
      this.sellPrice,
      el('span', 'radial-label', escapeHtml(t('tower.sell'))),
    );

    this.card = el('div', 'tower-card');
    this.cardTitle = el('strong');
    this.cardRange = el('span');
    this.cardBonus = el('small');
    this.card.append(this.cardTitle, this.cardRange, this.cardBonus);
    this.root.append(this.card, this.upgrade, this.sell);
    parent.append(this.root);
  }

  get towerId(): number | null {
    return this._towerId;
  }

  get isOpen(): boolean {
    return this._towerId !== null;
  }

  open(towerId: number, center: Vec2, view: ViewRect, info: TowerMenuInfo, money: number): void {
    this._towerId = towerId;
    const [a, b] = radialPositions(center, 2, view) as [Vec2, Vec2];
    this.upgrade.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -50%)`;
    this.sell.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -50%)`;
    // Fiche du côté opposé aux boutons.
    const mx = (a.x + b.x) / 2 - center.x;
    const my = (a.y + b.y) / 2 - center.y;
    const len = Math.hypot(mx, my) || 1;
    const cx = Math.min(Math.max(center.x - (mx / len) * 62, view.x + 90), view.x + view.width - 90);
    const cy = Math.min(Math.max(center.y - (my / len) * 62, view.y + 34), view.y + view.height - 34);
    this.card.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    this.update(info, money);
    this.root.classList.remove('hidden');
  }

  /** Met à jour la fiche et les boutons (argent, niveau) sans déplacer le menu. */
  update(info: TowerMenuInfo, money: number): void {
    this.info = info;
    setText(this.cardTitle, `${info.name} · ${t('tower.level', { level: info.level, max: info.maxLevel })}`);
    setText(this.cardRange, t('tower.range', { range: Math.round(info.range) }));
    setText(
      this.cardBonus,
      info.roof
        ? t('tower.heightBonus', { height: Math.round(info.roof.height), percent: Math.round(info.roof.bonus * 100) })
        : t('tower.padNoBonus'),
    );
    const maxed = info.upgradeCost === null;
    this.upgradeIcon.innerHTML = maxed ? icons.maxed : icons.upgrade;
    setText(this.upgradeLabel, t(maxed ? 'tower.maxLevel' : 'tower.upgrade'));
    this.upgradePrice.classList.toggle('hidden', maxed);
    if (!maxed) setText(this.upgradePrice, t('tower.cost', { cost: info.upgradeCost! }));
    this.upgrade.setAttribute(
      'aria-label',
      maxed ? t('tower.maxLevel') : `${t('tower.upgrade')} (${info.upgradeCost})`,
    );
    this.updateMoney(money);
    setText(this.sellPrice, `+${info.sellValue}`);
    this.sell.setAttribute('aria-label', `${t('tower.sell')} (+${info.sellValue})`);
  }

  updateMoney(money: number): void {
    const cost = this.info?.upgradeCost ?? null;
    const disabled = cost === null || money < cost;
    this.upgrade.classList.toggle('unaffordable', disabled);
    this.upgrade.setAttribute('aria-disabled', String(disabled));
  }

  close(): void {
    this._towerId = null;
    this.info = null;
    this.root.classList.add('hidden');
  }
}
