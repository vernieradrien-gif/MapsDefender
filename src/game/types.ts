// Contrat entre la source de carte (codée en dur au jalon 1, générée depuis
// OpenStreetMap au jalon 4) et la simulation. Toutes les coordonnées sont en
// mètres, dans un repère local (x vers la droite, y vers le bas).

export interface Vec2 {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Chemin suivi par les ennemis : de l'entrée (premier point) à la base (dernier point). */
export interface MapPath {
  id: string;
  points: Vec2[];
}

/** Emplacement où le joueur peut poser une tour. */
export interface TowerSlot {
  id: number;
  x: number;
  y: number;
}

export interface GameMap {
  id: string;
  /** Clé i18n du nom de la carte (carte fixe) ou nom brut (carte générée). */
  name: string;
  /** Graine des tirages aléatoires (composition des vagues, décalages latéraux). */
  seed: number;
  /** Zone à afficher à l'écran. */
  bounds: Bounds;
  /** Un ou plusieurs chemins qui convergent tous vers la base. */
  paths: MapPath[];
  slots: TowerSlot[];
  base: Vec2;
  /** Rues décoratives (non empruntées par les ennemis), pour le rendu seulement. */
  streets: Vec2[][];
}
