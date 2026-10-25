import type { GameMap, Vec2 } from '../game/types';
import { theme } from './theme';

// Aperçu du tracé d'une carte (écran de choix du lieu) : vue à plat des rues,
// des itinéraires des virus, des entrées et de la base.

const ROUTE_COLOR = 'rgba(232, 72, 85, 0.75)';

export function drawMapPreview(canvas: HTMLCanvasElement, map: GameMap): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const width = canvas.clientWidth || 300;
  const height = canvas.clientHeight || 200;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const b = map.bounds;
  const margin = 6;
  const scale = Math.min((width - margin * 2) / (b.maxX - b.minX), (height - margin * 2) / (b.maxY - b.minY));
  const ox = (width - (b.maxX - b.minX) * scale) / 2 - b.minX * scale;
  const oy = (height - (b.maxY - b.minY) * scale) / 2 - b.minY * scale;
  const X = (p: Vec2) => ox + p.x * scale;
  const Y = (p: Vec2) => oy + p.y * scale;
  const path = (points: readonly Vec2[], close = false) => {
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p), Y(p)) : ctx.lineTo(X(p), Y(p))));
    if (close) ctx.closePath();
  };

  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(X({ x: b.minX, y: 0 }), Y({ x: 0, y: b.minY }), (b.maxX - b.minX) * scale, (b.maxY - b.minY) * scale);
  ctx.clip();

  for (const area of map.areas) {
    path(area.polygon, true);
    ctx.fillStyle = area.kind === 'water' ? theme.water : area.kind === 'wood' ? theme.wood : area.kind === 'plaza' ? theme.plaza : theme.park;
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(120, 125, 145, 0.35)';
  for (const building of map.buildings) {
    if (building.id === map.baseBuildingId) continue;
    path(building.footprint, true);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  for (const street of map.streets) {
    ctx.lineWidth = Math.max(1.5, street.width * scale);
    path(street.points);
    ctx.stroke();
  }
  ctx.strokeStyle = ROUTE_COLOR;
  ctx.lineWidth = Math.max(1.5, 2.4 * scale);
  for (const route of map.paths) {
    path(route.points);
    ctx.stroke();
  }
  const base = map.buildings.find((x) => x.id === map.baseBuildingId);
  if (base) {
    path(base.footprint, true);
    ctx.fillStyle = theme.base.roof;
    ctx.fill();
  }
  ctx.restore();

  // Base et entrées par-dessus, bien visibles même en petit.
  ctx.fillStyle = theme.base.roof;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(X(map.base), Y(map.base), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (const entry of map.entries) {
    ctx.fillStyle = theme.entry.ring;
    ctx.beginPath();
    ctx.arc(X(entry), Y(entry), 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
