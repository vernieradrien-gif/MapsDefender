import { cylinder } from './cityLayer';
import { shade, theme } from './theme';

// Personnages et objets animés, dessinés en code (aucune image externe).
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
  /** 0 = vient de tirer, 1 = prête à tirer. */
  readiness: number;
  /** Animation d'apparition (0 à 1). */
  appear: number;
  time: number;
}

/** Tourelle sur sa plateforme ; (x, y) = haut du support (toit ou socle). */
export function drawTower(ctx: Ctx, x: number, y: number, u: number, look: TowerLook): void {
  const colors = theme.towers[look.type] ?? { main: theme.fallback, dark: '#999', accent: '#fff' };
  const s = u * (0.6 + 0.4 * easeOutBack(look.appear));
  const cos = Math.cos(look.angle);
  const sin = Math.sin(look.angle);

  // Plateforme.
  cylinder(ctx, x, y, 9 * s, 3 * s, '#ffffff', '#cfd6e2');
  const top = y - 3 * s;

  if (look.type === 'ballons') {
    // Lance-ballons : petite catapulte orange, bras tendu vers la cible.
    cylinder(ctx, x, top, 6.5 * s, 4 * s, colors.main, colors.dark);
    const cy = top - 4 * s;
    const armX = x + cos * 8 * s;
    const armY = cy + sin * 8 * s - 3 * s;
    ctx.strokeStyle = colors.dark;
    ctx.lineWidth = 2.6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(armX, armY);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(armX, armY, 3.4 * s, 0, Math.PI * 2);
    ctx.fill();
    if (look.readiness > 0.45) drawBalloon(ctx, armX, armY - 1.5 * s, s * 0.9);
    ctx.fillStyle = shade(colors.main, 0.35);
    ctx.beginPath();
    ctx.arc(x - 2 * s, cy - 2 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Lance-bulles : dôme turquoise et anneau à bulles orienté vers la cible.
  cylinder(ctx, x, top, 6 * s, 2.5 * s, colors.main, colors.dark);
  const cy = top - 2.5 * s;
  ctx.fillStyle = colors.main;
  ctx.beginPath();
  ctx.arc(x, cy, 5.2 * s, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = shade(colors.main, 0.45);
  ctx.beginPath();
  ctx.arc(x - 1.8 * s, cy - 2.2 * s, 1.6 * s, 0, Math.PI * 2);
  ctx.fill();
  const wandX = x + cos * 9 * s;
  const wandY = cy - 3 * s + sin * 9 * s;
  ctx.strokeStyle = colors.dark;
  ctx.lineWidth = 1.8 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, cy - 3 * s);
  ctx.lineTo(wandX, wandY);
  ctx.stroke();
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 1.7 * s;
  ctx.beginPath();
  ctx.arc(wandX, wandY, 3 * s, 0, Math.PI * 2);
  ctx.stroke();
  // Petites bulles qui flottent au-dessus.
  for (let i = 0; i < 2; i++) {
    const t = (look.time * 0.7 + i * 0.5) % 1;
    drawBubble(ctx, x + Math.sin(t * 6 + i) * 3 * s, cy - 6 * s - t * 10 * s, 1.6 * s * (1 - t * 0.5), 1 - t);
  }
}

export interface EnemyLook {
  type: string;
  /** Direction de marche (unitaire, à l'écran). */
  dirX: number;
  dirY: number;
  /** Phase d'animation propre à chaque Glouton. */
  phase: number;
  time: number;
  hpRatio: number;
}

/** Un Glouton : boule colorée qui sautille, avec des yeux qui regardent où il va. */
export function drawEnemy(ctx: Ctx, x: number, y: number, u: number, look: EnemyLook): void {
  const style = theme.enemies[look.type] ?? { body: theme.fallback, dark: '#888', size: 7 };
  const s = style.size * u;
  const speed = look.type === 'filou' ? 14 : look.type === 'bouboule' ? 6 : 9;
  const hop = Math.abs(Math.sin(look.time * speed + look.phase));
  const lift = hop * s * 0.55;
  const squash = 1 - hop;
  const rx = s * (1 + 0.14 * squash);
  const ry = s * (1 - 0.12 * squash);
  const by = y - lift - ry * 0.25;
  const dx = look.dirX;
  const dy = look.dirY;
  const px = -dy;
  const py = dx;

  // Ombre au sol.
  ctx.fillStyle = 'rgba(41, 64, 90, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.35, s * (0.95 - hop * 0.25), s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  // Oreilles du Filou.
  if (look.type === 'filou') {
    ctx.fillStyle = style.dark;
    for (const side of [-1, 1]) {
      const ex = x - dx * s * 0.2 + px * side * s * 0.55;
      const ey = by - dy * s * 0.2 + py * side * s * 0.55 - s * 0.55;
      ctx.beginPath();
      ctx.ellipse(ex, ey, s * 0.28, s * 0.55, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Corps.
  ctx.fillStyle = style.dark;
  ctx.beginPath();
  ctx.ellipse(x, by + ry * 0.12, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.body;
  ctx.beginPath();
  ctx.ellipse(x, by, rx * 0.97, ry * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.35, by - ry * 0.4, rx * 0.28, ry * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // Joues roses de la Bouboule.
  if (look.type === 'bouboule') {
    ctx.fillStyle = 'rgba(255, 110, 120, 0.45)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + dx * s * 0.35 + px * side * s * 0.62, by + dy * s * 0.35 + py * side * s * 0.62, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Yeux tournés vers la direction de marche.
  const eye = s * 0.3;
  for (const side of [-1, 1]) {
    const ex = x + dx * s * 0.32 + px * side * s * 0.34;
    const ey = by + dy * s * 0.32 + py * side * s * 0.34 - s * 0.12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, eye, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2d42';
    ctx.beginPath();
    ctx.arc(ex + dx * eye * 0.4, ey + dy * eye * 0.4, eye * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bouche gourmande.
  ctx.strokeStyle = '#2b2d42';
  ctx.lineWidth = Math.max(1, s * 0.12);
  ctx.lineCap = 'round';
  const mx = x + dx * s * 0.66;
  const my = by + dy * s * 0.66 + s * 0.08;
  const a = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.arc(mx - dx * s * 0.12, my - dy * s * 0.12, s * 0.22, a - 0.9, a + 0.9);
  ctx.stroke();

  // Jauge d'appétit (PV) si entamée.
  if (look.hpRatio < 1) {
    const w = s * 2;
    const h = Math.max(2.5, 3 * u);
    const top = by - ry - h - 4 * u;
    ctx.fillStyle = theme.hpBar.back;
    roundRect(ctx, x - w / 2 - 1, top - 1, w + 2, h + 2, h);
    ctx.fill();
    const r = Math.max(0, look.hpRatio);
    ctx.fillStyle = r > 0.6 ? theme.hpBar.good : r > 0.3 ? theme.hpBar.mid : theme.hpBar.low;
    roundRect(ctx, x - w / 2, top, w * r, h, h / 2);
    ctx.fill();
  }
}

export function drawBubble(ctx: Ctx, x: number, y: number, r: number, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = theme.bubble.fill;
  ctx.strokeStyle = theme.bubble.stroke;
  ctx.lineWidth = Math.max(1, r * 0.25);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme.bubble.shine;
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawBalloon(ctx: Ctx, x: number, y: number, u: number): void {
  const r = 3.8 * u;
  ctx.fillStyle = theme.balloon.dark;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.lineTo(x - r * 0.3, y + r * 1.35);
  ctx.lineTo(x + r * 0.3, y + r * 1.35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = theme.balloon.fill;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.88, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.32, y - r * 0.38, r * 0.22, r * 0.32, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Le gâteau du quartier : une part disparaît à chaque bouchée. */
export function drawCake(
  ctx: Ctx,
  x: number,
  y: number,
  u: number,
  slices: number,
  maxSlices: number,
  shake: number,
): void {
  const ox = x + Math.sin(shake * 60) * 2.5 * u * Math.min(1, shake * 3);
  const r = 17 * u;
  const h = 9 * u;
  const c = theme.cake;

  ctx.fillStyle = 'rgba(41, 64, 90, 0.2)';
  ctx.beginPath();
  ctx.ellipse(ox + 4 * u, y + 4 * u, r * 1.3, r * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  cylinder(ctx, ox, y, r * 1.25, 2 * u, c.plate, '#dfe3ea');

  const base = y - 2 * u;
  const top = base - h;
  // Une part par PV ; au-delà de 40 parts, le dessin devient proportionnel.
  const shownSlices = Math.max(1, Math.min(maxSlices, 40));
  const step = (Math.PI * 2) / shownSlices;
  const start = -Math.PI / 2;
  const remaining = Math.ceil((Math.max(0, Math.min(maxSlices, slices)) / Math.max(1, maxSlices)) * shownSlices);

  // Flanc visible (moitié sud), part par part.
  for (let i = 0; i < remaining; i++) {
    const a1 = start + i * step;
    const a2 = a1 + step;
    const s1 = Math.max(a1, 0);
    const s2 = Math.min(a2, Math.PI);
    if (s2 <= s1) continue;
    ctx.fillStyle = c.sponge;
    ctx.beginPath();
    ctx.arc(ox, base, r, s1, s2);
    ctx.arc(ox, top, r, s2, s1, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.cream;
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.arc(ox, base - h * 0.5, r, s1, s2);
    ctx.stroke();
  }

  // Dessus : glaçage rose, une part par PV.
  for (let i = 0; i < remaining; i++) {
    const a1 = start + i * step;
    ctx.fillStyle = c.frosting[i % 2] ?? '#ff9ec4';
    ctx.beginPath();
    ctx.moveTo(ox, top);
    ctx.arc(ox, top, r, a1, a1 + step + 0.01);
    ctx.closePath();
    ctx.fill();
  }
  // Rosaces de crème sur le bord.
  ctx.fillStyle = c.cream;
  for (let i = 0; i < remaining; i++) {
    const a = start + (i + 0.5) * step;
    ctx.beginPath();
    ctx.arc(ox + Math.cos(a) * r * 0.82, top + Math.sin(a) * r * 0.82, 1.7 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  // Miettes là où des parts ont été mangées.
  if (remaining < shownSlices) {
    ctx.fillStyle = c.crumbs;
    for (let i = remaining; i < shownSlices; i += 2) {
      const a = start + (i + 0.5) * step;
      ctx.beginPath();
      ctx.arc(ox + Math.cos(a) * r * 0.6, base - 1 + Math.sin(a) * r * 0.6, 1.1 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (remaining > 0) {
    ctx.fillStyle = c.cherry;
    ctx.beginPath();
    ctx.arc(ox, top - 2 * u, 3.4 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(ox - 1.1 * u, top - 3.2 * u, 1 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a8f3a';
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(ox, top - 5 * u);
    ctx.quadraticCurveTo(ox + 2 * u, top - 9 * u, ox + 4 * u, top - 9 * u);
    ctx.stroke();
  }
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
