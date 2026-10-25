import type { GameEvent } from '../game/events';
import { t } from '../i18n';
import type { Camera } from './camera';
import { liftPx } from './cityLayer';
import { enemySize, towerMuzzleHeight } from './sprites';
import { pickColor, theme } from './theme';

// Effets visuels éphémères déclenchés par les événements de la simulation.
// Ils vivent en temps de jeu (accélérés avec la vitesse, figés en pause).
// Aucun effet violent : un virus neutralisé se dissout en fines particules.

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
  /** Accélération verticale (px/s²) : négative = monte. */
  gravity: number;
  color: string;
  size: number;
  age: number;
  life: number;
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

interface Cloud {
  x: number;
  y: number;
  radius: number;
  age: number;
}

interface Beam {
  fromX: number;
  fromY: number;
  /** Hauteur du support de la tourelle (m) et type, pour partir de la lampe. */
  elevation: number;
  type: string;
  toX: number;
  toY: number;
  age: number;
}

const TEXT_LIFE = 1;
const CLOUD_LIFE = 0.9;
const BEAM_LIFE = 0.2;
const APPEAR_LIFE = 0.35;
const MAX_PARTICLES = 400;

export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private texts: FloatingText[] = [];
  private clouds: Cloud[] = [];
  private beams: Beam[] = [];
  private appearing = new Map<number, number>();
  /** Temps restant de la secousse de la jauge de la base. */
  baseShake = 0;
  private seed = 1;

  /**
   * @param elevationOf hauteur (m) du support d'une tourelle, pour partir du toit.
   * @param base point de la base et hauteur (m) du bâtiment.
   */
  consume(
    events: readonly GameEvent[],
    elevationOf: (towerId: number) => number,
    base: { x: number; y: number; height: number },
  ): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (e.towerType === 'pulverisateur') {
            this.rings.push({ x: e.fromX, y: e.fromY, z: elevationOf(e.towerId) + 5, radius: 4, world: false, color: theme.droplet.stroke, age: 0, life: 0.2 });
          }
          break;
        case 'beam':
          this.beams.push({ fromX: e.fromX, fromY: e.fromY, elevation: elevationOf(e.towerId), type: e.towerType, toX: e.toX, toY: e.toY, age: 0 });
          this.burst(e.toX, e.toY, 2, 5, () => theme.beam.core, 60, -40);
          break;
        case 'impact':
          if (e.radius > 0) {
            this.clouds.push({ x: e.x, y: e.y, radius: e.radius, age: 0 });
            this.burst(e.x, e.y, 1, 8, () => theme.cloud.edge, 70, -60);
          } else {
            this.rings.push({ x: e.x, y: e.y, z: 1.5, radius: 5, world: false, color: theme.droplet.stroke, age: 0, life: 0.25 });
          }
          break;
        case 'enemyDefeated':
          this.burst(e.x, e.y, 1.5, 12, (i) => pickColor(theme.dissolve, i), 55, -90);
          this.rings.push({ x: e.x, y: e.y, z: 1.5, radius: enemySize(e.enemyType) * 1.8, world: false, color: theme.cloud.edge, age: 0, life: 0.35 });
          this.texts.push({ x: e.x, y: e.y, z: 3, text: `+${e.reward}`, color: theme.coinText, age: 0 });
          break;
        case 'enemySplit':
          this.rings.push({ x: e.x, y: e.y, z: 2, radius: 14, world: true, color: theme.enemies.megavirus?.body ?? '#c0304a', age: 0, life: 0.5 });
          break;
        case 'baseHit':
          this.baseShake = 0.45;
          this.rings.push({ x: base.x, y: base.y, z: base.height, radius: 16, world: true, color: theme.damageText, age: 0, life: 0.5 });
          this.texts.push({ x: base.x, y: base.y, z: base.height + 6, text: t('fx.baseHit', { damage: e.damage }), color: theme.damageText, age: 0 });
          break;
        case 'towerPlaced':
          this.appearing.set(e.towerId, 0);
          break;
        case 'towerUpgraded': {
          this.appearing.set(e.towerId, APPEAR_LIFE * 0.4);
          break;
        }
        case 'towerSold':
          this.texts.push({ x: e.x, y: e.y, z: 4, text: `+${e.refund}`, color: theme.coinText, age: 0 });
          this.burst(e.x, e.y, 3, 8, () => theme.towerBody, 60, -50);
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

  private burst(x: number, y: number, z: number, count: number, color: (i: number) => string, speed: number, gravity: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.random() * Math.PI * 2;
      const v = speed * (0.4 + this.random() * 0.7);
      this.particles.push({
        x,
        y,
        z,
        ox: 0,
        oy: 0,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.6,
        gravity,
        color: color(i),
        size: 1.6 + this.random() * 1.6,
        age: 0,
        life: 0.5 + this.random() * 0.5,
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
      p.vy += p.gravity * dt;
      p.vx *= 1 - Math.min(1, dt * 2.5);
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
    for (const txt of this.texts) txt.age += dt;
    this.texts = this.texts.filter((txt) => txt.age < TEXT_LIFE);
    for (const c of this.clouds) c.age += dt;
    this.clouds = this.clouds.filter((c) => c.age < CLOUD_LIFE);
    for (const b of this.beams) b.age += dt;
    this.beams = this.beams.filter((b) => b.age < BEAM_LIFE);
    for (const [id, age] of this.appearing) {
      if (age >= APPEAR_LIFE) this.appearing.delete(id);
      else this.appearing.set(id, age + dt);
    }
    this.baseShake = Math.max(0, this.baseShake - dt);
  }

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.clouds = [];
    this.beams = [];
    this.appearing.clear();
    this.baseShake = 0;
  }

  /** Nuages désinfectants au sol (dessinés sous les virus). */
  drawGround(ctx: CanvasRenderingContext2D, cam: Camera): void {
    for (const c of this.clouds) {
      const k = c.age / CLOUD_LIFE;
      const r = c.radius * cam.scale * (0.55 + 0.45 * Math.min(1, k * 3));
      ctx.globalAlpha = 0.9 * (1 - k);
      ctx.fillStyle = theme.cloud.fill;
      ctx.beginPath();
      ctx.ellipse(cam.sx(c.x), cam.sy(c.y), r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = theme.cloud.edge;
      ctx.lineWidth = Math.max(1, 0.5 * cam.scale);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, unit: number): void {
    for (const b of this.beams) {
      const k = b.age / BEAM_LIFE;
      const x1 = cam.sx(b.fromX);
      const y1 = cam.sy(b.fromY) - liftPx(cam, b.elevation) - (towerMuzzleHeight(b.type) + 3) * unit;
      const x2 = cam.sx(b.toX);
      const y2 = cam.sy(b.toY) - 6 * unit;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = theme.beam.glow;
      ctx.lineWidth = 6 * unit;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.strokeStyle = theme.beam.core;
      ctx.lineWidth = 2 * unit;
      ctx.stroke();
    }

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
      ctx.beginPath();
      ctx.arc(x, y, (p.size * unit * (1 - k * 0.5)) / 2, 0, Math.PI * 2);
      ctx.fill();
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
