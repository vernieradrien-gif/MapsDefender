import type { Vec2 } from '../game/types';

// Projection équirectangulaire locale : à l'échelle d'un quartier (< 2 km),
// l'erreur est négligeable. x vers l'est, y vers le sud (comme l'écran), en mètres.

export interface LatLon {
  lat: number;
  lon: number;
}

/** Rayon terrestre moyen (m). */
const EARTH_RADIUS = 6371008.8;
const DEG = Math.PI / 180;

export interface LocalProjection {
  center: LatLon;
  toLocal(p: LatLon): Vec2;
  toLatLon(p: Vec2): LatLon;
}

export function localProjection(center: LatLon): LocalProjection {
  const kx = EARTH_RADIUS * DEG * Math.cos(center.lat * DEG);
  const ky = EARTH_RADIUS * DEG;
  return {
    center,
    toLocal: (p) => ({ x: (p.lon - center.lon) * kx, y: -(p.lat - center.lat) * ky }),
    toLatLon: (p) => ({ lat: center.lat - p.y / ky, lon: center.lon + p.x / kx }),
  };
}
