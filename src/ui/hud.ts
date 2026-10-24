import type { Game } from '../game/game';
import { t } from '../i18n';
import { el, setText } from './dom';
import { icons } from './icons';

export interface HudHandlers {
  onNextWave(): void;
  onSpeed(): void;
  onPause(): void;
}

/** Barre haute (pièces, parts de gâteau, vague, pause) et barre basse (vague suivante, vitesse). */
export class Hud {
  readonly top: HTMLElement;
  readonly bottom: HTMLElement;
  private readonly money: HTMLElement;
  private readonly hp: HTMLElement;
  private readonly hpStat: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly waveButton: HTMLButtonElement;
  private readonly waveLabel: HTMLElement;
  private readonly speedLabel: HTMLElement;

  constructor(parent: HTMLElement, handlers: HudHandlers) {
    this.top = el('header', 'hud hud-top');
    const stat = (cls: string, icon: string, label: string) => {
      const node = el('div', `stat ${cls}`, icon);
      node.setAttribute('aria-label', label);
      node.title = label;
      const value = el('span', 'stat-value');
      node.append(value);
      this.top.append(node);
      return { node, value };
    };
    this.money = stat('stat-money', icons.coin, t('hud.money')).value;
    const hp = stat('stat-hp', icons.cake, t('hud.base'));
    this.hp = hp.value;
    this.hpStat = hp.node;
    this.wave = stat('stat-wave', icons.flag, t('hud.wave')).value;

    const pause = el('button', 'icon-button', icons.pause);
    pause.type = 'button';
    pause.setAttribute('aria-label', t('hud.pause'));
    pause.addEventListener('click', handlers.onPause);
    this.top.append(pause);

    this.bottom = el('footer', 'hud hud-bottom');
    this.waveButton = el('button', 'button button-primary button-wave', icons.next);
    this.waveButton.type = 'button';
    this.waveLabel = el('span');
    this.waveButton.append(this.waveLabel);
    this.waveButton.addEventListener('click', handlers.onNextWave);

    const speed = el('button', 'button button-speed', icons.speed);
    speed.type = 'button';
    speed.setAttribute('aria-label', t('hud.speed'));
    this.speedLabel = el('span');
    speed.append(this.speedLabel);
    speed.addEventListener('click', handlers.onSpeed);

    this.bottom.append(this.waveButton, speed);
    parent.append(this.top, this.bottom);
  }

  update(game: Game, speed: number): void {
    setText(this.money, String(game.money));
    setText(this.hp, String(game.baseHp));
    this.hpStat.classList.toggle('stat-danger', game.baseHp <= game.baseMaxHp * 0.25);
    setText(this.wave, t('hud.waveValue', { current: game.wavesLaunched, total: game.totalWaves }));

    const canCall = game.canCallNextWave();
    let label: string;
    if (canCall) {
      label = t('hud.nextWaveIn', { seconds: Math.max(0, Math.ceil(game.nextWaveCountdown ?? 0)) });
    } else if (game.wavesLaunched >= game.totalWaves) {
      label = t('hud.lastWave');
    } else {
      label = t('hud.waveInProgress', { current: game.wavesLaunched });
    }
    setText(this.waveLabel, label);
    if (this.waveButton.disabled === canCall) this.waveButton.disabled = !canCall;
    setText(this.speedLabel, t('hud.speedValue', { speed }));
  }
}
