import { Rng } from '../game/rng';
import type { Area, Bounds, Building, EntryMarker, GameMap, Tree, Vec2 } from '../game/types';
import { interiorPoint, isConvex, minimumBoundingRect, outwardNormal, polygonArea, signedArea } from '../geo/geometry';
import type { Camera } from './camera';
import { pickColor, shade, theme } from './theme';

// Dessin du décor fixe de la ville (une seule fois par redimensionnement) :
// sol, parcs, bois, eau, rues, repères d'entrée, ombres, bâtiments, arbres, socles.
// Les emprises de bâtiments peuvent être non convexes (données OSM).

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
  /** Partie visible du monde : seul ce qui s'y trouve est dessiné (carte zoomée). */
  visible?: Bounds;
}

/** Décalage vertical à l'écran (px) d'un point situé à `h` mètres de hauteur. */
export const liftPx = (cam: Camera, h: number) => h * theme.heightFactor * cam.scale;

/** Hauteur à l'écran (px) du dessus d'un socle (exagérée pour rester visible). */
export const padTopPx = (cam: Camera, elevation: number) => Math.max(2, liftPx(cam, elevation) * 3);

/** Toit à deux pans dessinable : quatre coins formant presque un rectangle. */
export function hasGableRoof(b: Building): boolean {
  if (b.roof !== 'gable' || b.footprint.length !== 4) return false;
  return polygonArea(b.footprint) / minimumBoundingRect(b.footprint).area > 0.85;
}

const boxes = new WeakMap<object, Bounds>();

/** Rectangle englobant (mis en cache) d'un objet du décor. */
function boxOf(key: object, pts: readonly Vec2[]): Bounds {
  let box = boxes.get(key);
  if (!box) {
    box = bbox(pts);
    boxes.set(key, box);
  }
  return box;
}

/** Ne garde que les objets visibles (avec une marge pour la hauteur des bâtiments et les ombres). */
function visiblePart(map: GameMap, v: Bounds | undefined): GameMap {
  if (!v) return map;
  const margin = 30;
  const seen = (b: Bounds) =>
    b.maxX >= v.minX - margin && b.minX <= v.maxX + margin && b.maxY >= v.minY - margin && b.minY <= v.maxY + margin;
  return {
    ...map,
    buildings: map.buildings.filter((b) => seen(boxOf(b, b.footprint))),
    trees: map.trees.filter((t) => seen({ minX: t.x, maxX: t.x, minY: t.y, maxY: t.y })),
    streets: map.streets.filter((s) => seen(boxOf(s, s.points))),
    areas: map.areas.filter((a) => seen(boxOf(a, a.polygon))),
  };
}

export function drawCity(view: CityView, fullMap: GameMap): void {
  const { ctx } = view;
  const map = visiblePart(fullMap, view.visible);
  drawGround(view, map);
  for (const area of map.areas) if (area.kind === 'park') drawPark(view, area, map);
  for (const area of map.areas) if (area.kind === 'wood') drawWood(view, area);
  for (const area of map.areas) if (area.kind === 'water') drawWater(view, area);
  drawStreets(view, map);
  for (const area of map.areas) if (area.kind === 'plaza') drawPlaza(view, area);
  for (const entry of map.entries) drawEntry(view, entry);
  for (const slot of map.slots) if (slot.kind === 'pad') drawPad(view, slot, slot.elevation);
  drawShadows(view, map);

  // Objets en relief, du nord vers le sud (les plus proches de la caméra en dernier).
  const objects: { depth: number; draw: () => void }[] = [
    ...map.buildings.map((b) => ({
      depth: Math.max(...b.footprint.map((p) => p.y)),
      draw: () => drawBuilding(view, b, b.id === map.baseBuildingId),
    })),
    ...map.trees.map((t) => ({ depth: t.y + t.radius * 0.3, draw: () => drawTree(view, t) })),
  ];
  objects.sort((a, b) => a.depth - b.depth);
  for (const o of objects) o.draw();
  ctx.globalAlpha = 1;
}

// --- Sol, parcs, bois, eau, place -------------------------------------------

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

const FLOWERS = ['#ff9eb5', '#ffd166', '#ffffff', '#b8a1ff', '#ff8a65'];

function drawPark(view: CityView, park: Area, map: GameMap): void {
  const { ctx, cam } = view;
  polygonPath(view, park.polygon);
  ctx.fillStyle = theme.park;
  ctx.fill();
  ctx.lineWidth = 1.5 * cam.scale;
  ctx.strokeStyle = theme.parkEdge;
  ctx.stroke();

  // Décor limité au parc.
  ctx.save();
  polygonPath(view, park.polygon);
  ctx.clip();
  const b = bbox(park.polygon);
  const water = map.areas.find((a) => {
    if (a.kind !== 'water') return false;
    const w = bbox(a.polygon);
    return w.minX >= b.minX && w.maxX <= b.maxX && w.minY >= b.minY && w.maxY <= b.maxY;
  });
  // Allée autour de l'étang, reliée aux bords du parc.
  if (water) {
    const w = bbox(water.polygon);
    const cx = (w.minX + w.maxX) / 2;
    const cy = (w.minY + w.maxY) / 2;
    const rx = (w.maxX - w.minX) / 2 + 5;
    const ry = (w.maxY - w.minY) / 2 + 5;
    ctx.strokeStyle = theme.parkPath;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6 * cam.scale;
    ctx.beginPath();
    ctx.ellipse(cam.sx(cx), cam.sy(cy), rx * cam.scale, ry * cam.scale, 0, 0, Math.PI * 2);
    ctx.moveTo(cam.sx(b.minX), cam.sy(cy));
    ctx.lineTo(cam.sx(cx - rx), cam.sy(cy));
    ctx.moveTo(cam.sx(cx), cam.sy(cy + ry));
    ctx.quadraticCurveTo(cam.sx(cx + 4), cam.sy(b.maxY - 6), cam.sx(cx + 10), cam.sy(b.maxY));
    ctx.stroke();
  }
  // Massifs de fleurs.
  const rng = new Rng(Math.round(b.minX * 31 + b.minY * 17));
  const beds = Math.min(8, Math.max(1, Math.round(polygonArea(park.polygon) / 900)));
  for (let i = 0; i < beds; i++) {
    const x = b.minX + 6 + rng.next() * Math.max(0, b.maxX - b.minX - 12);
    const y = b.minY + 6 + rng.next() * Math.max(0, b.maxY - b.minY - 12);
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = pickColor(FLOWERS, Math.floor(rng.next() * FLOWERS.length));
      ctx.beginPath();
      ctx.arc(cam.sx(x + rng.range(-2.5, 2.5)), cam.sy(y + rng.range(-1.5, 1.5)), 0.7 * cam.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawWood(view: CityView, wood: Area): void {
  const { ctx, cam } = view;
  polygonPath(view, wood.polygon);
  ctx.fillStyle = theme.wood;
  ctx.fill();
  ctx.lineWidth = 1.5 * cam.scale;
  ctx.strokeStyle = theme.woodEdge;
  ctx.stroke();
}

function drawWater(view: CityView, water: Area): void {
  const { ctx, cam } = view;
  polygonPath(view, water.polygon);
  ctx.lineWidth = 2.4 * cam.scale;
  ctx.strokeStyle = theme.waterRim;
  ctx.stroke();
  ctx.fillStyle = theme.water;
  ctx.fill();
  // Reflets, limités au plan d'eau.
  ctx.save();
  polygonPath(view, water.polygon);
  ctx.clip();
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
  ctx.restore();
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

/** Largeur des trottoirs (m). */
const SIDEWALK = 2.5;

function drawStreets(view: CityView, map: GameMap): void {
  const { ctx, cam } = view;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of map.streets) {
    polylinePath(view, s.points);
    ctx.strokeStyle = theme.curb;
    ctx.lineWidth = (s.width + SIDEWALK * 2 + 0.8) * cam.scale;
    ctx.stroke();
  }
  for (const s of map.streets) {
    polylinePath(view, s.points);
    ctx.strokeStyle = theme.sidewalk;
    ctx.lineWidth = (s.width + SIDEWALK * 2) * cam.scale;
    ctx.stroke();
  }
  for (const s of map.streets) {
    polylinePath(view, s.points);
    ctx.strokeStyle = theme.road;
    ctx.lineWidth = s.width * cam.scale;
    ctx.stroke();
  }
  // Ligne médiane pointillée sur les rues larges.
  ctx.setLineDash([3 * cam.scale, 4 * cam.scale]);
  ctx.strokeStyle = theme.roadLine;
  ctx.lineWidth = Math.max(1, 0.35 * cam.scale);
  ctx.lineCap = 'butt';
  for (const s of map.streets) {
    if (s.width < 9) continue;
    polylinePath(view, s.points);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Position à l'écran d'un repère d'entrée : un peu vers l'intérieur, pour ne pas être coupé par le bord. */
export function entryScreen(cam: Camera, entry: EntryMarker, unit: number): { x: number; y: number } {
  return { x: cam.sx(entry.x) + entry.dirX * 13 * unit, y: cam.sy(entry.y) + entry.dirY * 13 * unit };
}

/** Repère d'entrée des virus : disque rouge et flèche vers l'intérieur du quartier. */
function drawEntry(view: CityView, entry: EntryMarker): void {
  const { ctx, cam, unit } = view;
  const { x, y } = entryScreen(cam, entry, unit);
  const r = 11 * unit;
  ctx.fillStyle = theme.entry.fill;
  ctx.strokeStyle = theme.entry.ring;
  ctx.lineWidth = 2 * unit;
  ctx.setLineDash([4 * unit, 3 * unit]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  drawEntryArrow(ctx, x, y, entry.dirX, entry.dirY, unit);
}

export function drawEntryArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, unit: number): void {
  const s = 5 * unit;
  const nx = -dy;
  const ny = dx;
  ctx.fillStyle = theme.entry.ring;
  ctx.strokeStyle = theme.entry.arrow;
  ctx.lineWidth = 1.2 * unit;
  ctx.beginPath();
  ctx.moveTo(x + dx * s * 1.2, y + dy * s * 1.2);
  ctx.lineTo(x - dx * s * 0.6 + nx * s * 0.9, y - dy * s * 0.6 + ny * s * 0.9);
  ctx.lineTo(x - dx * s * 0.2, y - dy * s * 0.2);
  ctx.lineTo(x - dx * s * 0.6 - nx * s * 0.9, y - dy * s * 0.6 - ny * s * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// --- Socles --------------------------------------------------------------

/** Cylindre vu de dessus en pseudo-3D (socle, plateforme). */
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

/** Hauteur (m) du point le plus haut d'un bâtiment (faîtage compris). */
export function buildingTopHeight(b: Building): number {
  return b.height + (hasGableRoof(b) ? ridgeHeight(b) : 0);
}

/**
 * Ombre d'un prisme : l'emprise, sa copie décalée et un quadrilatère par
 * arête. Juste aussi pour les emprises non convexes. Les ombres sont
 * dessinées opaques dans un calque, puis posées en une fois (pas de double
 * assombrissement).
 */
function drawShadows(view: CityView, map: GameMap): void {
  const { ctx, shadowCanvas, cam, dpr } = view;
  const sctx = shadowCanvas.getContext('2d');
  if (!sctx) return;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height);
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.fillStyle = theme.shadow.color;
  const { dx, dy } = theme.shadow;
  const X = (p: Vec2) => cam.sx(p.x);
  const Y = (p: Vec2) => cam.sy(p.y);
  for (const b of map.buildings) {
    const h = buildingTopHeight(b);
    const fp = b.footprint;
    const moved = fp.map((p) => ({ x: p.x + dx * h, y: p.y + dy * h }));
    // Chaque morceau est rempli à part : des sous-chemins de sens opposés s'annuleraient.
    for (const poly of [fp, moved]) {
      sctx.beginPath();
      poly.forEach((p, i) => (i === 0 ? sctx.moveTo(X(p), Y(p)) : sctx.lineTo(X(p), Y(p))));
      sctx.fill();
    }
    for (let i = 0; i < fp.length; i++) {
      const j = (i + 1) % fp.length;
      sctx.beginPath();
      sctx.moveTo(X(fp[i]!), Y(fp[i]!));
      sctx.lineTo(X(fp[j]!), Y(fp[j]!));
      sctx.lineTo(X(moved[j]!), Y(moved[j]!));
      sctx.lineTo(X(moved[i]!), Y(moved[i]!));
      sctx.fill();
    }
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

/** Luminosité d'une face selon son orientation au sol (0,6 à 1). */
function faceLight(n: Vec2): number {
  const l = Math.hypot(theme.light.x, theme.light.y);
  const dot = (n.x * theme.light.x + n.y * theme.light.y) / l;
  return 0.8 + 0.2 * dot;
}

interface BuildingLook {
  walls: string;
  roof: string;
  base: boolean;
}

function lookOf(b: Building, isBase: boolean): BuildingLook {
  if (isBase) return { walls: theme.base.walls, roof: theme.base.roof, base: true };
  const colors = theme.buildings[b.kind ?? 'house'];
  return {
    walls: pickColor(colors.walls, b.palette),
    roof: pickColor(hasGableRoof(b) ? colors.gableRoofs : colors.flatRoofs, b.palette),
    base: false,
  };
}

function drawBuilding(view: CityView, b: Building, isBase: boolean): void {
  const { ctx, cam } = view;
  const fp = b.footprint;
  const orientation = signedArea(fp);
  const look = lookOf(b, isBase);
  const top = liftPx(cam, b.height);
  const P = (p: Vec2, h: number) => ({ x: cam.sx(p.x), y: cam.sy(p.y) - liftPx(cam, h) });

  if (isBase) {
    // Halo au sol autour du bâtiment à protéger.
    const c = interiorPoint(fp);
    const r = Math.sqrt(polygonArea(fp) / Math.PI) + 8;
    ctx.fillStyle = theme.base.halo;
    ctx.beginPath();
    ctx.ellipse(cam.sx(c.x), cam.sy(c.y), r * cam.scale, r * cam.scale * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Murs tournés vers le sud (vers la caméra), du plus loin au plus proche.
  const walls: { a: Vec2; c: Vec2; n: Vec2; depth: number }[] = [];
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i]!;
    const c = fp[(i + 1) % fp.length]!;
    const n = outwardNormal(a, c, orientation);
    if (n.y > 0.05) walls.push({ a, c, n, depth: (a.y + c.y) / 2 });
  }
  walls.sort((x, y) => x.depth - y.depth);
  for (const { a, c, n } of walls) {
    const k = faceLight(n);
    ctx.fillStyle = shade(look.walls, k - 1);
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

  if (hasGableRoof(b)) drawGableRoof(view, b, look, orientation);
  else drawFlatRoof(view, b, look);
}

function drawWindows(view: CityView, a: Vec2, c: Vec2, height: number, light: number): void {
  const { ctx, cam } = view;
  const length = Math.hypot(c.x - a.x, c.y - a.y);
  const floors = Math.max(1, Math.floor(height / 3.2));
  const perRow = Math.floor((length - 1.5) / 3);
  if (perRow < 1 || height < 2.5) return;
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

function drawFlatRoof(view: CityView, b: Building, look: BuildingLook): void {
  const { ctx, cam } = view;
  const lift = liftPx(cam, b.height);
  polygonPath(view, b.footprint, lift);
  ctx.fillStyle = look.roof;
  ctx.fill();
  ctx.strokeStyle = look.base ? theme.base.roofEdge : shade(look.roof, -0.18);
  ctx.lineWidth = look.base ? Math.max(1.5, 0.6 * cam.scale) : 1;
  ctx.stroke();
  const center = interiorPoint(b.footprint);
  // Rebord intérieur (acrotère), seulement sur une forme convexe où il reste à l'intérieur.
  if (isConvex(b.footprint) && polygonArea(b.footprint) > 60) {
    const inset = b.footprint.map((p) => ({ x: p.x + (center.x - p.x) * 0.12, y: p.y + (center.y - p.y) * 0.12 }));
    polygonPath(view, inset, lift);
    ctx.strokeStyle = shade(look.roof, look.base ? 0.25 : -0.1);
    ctx.lineWidth = Math.max(1, 0.5 * cam.scale);
    ctx.stroke();
  }
  if (look.base) drawCross(view, center, b.height, Math.sqrt(polygonArea(b.footprint)) * 0.22);
}

/** Croix sanitaire sur le toit de la base. */
function drawCross(view: CityView, at: Vec2, height: number, size: number): void {
  const { ctx, cam } = view;
  const s = Math.max(3, Math.min(size, 7)) * cam.scale;
  const x = cam.sx(at.x);
  const y = cam.sy(at.y) - liftPx(cam, height);
  ctx.fillStyle = theme.base.cross;
  ctx.fillRect(x - s * 0.3, y - s, s * 0.6, s * 2);
  ctx.fillRect(x - s, y - s * 0.3, s * 2, s * 0.6);
}

function drawGableRoof(view: CityView, b: Building, look: BuildingLook, orientation: number): void {
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

  // Pignons orientés vers le sud.
  for (const [a, c, r] of [[p3, p0, r0], [p1, p2, r1]] as const) {
    const n = outwardNormal(a, c, orientation);
    if (n.y <= 0.05) continue;
    ctx.fillStyle = shade(look.walls, faceLight(n) - 1);
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
    { pts: [p0, p1, r1, r0], n: outwardNormal(p0, p1, orientation) },
    { pts: [p2, p3, r0, r1], n: outwardNormal(p2, p3, orientation) },
  ].sort((a, c) => a.n.y - c.n.y);
  for (const plane of planes) {
    const pts = plane.pts.map((p, i) => P(p, i < 2 ? h : rh));
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = shade(look.roof, (faceLight(plane.n) - 0.85) * 1.6);
    ctx.fill();
    ctx.strokeStyle = shade(look.roof, -0.25);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Faîtage.
  const R0 = P(r0, rh);
  const R1 = P(r1, rh);
  ctx.strokeStyle = shade(look.roof, 0.35);
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
