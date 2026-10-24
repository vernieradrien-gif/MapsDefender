import type { GameEvent } from '../game/events';
import type { Camera } from './camera';
import { theme } from './theme';

// Effets visuels éphémères déclenchés par les événements de la simulation.
// Ils vivent en temps de jeu (accélérés avec la vitesse, figés en pause).

interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  age: number;
  color: string;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  age: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  age: number;
}

const TRACER_LIFE = 0.07;
const RING_LIFE = 0.35;
const TEXT_LIFE = 0.9;
const MAX_ITEMS = 160;

export class Effects {
  private tracers: Tracer[] = [];
  private rings: Ring[] = [];
  private texts: FloatingText[] = [];
  /** Temps restant du flash rouge de la base touchée. */
  baseFlash = 0;

  consume(events: readonly GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (e.kind === 'hitscan') {
            push(this.tracers, {
              x1: e.fromX,
              y1: e.fromY,
              x2: e.toX,
              y2: e.toY,
              age: 0,
              color: theme.towers[e.towerType]?.color ?? theme.fallback,
            });
          }
          break;
        case 'explosion':
          push(this.rings, { x: e.x, y: e.y, radius: e.radius, age: 0 });
          break;
        case 'enemyKilled':
          push(this.texts, { x: e.x, y: e.y, text: `+${e.reward}`, age: 0 });
          break;
        case 'baseHit':
          this.baseFlash = 0.4;
          break;
        default:
          break;
      }
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.tracers = age(this.tracers, dt, TRACER_LIFE);
    this.rings = age(this.rings, dt, RING_LIFE);
    this.texts = age(this.texts, dt, TEXT_LIFE);
    this.baseFlash = Math.max(0, this.baseFlash - dt);
  }

  clear(): void {
    this.tracers = [];
    this.rings = [];
    this.texts = [];
    this.baseFlash = 0;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, unit: number): void {
    ctx.lineCap = 'round';
    for (const t of this.tracers) {
      ctx.globalAlpha = 1 - t.age / TRACER_LIFE;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1.6 * unit;
      ctx.beginPath();
      ctx.moveTo(camera.sx(t.x1), camera.sy(t.y1));
      ctx.lineTo(camera.sx(t.x2), camera.sy(t.y2));
      ctx.stroke();
    }

    for (const r of this.rings) {
      const k = r.age / RING_LIFE;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = theme.explosion;
      ctx.lineWidth = 3 * unit * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(camera.sx(r.x), camera.sy(r.y), r.radius * camera.scale * (0.4 + 0.6 * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.25;
      ctx.fillStyle = theme.explosion;
      ctx.fill();
    }

    ctx.font = `700 ${Math.round(12 * unit)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.moneyText;
    for (const t of this.texts) {
      const k = t.age / TEXT_LIFE;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillText(t.text, camera.sx(t.x), camera.sy(t.y) - 10 * unit - 18 * unit * k);
    }
    ctx.globalAlpha = 1;
  }
}

function push<T>(list: T[], item: T): void {
  if (list.length >= MAX_ITEMS) list.shift();
  list.push(item);
}

function age<T extends { age: number }>(list: T[], dt: number, life: number): T[] {
  for (const item of list) item.age += dt;
  return list.filter((item) => item.age < life);
}
