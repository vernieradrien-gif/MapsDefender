import type { Vec2 } from '../game/types';
import { t } from '../i18n';
import type { ViewRect } from '../render/camera';
import { el, escapeHtml } from './dom';

export interface RadialOption {
  id: string;
  label: string;
  cost: number;
  iconHtml: string;
}

/** Rayon du cercle sur lequel sont disposés les boutons (px). */
const RADIUS = 66;
/** Demi-taille d'un bouton avec son étiquette (px). */
const BUTTON_HALF = 34;
const SPREAD = (62 * Math.PI) / 180;

/**
 * Positions des boutons autour du point touché : on essaie d'abord au-dessus,
 * puis en dessous, à droite, à gauche, et on garde la première disposition qui
 * tient entièrement dans la zone visible.
 */
export function radialPositions(center: Vec2, count: number, view: ViewRect): Vec2[] {
  const directions = [-90, 90, 0, 180, -45, -135, 45, 135].map((d) => (d * Math.PI) / 180);
  const layout = (direction: number) =>
    Array.from({ length: count }, (_, i) => {
      const a = direction + (i - (count - 1) / 2) * SPREAD;
      return { x: center.x + Math.cos(a) * RADIUS, y: center.y + Math.sin(a) * RADIUS };
    });
  const fits = (p: Vec2) =>
    p.x - BUTTON_HALF >= view.x &&
    p.x + BUTTON_HALF <= view.x + view.width &&
    p.y - BUTTON_HALF >= view.y &&
    p.y + BUTTON_HALF <= view.y + view.height;
  for (const direction of directions) {
    const positions = layout(direction);
    if (positions.every(fits)) return positions;
  }
  // Rien ne tient (écran minuscule) : au-dessus, ramené dans la zone visible.
  return layout(directions[0]!).map((p) => ({
    x: Math.min(Math.max(p.x, view.x + BUTTON_HALF), view.x + view.width - BUTTON_HALF),
    y: Math.min(Math.max(p.y, view.y + BUTTON_HALF), view.y + view.height - BUTTON_HALF),
  }));
}

/** Menu radial de construction ouvert sur un emplacement vide. */
export class RadialMenu {
  readonly root: HTMLElement;
  private readonly items: { option: RadialOption; button: HTMLButtonElement }[] = [];
  private _slotId: number | null = null;
  private lastMoney = -1;

  constructor(parent: HTMLElement, options: RadialOption[], onPick: (optionId: string) => void) {
    this.root = el('div', 'radial hidden');
    for (const option of options) {
      const button = el(
        'button',
        'radial-item',
        `<span class="radial-icon">${option.iconHtml}</span>` +
          `<span class="radial-price">${escapeHtml(t('tower.cost', { cost: option.cost }))}</span>` +
          `<span class="radial-label">${escapeHtml(option.label)}</span>`,
      );
      button.type = 'button';
      button.setAttribute('aria-label', `${option.label} (${option.cost})`);
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(option.id);
      });
      this.items.push({ option, button });
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
    for (const { option, button } of this.items) {
      const affordable = money >= option.cost;
      button.classList.toggle('unaffordable', !affordable);
      button.setAttribute('aria-disabled', String(!affordable));
    }
  }
}
