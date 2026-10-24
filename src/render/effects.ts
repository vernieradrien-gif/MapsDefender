import type { GameEvent } from '../game/events';
import { t } from '../i18n';
import type { Camera } from './camera';
import { liftPx } from './cityLayer';
import { pickColor, theme } from './theme';

// Effets visuels éphémères déclenchés par les événements de la simulation.
// Ils vivent en temps de jeu (accélérés avec la vitesse, figés en pause).

interface Particle {
  /** Position d'origine (monde, m) et hauteur (m). */
  x: number;
  y: number;
  z: number;
  /** Décalage et vitesse à l'écran (px, px/s). */
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  spin: number;
  color: string;
  size: number;
  age: number;
  life: number;
  shape: 'rect' | 'drop';
}

interface Ring {
  x: number;
  y: number;
  z: number;
  /** Rayon final : en mètres si `world`, sinon en px (× facteur de taille). */
  radius: number;
  world: boolean;
  color: string;
  age: number;
  life: number;
}

interface FloatingText {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  age: number;
}

interface Puddle {
  x: number;
  y: number;
  radius: number;
  age: number;
}

const TEXT_LIFE = 1;
const PUDDLE_LIFE = 1.6;
const APPEAR_LIFE = 0.35;
const MAX_PARTICLES = 400;

export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private texts: FloatingText[] = [];
  private puddles: Puddle[] = [];
  private appearing = new Map<number, number>();
  /** Temps restant de la secousse du gâteau. */
  cakeShake = 0;
  private seed = 1;

  /**
   * @param elevationOf hauteur (m) du support d'une tourelle, pour partir du toit.
   * @param base position de la base (gâteau).
   */
  consume(events: readonly GameEvent[], elevationOf: (towerId: number) => number, base: { x: number; y: number }): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (e.towerType === 'bulles') {
            this.rings.push({ x: e.fromX, y: e.fromY, z: elevationOf(e.towerId) + 4, radius: 5, world: false, color: theme.bubble.stroke, age: 0, life: 0.25 });
          }
          break;
        case 'impact':
          if (e.radius > 0) {
            this.rings.push({ x: e.x, y: e.y, z: 0, radius: e.radius, world: true, color: theme.balloon.splash, age: 0, life: 0.4 });
            this.puddles.push({ x: e.x, y: e.y, radius: e.radius * 0.55, age: 0 });
            this.burst(e.x, e.y, 0.5, 10, () => theme.balloon.splash, 'drop', 90);
          } else {
            this.rings.push({ x: e.x, y: e.y, z: 1, radius: 7, world: false, color: theme.bubble.stroke, age: 0, life: 0.3 });
            this.burst(e.x, e.y, 1, 4, () => theme.bubble.stroke, 'drop', 50);
          }
          break;
        case 'enemyDefeated':
          this.burst(e.x, e.y, 1.5, 14, (i) => pickColor(theme.confetti, i), 'rect', 110);
          this.texts.push({ x: e.x, y: e.y, z: 3, text: `+${e.reward}`, color: theme.coinText, age: 0 });
          break;
        case 'baseHit':
          this.cakeShake = 0.45;
          this.burst(base.x, base.y, 5, 8, () => theme.cake.crumbs, 'rect', 70);
          this.texts.push({ x: base.x, y: base.y, z: 12, text: t('fx.yum'), color: '#ff6b8b', age: 0 });
          break;
        case 'towerPlaced':
          this.appearing.set(e.towerId, 0);
          break;
        default:
          break;
      }
    }
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private burst(
    x: number,
    y: number,
    z: number,
    count: number,
    color: (i: number) => string,
    shape: Particle['shape'],
    speed: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = this.random() * Math.PI * 2;
      const v = speed * (0.5 + this.random() * 0.7);
      this.particles.push({
        x,
        y,
        z,
        ox: 0,
        oy: 0,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.7 - speed * 0.8,
        spin: this.random() * Math.PI,
        color: color(i),
        size: shape === 'rect' ? 2.2 + this.random() * 1.6 : 1.6 + this.random() * 1.2,
        age: 0,
        life: 0.6 + this.random() * 0.5,
        shape,
      });
    }
  }

  /** Avancement (0 à 1) de l'animation d'apparition d'une tourelle. */
  appearProgress(towerId: number): number {
    const age = this.appearing.get(towerId);
    return age === undefined ? 1 : Math.min(1, age / APPEAR_LIFE);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    for (const p of this.particles) {
      p.age += dt;
      p.vy += 260 * dt;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      p.spin += dt * 8;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
    for (const txt of this.texts) txt.age += dt;
    this.texts = this.texts.filter((txt) => txt.age < TEXT_LIFE);
    for (const p of this.puddles) p.age += dt;
    this.puddles = this.puddles.filter((p) => p.age < PUDDLE_LIFE);
    for (const [id, age] of this.appearing) {
      if (age >= APPEAR_LIFE) this.appearing.delete(id);
      else this.appearing.set(id, age + dt);
    }
    this.cakeShake = Math.max(0, this.cakeShake - dt);
  }

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.puddles = [];
    this.appearing.clear();
    this.cakeShake = 0;
  }

  /** Flaques d'eau au sol (dessinées sous les personnages). */
  drawGround(ctx: CanvasRenderingContext2D, cam: Camera): void {
    for (const p of this.puddles) {
      const k = p.age / PUDDLE_LIFE;
      ctx.globalAlpha = 0.35 * (1 - k);
      ctx.fillStyle = theme.balloon.fill;
      ctx.beginPath();
      ctx.ellipse(cam.sx(p.x), cam.sy(p.y), p.radius * cam.scale, p.radius * cam.scale * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, unit: number): void {
    for (const r of this.rings) {
      const k = r.age / r.life;
      const radius = (r.world ? r.radius * cam.scale : r.radius * unit) * (0.35 + 0.65 * k);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = (3 * (1 - k) + 1) * unit;
      ctx.beginPath();
      ctx.ellipse(cam.sx(r.x), cam.sy(r.y) - liftPx(cam, r.z), radius, radius * (r.world ? 0.8 : 1), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const p of this.particles) {
      const k = p.age / p.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = p.color;
      const x = cam.sx(p.x) + p.ox * unit * 0.6;
      const y = cam.sy(p.y) - liftPx(cam, p.z) + p.oy * unit * 0.6;
      const s = p.size * unit;
      if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.spin);
        ctx.fillRect(-s / 2, -s / 4, s, s / 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.font = `700 ${Math.round(14 * unit)}px ${theme.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const txt of this.texts) {
      const k = txt.age / TEXT_LIFE;
      ctx.globalAlpha = 1 - k * k;
      const x = cam.sx(txt.x);
      const y = cam.sy(txt.y) - liftPx(cam, txt.z) - 8 * unit - 22 * unit * k;
      ctx.lineWidth = 3.5 * unit;
      ctx.strokeStyle = theme.textOutline;
      ctx.strokeText(txt.text, x, y);
      ctx.fillStyle = txt.color;
      ctx.fillText(txt.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
