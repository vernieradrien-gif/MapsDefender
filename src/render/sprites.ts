import { cylinder } from './cityLayer';
import { shade, theme } from './theme';

// Virus et dispositifs sanitaires, dessinés en code (aucune image externe).
// Les positions sont en pixels écran ; `u` est le facteur de taille.

type Ctx = CanvasRenderingContext2D;

/** Marqueur « + » d'un emplacement libre, posé sur un toit ou un socle. */
export function drawSlotMarker(ctx: Ctx, x: number, y: number, u: number, time: number, selected: boolean): void {
  const pulse = 1 + 0.08 * Math.sin(time * 4 + x * 0.05);
  const r = 5.6 * u * (selected ? 1.35 : pulse);
  ctx.fillStyle = theme.slotMarker.fill;
  ctx.strokeStyle = theme.slotMarker.ring;
  ctx.lineWidth = (selected ? 2.4 : 1.5) * u;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = theme.slotMarker.plus;
  ctx.lineWidth = 2 * u;
  ctx.lineCap = 'round';
  const p = r * 0.45;
  ctx.beginPath();
  ctx.moveTo(x - p, y);
  ctx.lineTo(x + p, y);
  ctx.moveTo(x, y - p);
  ctx.lineTo(x, y + p);
  ctx.stroke();
}

export interface TowerLook {
  type: string;
  angle: number;
  /** Niveau d'amélioration (pastilles dorées). */
  level: number;
  /** 0 = vient de tirer, 1 = prête à tirer. */
  readiness: number;
  /** Animation d'apparition (0 à 1). */
  appear: number;
  /** Champ actif (purificateur). */
  active: boolean;
  time: number;
}

/** Hauteur (px, à u = 1) du point d'où partent les tirs, au-dessus du support. */
export function towerMuzzleHeight(type: string): number {
  return type === 'laser' ? 16 : type === 'diffuseur' ? 9 : 10;
}

/** Dispositif sanitaire sur sa plateforme ; (x, y) = haut du support (toit ou socle). */
export function drawTower(ctx: Ctx, x: number, y: number, u: number, look: TowerLook): void {
  const colors = theme.towers[look.type] ?? { main: theme.fallback, dark: '#999', accent: '#2bb3a6' };
  const s = u * (0.6 + 0.4 * easeOutBack(look.appear));
  const cos = Math.cos(look.angle);
  const sin = Math.sin(look.angle);

  // Plateforme et niveau.
  cylinder(ctx, x, y, 9 * s, 3 * s, '#ffffff', '#cfd6e2');
  drawLevelPips(ctx, x, y + 1.2 * s, s, look.level);
  const top = y - 3 * s;

  if (look.type === 'diffuseur') {
    // Diffuseur : réservoir trapu et tube lanceur orienté vers la cible.
    cylinder(ctx, x, top, 6.5 * s, 4.5 * s, colors.main, colors.dark);
    band(ctx, x, top - 2.2 * s, 6.5 * s, colors.accent, s);
    const cy = top - 4.5 * s;
    const tx = x + cos * 7.5 * s;
    const ty = cy - 4 * s + sin * 5 * s;
    ctx.strokeStyle = theme.towerBodyDark;
    ctx.lineWidth = 4.2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    if (look.readiness > 0.5) drawCapsule(ctx, tx, ty - 1 * s, s * 0.8, look.angle);
    return;
  }

  if (look.type === 'laser') {
    // Laser UV : colonne blanche et lampe à lentille violette.
    cylinder(ctx, x, top, 4 * s, 9 * s, colors.main, colors.dark);
    band(ctx, x, top - 6 * s, 4 * s, theme.towerBody, s);
    const cy = top - 11 * s;
    const lx = x + cos * 4.5 * s;
    const ly = cy + sin * 3 * s;
    ctx.fillStyle = colors.main;
    ctx.strokeStyle = colors.dark;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.ellipse(x, cy, 5.2 * s, 3.6 * s, look.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const glow = 0.35 + 0.65 * look.readiness;
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, 2.4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = glow * 0.35;
    ctx.beginPath();
    ctx.arc(lx, ly, 4.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  if (look.type === 'purificateur') {
    // Purificateur : bloc rond à grilles et hélice qui tourne quand le champ agit.
    cylinder(ctx, x, top, 6.8 * s, 5 * s, colors.main, colors.dark);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 0.9 * s;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 2.2 * s, top - 0.8 * s);
      ctx.lineTo(x + i * 2.2 * s, top - 4 * s);
      ctx.stroke();
    }
    const cy = top - 5 * s;
    ctx.fillStyle = shade(colors.accent, 0.55);
    ctx.beginPath();
    ctx.ellipse(x, cy, 5.2 * s, 3.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const spin = look.time * (look.active ? 9 : 1.5);
    ctx.fillStyle = colors.accent;
    for (let k = 0; k < 3; k++) {
      const a = spin + (k * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 2.4 * s, cy + Math.sin(a) * 1.6 * s, 2.3 * s, 1 * s, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, cy, 1 * s, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Pulvérisateur : corps blanc à bande bleu-vert, buse orientée vers la cible.
  cylinder(ctx, x, top, 5.6 * s, 5 * s, colors.main, colors.dark);
  band(ctx, x, top - 2.4 * s, 5.6 * s, colors.accent, s);
  const cy = top - 5 * s;
  ctx.fillStyle = colors.main;
  ctx.beginPath();
  ctx.arc(x, cy, 4.6 * s, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = colors.dark;
  ctx.lineWidth = 0.8 * s;
  ctx.stroke();
  const nx = x + cos * 8 * s;
  const ny = cy - 2.5 * s + sin * 6 * s;
  ctx.strokeStyle = theme.towerBodyDark;
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, cy - 2.5 * s);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(nx, ny, 1.8 * s, 0, Math.PI * 2);
  ctx.fill();
}

/** Bande colorée autour d'un corps cylindrique (moitié visible). */
function band(ctx: Ctx, x: number, y: number, r: number, color: string, s: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.arc(x, y, r, 0.1, Math.PI - 0.1);
  ctx.stroke();
}

function drawLevelPips(ctx: Ctx, x: number, y: number, s: number, level: number): void {
  for (let i = 0; i < level; i++) {
    const px = x + (i - (level - 1) / 2) * 4.2 * s;
    ctx.fillStyle = theme.levelPip;
    ctx.strokeStyle = shade(theme.levelPip, -0.35);
    ctx.lineWidth = 0.7 * s;
    ctx.beginPath();
    ctx.arc(px, y, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export interface EnemyLook {
  type: string;
  /** Phase d'animation propre à chaque virus. */
  phase: number;
  time: number;
  hpRatio: number;
  /** Ralenti par un purificateur. */
  slowed: boolean;
}

/** Taille (px à u = 1) d'un virus, pour placer les effets au bon endroit. */
export function enemySize(type: string): number {
  return theme.enemies[type]?.size ?? 7;
}

/** Virus stylisé : sphère hérissée de pointes qui tourne lentement en flottant. */
export function drawEnemy(ctx: Ctx, x: number, y: number, u: number, look: EnemyLook): void {
  const style = theme.enemies[look.type] ?? { body: theme.fallback, dark: '#888', spikes: 10, size: 7 };
  const s = style.size * u;
  const bob = Math.sin(look.time * 3 + look.phase) * s * 0.12;
  const cy = y - s * 0.75 + bob;
  const spin = look.time * (look.type === 'variant' ? 1.6 : 0.6) + look.phase;

  // Ombre au sol.
  ctx.fillStyle = 'rgba(41, 64, 90, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.15, s * 0.95, s * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  if (look.type === 'megavirus') {
    const glow = 0.25 + 0.15 * Math.sin(look.time * 4);
    ctx.fillStyle = `rgba(192, 48, 74, ${glow})`;
    ctx.beginPath();
    ctx.arc(x, cy, s * 1.65, 0, Math.PI * 2);
    ctx.fill();
  }

  if (look.type === 'amas') {
    // Amas : trois sphères agglomérées.
    for (let k = 0; k < 3; k++) {
      const a = spin * 0.5 + (k * Math.PI * 2) / 3;
      spikyBall(ctx, x + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.36, s * 0.6, 7, spin + k, style.body, style.dark);
    }
  } else {
    spikyBall(ctx, x, cy, s, style.spikes, spin, style.body, style.dark);
  }

  if (look.type === 'blinde') {
    // Blindé : capside épaisse en plaques.
    ctx.strokeStyle = shade(style.dark, -0.25);
    ctx.lineWidth = s * 0.22;
    ctx.beginPath();
    ctx.arc(x, cy, s * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(1, s * 0.06);
    for (let k = 0; k < 6; k++) {
      const a = spin + (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * s * 0.6, cy + Math.sin(a) * s * 0.6);
      ctx.lineTo(x + Math.cos(a) * s * 0.84, cy + Math.sin(a) * s * 0.84);
      ctx.stroke();
    }
  }
  if (look.type === 'megavirus') {
    // Noyau du Méga-virus.
    ctx.fillStyle = shade(style.dark, -0.2);
    ctx.beginPath();
    ctx.arc(x, cy, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 230, 0.6)';
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.beginPath();
    ctx.arc(x, cy, s * 0.42, spin, spin + Math.PI * 1.2);
    ctx.stroke();
  }

  if (look.slowed) {
    ctx.strokeStyle = theme.slowTint;
    ctx.lineWidth = Math.max(1.5, s * 0.14);
    ctx.setLineDash([s * 0.35, s * 0.25]);
    ctx.beginPath();
    ctx.arc(x, cy, s * 1.3, spin, spin + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Jauge de PV si entamée (toujours pour le boss).
  if (look.hpRatio < 1 || look.type === 'megavirus') {
    const w = Math.max(s * 2, 16 * u);
    const h = Math.max(2.5, 3 * u);
    const barTop = cy - s * 1.45 - h - 2 * u;
    ctx.fillStyle = theme.hpBar.back;
    roundRect(ctx, x - w / 2 - 1, barTop - 1, w + 2, h + 2, h);
    ctx.fill();
    const r = Math.max(0, look.hpRatio);
    ctx.fillStyle = r > 0.6 ? theme.hpBar.good : r > 0.3 ? theme.hpBar.mid : theme.hpBar.low;
    roundRect(ctx, x - w / 2, barTop, w * r, h, h / 2);
    ctx.fill();
  }
}

/** Sphère à pointes terminées par une petite boule (protéines de surface). */
function spikyBall(ctx: Ctx, x: number, y: number, r: number, spikes: number, spin: number, body: string, dark: string): void {
  // Un seul tracé pour toutes les pointes, un seul pour les boules (rapide avec 150 virus).
  ctx.strokeStyle = dark;
  ctx.fillStyle = dark;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k < spikes; k++) {
    const a = spin + (k * Math.PI * 2) / spikes;
    ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    ctx.lineTo(x + Math.cos(a) * r * 1.28, y + Math.sin(a) * r * 1.28);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < spikes; k++) {
    const a = spin + (k * Math.PI * 2) / spikes;
    const kx = x + Math.cos(a) * r * 1.33;
    const ky = y + Math.sin(a) * r * 1.33;
    ctx.moveTo(kx + r * 0.15, ky);
    ctx.arc(kx, ky, r * 0.15, 0, Math.PI * 2);
  }
  ctx.moveTo(x + r, y + r * 0.06);
  ctx.arc(x, y + r * 0.06, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.94, 0, Math.PI * 2);
  ctx.fill();
  // Taches et reflet.
  ctx.fillStyle = spotColor(body);
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = spin * 0.7 + k * 2.1;
    const sx = x + Math.cos(a) * r * 0.42;
    const sy = y + Math.sin(a) * r * 0.42;
    ctx.moveTo(sx + r * 0.17, sy);
    ctx.arc(sx, sy, r * 0.17, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.17, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

const spots = new Map<string, string>();
/** Couleur des taches (mise en cache : `shade` n'est pas gratuit à chaque image). */
function spotColor(body: string): string {
  let c = spots.get(body);
  if (!c) {
    c = shade(body, -0.15);
    spots.set(body, c);
  }
  return c;
}

/** Gouttelette désinfectante du pulvérisateur. */
export function drawDroplet(ctx: Ctx, x: number, y: number, r: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = theme.droplet.fill;
  ctx.strokeStyle = theme.droplet.stroke;
  ctx.lineWidth = Math.max(1, r * 0.3);
  ctx.beginPath();
  ctx.moveTo(r * 1.6, 0);
  ctx.quadraticCurveTo(0, -r, -r * 0.8, 0);
  ctx.quadraticCurveTo(0, r, r * 1.6, 0);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Capsule du diffuseur (gélule blanche à bande bleue). */
export function drawCapsule(ctx: Ctx, x: number, y: number, u: number, angle: number): void {
  const len = 4.2 * u;
  const r = 1.9 * u;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = theme.capsule.fill;
  ctx.strokeStyle = shade(theme.capsule.band, -0.2);
  ctx.lineWidth = Math.max(1, 0.5 * u);
  roundRect(ctx, -len / 2, -r, len, r * 2, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme.capsule.band;
  ctx.beginPath();
  ctx.roundRect(0, -r, len / 2, r * 2, [0, r, r, 0]);
  ctx.fill();
  ctx.restore();
}

/** Jauge de PV au-dessus du bâtiment à protéger. */
export function drawBaseGauge(
  ctx: Ctx,
  x: number,
  y: number,
  u: number,
  hp: number,
  maxHp: number,
  shake: number,
): void {
  const ox = x + Math.sin(shake * 60) * 2.5 * u * Math.min(1, shake * 3);
  const w = 66 * u;
  const h = 11 * u;
  const left = ox - w / 2 + 6 * u;
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  // Pastille à croix.
  ctx.fillStyle = 'rgba(40, 50, 70, 0.75)';
  roundRect(ctx, left - 1.5 * u, y - h / 2 - 1.5 * u, w + 3 * u, h + 3 * u, h);
  ctx.fill();
  ctx.fillStyle = ratio > 0.5 ? theme.hpBar.good : ratio > 0.25 ? theme.hpBar.mid : theme.hpBar.low;
  roundRect(ctx, left, y - h / 2, w * ratio, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(left - 3 * u, y, 9 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.base.roof;
  ctx.lineWidth = 1.6 * u;
  ctx.stroke();
  ctx.fillStyle = theme.base.roof;
  ctx.fillRect(left - 4.6 * u, y - 5 * u, 3.2 * u, 10 * u);
  ctx.fillRect(left - 8 * u, y - 1.6 * u, 10 * u, 3.2 * u);
  ctx.font = `700 ${Math.round(9.5 * u)}px ${theme.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${hp}/${maxHp}`, left + w / 2 + 2 * u, y + 0.5 * u);
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, h / 2, Math.max(0, w) / 2));
}

function easeOutBack(t: number): number {
  const c = 1.7;
  const x = Math.min(Math.max(t, 0), 1) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}
