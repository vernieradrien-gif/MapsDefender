import { PreparedPath, distanceToPolyline } from '../game/path';
import { Rng } from '../game/rng';
import type { Area, Building, GameMap, Street, Tree, Vec2 } from '../game/types';
import type { Camera } from './camera';
import { pickColor, shade, theme } from './theme';

// Dessin du décor fixe de la ville (une seule fois par redimensionnement) :
// sol, parcs, eau, rues, marquage du chemin, ombres, bâtiments, arbres, socles.

export interface CityView {
  ctx: CanvasRenderingContext2D;
  cam: Camera;
  /** Facteur de taille des objets. */
  unit: number;
  width: number;
  height: number;
  /** Canvas de travail pour les ombres (même taille que la cible). */
  shadowCanvas: HTMLCanvasElement;
  dpr: number;
}

/** Décalage vertical à l'écran (px) d'un point situé à `h` mètres de hauteur. */
export const liftPx = (cam: Camera, h: number) => h * theme.heightFactor * cam.scale;

/** Hauteur à l'écran (px) du dessus d'un socle (exagérée pour rester visible). */
export const padTopPx = (cam: Camera, elevation: number) => Math.max(2, liftPx(cam, elevation) * 3);

export function drawCity(view: CityView, map: GameMap): void {
  const { ctx } = view;
  drawGround(view, map);
  for (const area of map.areas) if (area.kind === 'park') drawPark(view, area, map);
  for (const area of map.areas) if (area.kind === 'water') drawWater(view, area);
  drawStreets(view, map);
  for (const area of map.areas) if (area.kind === 'plaza') drawPlaza(view, area);
  drawRoute(view, map);
  for (const slot of map.slots) if (slot.kind === 'pad') drawPad(view, slot, slot.elevation);
  drawShadows(view, map);

  // Objets en relief, du nord vers le sud (les plus proches de la caméra en dernier).
  const objects: { depth: number; draw: () => void }[] = [
    ...map.buildings.map((b) => ({
      depth: Math.max(...b.footprint.map((p) => p.y)),
      draw: () => drawBuilding(view, b),
    })),
    ...map.trees.map((t) => ({ depth: t.y + t.radius * 0.3, draw: () => drawTree(view, t) })),
  ];
  objects.sort((a, b) => a.depth - b.depth);
  for (const o of objects) o.draw();
  ctx.globalAlpha = 1;
}

// --- Sol, parcs, eau, place ------------------------------------------------

function drawGround(view: CityView, map: GameMap): void {
  const { ctx, width, height } = view;
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, width, height);
  // Herbe tachetée (déterministe).
  const rng = new Rng(map.seed ^ 0x9e3779b9);
  ctx.fillStyle = theme.groundSpeckle;
  const count = Math.round((width * height) / 900);
  for (let i = 0; i < count; i++) {
    const x = rng.next() * width;
    const y = rng.next() * height;
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + rng.next() * 3, 1 + rng.next() * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function polygonPath(view: CityView, poly: readonly Vec2[], lift = 0): void {
  const { ctx, cam } = view;
  ctx.beginPath();
  poly.forEach((p, i) => {
    const x = cam.sx(p.x);
    const y = cam.sy(p.y) - lift;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function polylinePath(view: CityView, points: readonly Vec2[]): void {
  const { ctx, cam } = view;
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(cam.sx(p.x), cam.sy(p.y));
    else ctx.lineTo(cam.sx(p.x), cam.sy(p.y));
  });
}

function bbox(poly: readonly Vec2[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function drawPark(view: CityView, park: Area, map: GameMap): void {
  const { ctx, cam } = view;
  polygonPath(view, park.polygon);
  ctx.fillStyle = theme.park;
  ctx.fill();
  ctx.lineWidth = 1.5 * cam.scale;
  ctx.strokeStyle = theme.parkEdge;
  ctx.stroke();

  // Allée : un tour de l'étang s'il y en a un, reliée aux bords du parc.
  const b = bbox(park.polygon);
  const water = map.areas.find((a) => {
    if (a.kind !== 'water') return false;
    const w = bbox(a.polygon);
    return w.minX >= b.minX && w.maxX <= b.maxX && w.minY >= b.minY && w.maxY <= b.maxY;
  });
  ctx.strokeStyle = theme.parkPath;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.6 * cam.scale;
  if (water) {
    const w = bbox(water.polygon);
    const cx = (w.minX + w.maxX) / 2;
    const cy = (w.minY + w.maxY) / 2;
    const rx = (w.maxX - w.minX) / 2 + 5;
    const ry = (w.maxY - w.minY) / 2 + 5;
    ctx.beginPath();
    ctx.ellipse(cam.sx(cx), cam.sy(cy), rx * cam.scale, ry * cam.scale, 0, 0, Math.PI * 2);
    ctx.moveTo(cam.sx(b.minX), cam.sy(cy));
    ctx.lineTo(cam.sx(cx - rx), cam.sy(cy));
    ctx.moveTo(cam.sx(cx), cam.sy(cy + ry));
    ctx.quadraticCurveTo(cam.sx(cx + 4), cam.sy(b.maxY - 6), cam.sx(cx + 10), cam.sy(b.maxY));
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cam.sx(b.minX), cam.sy(b.minY + 4));
    ctx.quadraticCurveTo(cam.sx((b.minX + b.maxX) / 2), cam.sy(b.maxY), cam.sx(b.maxX), cam.sy(b.maxY - 4));
    ctx.stroke();
  }

  // Massifs de fleurs.
  const rng = new Rng(Math.round(b.minX * 31 + b.minY * 17));
  for (let i = 0; i < 5; i++) {
    const x = b.minX + 6 + rng.next() * (b.maxX - b.minX - 12);
    const y = b.minY + 6 + rng.next() * (b.maxY - b.minY - 12);
    if (water && distanceToPolyline({ x, y }, [...water.polygon, water.polygon[0]!]) < 8) continue;
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = pickColor(theme.confetti, Math.floor(rng.next() * 6));
      ctx.beginPath();
      ctx.arc(cam.sx(x + rng.range(-2.5, 2.5)), cam.sy(y + rng.range(-1.5, 1.5)), 0.7 * cam.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWater(view: CityView, water: Area): void {
  const { ctx, cam } = view;
  polygonPath(view, water.polygon);
  ctx.fillStyle = theme.waterRim;
  ctx.lineWidth = 2.4 * cam.scale;
  ctx.strokeStyle = theme.waterRim;
  ctx.stroke();
  ctx.fillStyle = theme.water;
  ctx.fill();
  // Reflets.
  const b = bbox(water.polygon);
  const cx = cam.sx((b.minX + b.maxX) / 2);
  const cy = cam.sy((b.minY + b.maxY) / 2);
  const rx = ((b.maxX - b.minX) / 2) * cam.scale;
  const ry = ((b.maxY - b.minY) / 2) * cam.scale;
  ctx.fillStyle = theme.waterDeep;
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.1, cy + ry * 0.15, rx * 0.6, ry * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.6 * cam.scale;
  ctx.lineCap = 'round';
  for (const [dx, dy, w] of [[-0.45, -0.35, 0.25], [0.2, -0.5, 0.18], [0.35, 0.3, 0.2]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + rx * dx, cy + ry * dy);
    ctx.lineTo(cx + rx * (dx + w), cy + ry * dy);
    ctx.stroke();
  }
}

function drawPlaza(view: CityView, plaza: Area): void {
  const { ctx, cam } = view;
  polygonPath(view, plaza.polygon);
  ctx.fillStyle = theme.plaza;
  ctx.fill();
  ctx.lineWidth = 0.8 * cam.scale;
  ctx.strokeStyle = theme.plazaLine;
  ctx.stroke();
  const b = bbox(plaza.polygon);
  const cx = cam.sx((b.minX + b.maxX) / 2);
  const cy = cam.sy((b.minY + b.maxY) / 2);
  const r = ((b.maxX - b.minX) / 2) * cam.scale;
  for (const k of [0.45, 0.72]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// --- Rues ----------------------------------------------------------------

function isPathStreet(street: Street, map: GameMap): boolean {
  return map.paths.some((path) => street.points.every((p) => distanceToPolyline(p, path.points) < 0.5));
}

function drawStreets(view: CityView, map: GameMap): void {
  const { ctx, cam } = view;
  const sidewalk = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of map.streets) {
    polylinePath(view, s.points);
    ctx.strokeStyle = theme.curb;
    ctx.lineWidth = (s.width + sidewalk * 2 + 0.8) * cam.scale;
    ctx.stroke();
  }
  for (const s of map.streets) {
    polylinePath(view, s.points);
    ctx.strokeStyle = theme.sidewalk;
    ctx.lineWidth = (s.width + sidewalk * 2) * cam.scale;
    ctx.stroke();
  }
  for (const s of map.streets) {
    polylinePath(view, s.points);
    ctx.strokeStyle = theme.road;
    ctx.lineWidth = s.width * cam.scale;
    ctx.stroke();
  }
  // Ligne médiane pointillée sur les rues que les Gloutons n'empruntent pas.
  ctx.setLineDash([3 * cam.scale, 4 * cam.scale]);
  ctx.strokeStyle = theme.roadLine;
  ctx.lineWidth = Math.max(1, 0.35 * cam.scale);
  ctx.lineCap = 'butt';
  for (const s of map.streets) {
    if (isPathStreet(s, map)) continue;
    polylinePath(view, s.points);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Chemin des Gloutons : bande colorée et chevrons peints au sol. */
function drawRoute(view: CityView, map: GameMap): void {
  const { ctx, cam } = view;
  for (const path of map.paths) {
    polylinePath(view, path.points);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = theme.routeEdge;
    ctx.lineWidth = 5 * cam.scale;
    ctx.stroke();

    const prepared = new PreparedPath(path.points);
    const size = 1.9 * cam.scale;
    ctx.strokeStyle = theme.route;
    ctx.lineWidth = Math.max(1.5, 0.9 * cam.scale);
    for (let d = 8; d < prepared.length - 12; d += 14) {
      const s = prepared.sample(d);
      const x = cam.sx(s.x);
      const y = cam.sy(s.y);
      const nx = -s.dirY;
      const ny = s.dirX;
      ctx.beginPath();
      ctx.moveTo(x - s.dirX * size + nx * size, y - s.dirY * size + ny * size);
      ctx.lineTo(x + s.dirX * size * 0.4, y + s.dirY * size * 0.4);
      ctx.lineTo(x - s.dirX * size - nx * size, y - s.dirY * size - ny * size);
      ctx.stroke();
    }
  }
}

// --- Socles --------------------------------------------------------------

/** Cylindre vu de dessus en pseudo-3D (socle, plateforme, gâteau). */
export function cylinder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  h: number,
  top: string,
  side: string,
): void {
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.lineTo(x - r, y - h);
  ctx.arc(x, y - h, r, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.arc(x, y - h, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPad(view: CityView, p: Vec2, elevation: number): void {
  const { ctx, cam, unit } = view;
  const x = cam.sx(p.x);
  const y = cam.sy(p.y);
  const r = 10 * unit;
  ctx.fillStyle = 'rgba(41, 64, 90, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x + 2 * unit, y + 2 * unit, r, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  cylinder(ctx, x, y, r, padTopPx(cam, elevation), theme.pad.top, theme.pad.side);
  const top = y - padTopPx(cam, elevation);
  ctx.strokeStyle = theme.pad.stripe;
  ctx.lineWidth = 1.6 * unit;
  ctx.setLineDash([3 * unit, 2.5 * unit]);
  ctx.beginPath();
  ctx.arc(x, top, r - 2 * unit, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// --- Ombres --------------------------------------------------------------

function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

/** Hauteur (m) du point le plus haut d'un bâtiment (faîtage compris). */
export function buildingTopHeight(b: Building): number {
  return b.height + (b.roof === 'gable' ? ridgeHeight(b) : 0);
}

/** Les ombres sont dessinées opaques dans un calque, puis posées en une fois (pas de double assombrissement). */
function drawShadows(view: CityView, map: GameMap): void {
  const { ctx, shadowCanvas, cam, dpr } = view;
  const sctx = shadowCanvas.getContext('2d');
  if (!sctx) return;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height);
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.fillStyle = theme.shadow.color;
  const { dx, dy } = theme.shadow;
  for (const b of map.buildings) {
    const h = buildingTopHeight(b);
    const hull = convexHull([...b.footprint, ...b.footprint.map((p) => ({ x: p.x + dx * h, y: p.y + dy * h }))]);
    sctx.beginPath();
    hull.forEach((p, i) => (i === 0 ? sctx.moveTo(cam.sx(p.x), cam.sy(p.y)) : sctx.lineTo(cam.sx(p.x), cam.sy(p.y))));
    sctx.closePath();
    sctx.fill();
  }
  for (const t of map.trees) {
    const h = treeHeight(t);
    sctx.beginPath();
    sctx.ellipse(
      cam.sx(t.x + dx * h * 0.8),
      cam.sy(t.y + dy * h * 0.8),
      t.radius * cam.scale * 1.05,
      t.radius * cam.scale * 0.85,
      0.3,
      0,
      Math.PI * 2,
    );
    sctx.fill();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = theme.shadow.alpha;
  ctx.drawImage(shadowCanvas, 0, 0);
  ctx.restore();
}

// --- Bâtiments -----------------------------------------------------------

function ridgeHeight(b: Building): number {
  const [p0, p1, p2] = b.footprint;
  if (!p0 || !p1 || !p2) return 0;
  const shortSide = Math.min(Math.hypot(p1.x - p0.x, p1.y - p0.y), Math.hypot(p2.x - p1.x, p2.y - p1.y));
  return Math.min(shortSide * 0.35, 4);
}

function outwardNormal(a: Vec2, b: Vec2, center: Vec2): Vec2 {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = (b.y - a.y) / len;
  let ny = -(b.x - a.x) / len;
  const mx = (a.x + b.x) / 2 - center.x;
  const my = (a.y + b.y) / 2 - center.y;
  if (nx * mx + ny * my < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

/** Luminosité d'une face selon son orientation au sol (0,6 à 1). */
function faceLight(n: Vec2): number {
  const l = Math.hypot(theme.light.x, theme.light.y);
  const dot = (n.x * theme.light.x + n.y * theme.light.y) / l;
  return 0.8 + 0.2 * dot;
}

function drawBuilding(view: CityView, b: Building): void {
  const { ctx, cam } = view;
  const fp = b.footprint;
  const center = { x: fp.reduce((s, p) => s + p.x, 0) / fp.length, y: fp.reduce((s, p) => s + p.y, 0) / fp.length };
  const wallColor = pickColor(theme.walls, b.palette);
  const top = liftPx(cam, b.height);
  const P = (p: Vec2, h: number) => ({ x: cam.sx(p.x), y: cam.sy(p.y) - liftPx(cam, h) });

  // Murs visibles (orientés vers le sud, donc vers la caméra).
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i]!;
    const c = fp[(i + 1) % fp.length]!;
    const n = outwardNormal(a, c, center);
    if (n.y <= 0.05) continue;
    const k = faceLight(n);
    ctx.fillStyle = shade(wallColor, k - 1);
    const g1 = P(a, 0);
    const g2 = P(c, 0);
    ctx.beginPath();
    ctx.moveTo(g1.x, g1.y);
    ctx.lineTo(g2.x, g2.y);
    ctx.lineTo(g2.x, g2.y - top);
    ctx.lineTo(g1.x, g1.y - top);
    ctx.closePath();
    ctx.fill();
    drawWindows(view, a, c, b.height, k);
    // Liseré au pied du mur.
    ctx.strokeStyle = 'rgba(60, 60, 80, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g1.x, g1.y);
    ctx.lineTo(g2.x, g2.y);
    ctx.stroke();
  }

  if (b.roof === 'gable' && fp.length === 4) drawGableRoof(view, b, center);
  else drawFlatRoof(view, b, center);
}

function drawWindows(view: CityView, a: Vec2, c: Vec2, height: number, light: number): void {
  const { ctx, cam } = view;
  const length = Math.hypot(c.x - a.x, c.y - a.y);
  const floors = Math.max(1, Math.floor(height / 3.2));
  const perRow = Math.floor((length - 1.5) / 3);
  if (perRow < 1) return;
  ctx.fillStyle = light > 0.8 ? theme.window : 'rgba(70, 95, 135, 0.38)';
  const at = (t: number, h: number) => ({
    x: cam.sx(a.x + (c.x - a.x) * t),
    y: cam.sy(a.y + (c.y - a.y) * t) - liftPx(cam, h),
  });
  for (let f = 0; f < floors; f++) {
    const z1 = f * 3.2 + 1.2;
    const z2 = z1 + 1.4;
    if (z2 > height - 0.4) break;
    for (let i = 0; i < perRow; i++) {
      const t1 = (0.75 + i * 3 + 0.4) / length;
      const t2 = t1 + 1.3 / length;
      const p1 = at(t1, z1);
      const p2 = at(t2, z1);
      const p3 = at(t2, z2);
      const p4 = at(t1, z2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawFlatRoof(view: CityView, b: Building, center: Vec2): void {
  const { ctx, cam } = view;
  const color = pickColor(theme.flatRoofs, b.palette);
  polygonPath(view, b.footprint, liftPx(cam, b.height));
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.18);
  ctx.lineWidth = 1;
  ctx.stroke();
  // Rebord intérieur (acrotère).
  const inset = b.footprint.map((p) => ({ x: p.x + (center.x - p.x) * 0.16, y: p.y + (center.y - p.y) * 0.16 }));
  polygonPath(view, inset, liftPx(cam, b.height));
  ctx.strokeStyle = shade(color, -0.1);
  ctx.lineWidth = Math.max(1, 0.5 * cam.scale);
  ctx.stroke();
}

function drawGableRoof(view: CityView, b: Building, center: Vec2): void {
  const { ctx, cam } = view;
  let [p0, p1, p2, p3] = b.footprint as [Vec2, Vec2, Vec2, Vec2];
  // Le faîtage suit le grand côté.
  if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < Math.hypot(p2.x - p1.x, p2.y - p1.y)) {
    [p0, p1, p2, p3] = [p1, p2, p3, p0];
  }
  const mid = (a: Vec2, c: Vec2) => ({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 });
  const r0 = mid(p3, p0);
  const r1 = mid(p1, p2);
  const h = b.height;
  const rh = h + ridgeHeight(b);
  const P = (p: Vec2, z: number) => ({ x: cam.sx(p.x), y: cam.sy(p.y) - liftPx(cam, z) });
  const roofColor = pickColor(theme.gableRoofs, b.palette);
  const wallColor = pickColor(theme.walls, b.palette);

  // Pignons orientés vers le sud.
  for (const [a, c, r] of [[p3, p0, r0], [p1, p2, r1]] as const) {
    const n = outwardNormal(a, c, center);
    if (n.y <= 0.05) continue;
    ctx.fillStyle = shade(wallColor, faceLight(n) - 1);
    const A = P(a, h);
    const C = P(c, h);
    const R = P(r, rh);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(C.x, C.y);
    ctx.lineTo(R.x, R.y);
    ctx.closePath();
    ctx.fill();
  }

  // Pans de toit : celui tourné vers le nord d'abord.
  const planes = [
    { pts: [p0, p1, r1, r0], n: outwardNormal(p0, p1, center) },
    { pts: [p2, p3, r0, r1], n: outwardNormal(p2, p3, center) },
  ].sort((a, c) => a.n.y - c.n.y);
  for (const plane of planes) {
    const pts = plane.pts.map((p, i) => P(p, i < 2 ? h : rh));
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = shade(roofColor, (faceLight(plane.n) - 0.85) * 1.6);
    ctx.fill();
    ctx.strokeStyle = shade(roofColor, -0.25);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Faîtage.
  const R0 = P(r0, rh);
  const R1 = P(r1, rh);
  ctx.strokeStyle = shade(roofColor, 0.35);
  ctx.lineWidth = Math.max(1, 0.45 * cam.scale);
  ctx.beginPath();
  ctx.moveTo(R0.x, R0.y);
  ctx.lineTo(R1.x, R1.y);
  ctx.stroke();
}

// --- Arbres --------------------------------------------------------------

function treeHeight(t: Tree): number {
  return 3 + t.radius * 1.2;
}

function drawTree(view: CityView, t: Tree): void {
  const { ctx, cam } = view;
  const x = cam.sx(t.x);
  const y = cam.sy(t.y);
  const r = t.radius * cam.scale;
  const lift = liftPx(cam, treeHeight(t));
  ctx.strokeStyle = theme.trunk;
  ctx.lineWidth = Math.max(1.5, 0.6 * cam.scale);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - lift + r * 0.4);
  ctx.stroke();

  const color = pickColor(theme.trees, t.palette);
  const cy = y - lift;
  ctx.fillStyle = shade(color, -0.18);
  ctx.beginPath();
  ctx.arc(x + r * 0.12, cy + r * 0.12, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, cy, r * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, 0.22);
  ctx.beginPath();
  ctx.arc(x - r * 0.3, cy - r * 0.3, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}
