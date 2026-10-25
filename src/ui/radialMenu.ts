import type { Vec2 } from '../game/types';
import { t } from '../i18n';
import type { ViewRect } from '../render/camera';
import { el, escapeHtml } from './dom';

export interface RadialOption {
  id: string;
  label: string;
  /** Deuxième ligne de l'étiquette (rôle de la tourelle). */
  detail?: string;
  cost: number;
  iconHtml: string;
}

/** Encombrement d'un bouton autour de son centre (px), étiquette comprise. */
const HALF_WIDTH = 52;
const ABOVE = 36;
const BELOW = 66;

/** Arc large (4 boutons et plus) : écart entre deux boutons, hauteur des boutons extérieurs et du milieu (px). */
const ARC_STEP = 80;
const ARC_LOW = 58;
const ARC_HIGH = 82;
/** Demi-largeur d'un bouton de l'arc, étiquette comprise (px). */
const ARC_HALF_WIDTH = 42;

/**
 * Positions des boutons autour du point touché : on essaie d'abord au-dessus,
 * puis en dessous, à droite, à gauche, puis toutes les directions, et on garde
 * la première disposition qui tient entièrement dans la zone visible (à
 * défaut, celle qui déborde le moins, ramenée dans la zone). À partir de
 * 4 boutons, ils forment un arc large au-dessus (ou en dessous) du point.
 */
export function radialPositions(center: Vec2, count: number, view: ViewRect): Vec2[] {
  if (count >= 4) return arcPositions(center, count, view);
  const radius = count === 3 ? 82 : 74;
  const spread = ((count === 3 ? 78 : 95) * Math.PI) / 180;
  const preferred = [-90, 90, 0, 180, -45, -135, 45, 135];
  const all = [...preferred, ...Array.from({ length: 24 }, (_, i) => i * 15).filter((d) => !preferred.includes(d))];
  const directions = all.map((d) => (d * Math.PI) / 180);
  const layout = (direction: number) =>
    Array.from({ length: count }, (_, i) => {
      const a = direction + (i - (count - 1) / 2) * spread;
      return { x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius };
    });
  const overflow = (p: Vec2) =>
    Math.max(0, view.x - (p.x - HALF_WIDTH)) +
    Math.max(0, p.x + HALF_WIDTH - (view.x + view.width)) +
    Math.max(0, view.y - (p.y - ABOVE)) +
    Math.max(0, p.y + BELOW - (view.y + view.height));
  let best = layout(directions[0]!);
  let bestOverflow = Infinity;
  for (const direction of directions) {
    const positions = layout(direction);
    const total = positions.reduce((s, p) => s + overflow(p), 0);
    if (total === 0) return positions;
    if (total < bestOverflow) {
      best = positions;
      bestOverflow = total;
    }
  }
  // Rien ne tient (écran minuscule, coin de l'écran) : la disposition qui déborde le moins, ramenée dans la zone.
  return best.map((p) => ({
    x: Math.min(Math.max(p.x, view.x + HALF_WIDTH), view.x + view.width - HALF_WIDTH),
    y: Math.min(Math.max(p.y, view.y + ABOVE), view.y + view.height - BELOW),
  }));
}

/** Arc large : les boutons du milieu un peu plus loin du point que ceux des extrémités, groupe décalé pour tenir à l'écran. */
function arcPositions(center: Vec2, count: number, view: ViewRect): Vec2[] {
  const half = (count - 1) / 2;
  const offsets = Array.from({ length: count }, (_, i) => {
    const k = Math.abs(i - half);
    const lift = ARC_HIGH - ((ARC_HIGH - ARC_LOW) * (k - 0.5)) / Math.max(0.5, half - 0.5);
    return { x: (i - half) * ARC_STEP, y: Math.min(ARC_HIGH, lift) };
  });
  const minX = view.x + ARC_HALF_WIDTH - (center.x - half * ARC_STEP);
  const maxX = view.x + view.width - ARC_HALF_WIDTH - (center.x + half * ARC_STEP);
  const dx = minX > maxX ? (minX + maxX) / 2 : Math.min(Math.max(0, minX), maxX);
  const place = (sign: number) => offsets.map((o) => ({ x: center.x + o.x + dx, y: center.y + sign * o.y }));
  for (const sign of [-1, 1]) {
    const positions = place(sign);
    if (positions.every((p) => p.y - ABOVE >= view.y && p.y + BELOW <= view.y + view.height)) return positions;
  }
  return place(center.y - view.y > view.y + view.height - center.y ? -1 : 1).map((p) => ({
    x: p.x,
    y: Math.min(Math.max(p.y, view.y + ABOVE), view.y + view.height - BELOW),
  }));
}

/** Menu radial de construction ouvert sur un emplacement vide. */
export class RadialMenu {
  readonly root: HTMLElement;
  private readonly items: { option: RadialOption; button: HTMLButtonElement; price: HTMLElement; cost: number }[] = [];
  private _slotId: number | null = null;
  private lastMoney = -1;

  constructor(parent: HTMLElement, options: RadialOption[], onPick: (optionId: string) => void) {
    this.root = el('div', 'radial hidden');
    for (const option of options) {
      const detail = option.detail ? `<small>${escapeHtml(option.detail)}</small>` : '';
      const button = el(
        'button',
        'radial-item',
        `<span class="radial-icon">${option.iconHtml}</span>` +
          `<span class="radial-price">${escapeHtml(t('tower.cost', { cost: option.cost }))}</span>` +
          `<span class="radial-label">${escapeHtml(option.label)}${detail}</span>`,
      );
      button.type = 'button';
      button.setAttribute('aria-label', `${option.label} (${option.cost})`);
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(option.id);
      });
      this.items.push({ option, button, price: button.querySelector('.radial-price') as HTMLElement, cost: option.cost });
      this.root.append(button);
    }
    parent.append(this.root);
  }

  get slotId(): number | null {
    return this._slotId;
  }

  get isOpen(): boolean {
    return this._slotId !== null;
  }

  open(slotId: number, center: Vec2, view: ViewRect, money: number): void {
    this._slotId = slotId;
    const positions = radialPositions(center, this.items.length, view);
    this.items.forEach(({ button }, i) => {
      const p = positions[i]!;
      button.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    });
    this.lastMoney = -1;
    this.updateMoney(money);
    this.root.classList.remove('hidden');
  }

  close(): void {
    this._slotId = null;
    this.root.classList.add('hidden');
  }

  /** Grise les tours trop chères (elles restent touchables pour expliquer pourquoi). */
  updateMoney(money: number): void {
    if (money === this.lastMoney) return;
    this.lastMoney = money;
    for (const { button, cost } of this.items) {
      const affordable = money >= cost;
      button.classList.toggle('unaffordable', !affordable);
      button.setAttribute('aria-disabled', String(!affordable));
    }
  }

  /** Prix réels (un dispositif offert coûte 0) puis disponibilité selon l'argent. */
  updatePrices(costOf: (id: string) => number, money: number): void {
    let changed = false;
    for (const item of this.items) {
      const cost = costOf(item.option.id);
      if (cost === item.cost) continue;
      item.cost = cost;
      item.price.textContent = cost === 0 ? t('tower.free') : t('tower.cost', { cost });
      item.price.classList.toggle('radial-price-free', cost === 0);
      item.button.setAttribute('aria-label', `${item.option.label} (${cost === 0 ? t('tower.free') : cost})`);
      changed = true;
    }
    if (changed) this.lastMoney = -1;
    this.updateMoney(money);
  }
}
