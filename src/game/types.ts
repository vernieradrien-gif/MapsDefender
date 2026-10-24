// Contrat entre la source de carte (codée en dur au jalon 1, générée depuis
// OpenStreetMap au jalon 4) et la simulation. Toutes les coordonnées sont en
// mètres, dans un repère local (x vers la droite, y vers le bas = vers le sud).

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

/** Chemin suivi par les Gloutons : de l'entrée (premier point) à la base (dernier point). */
export interface MapPath {
  id: string;
  points: Vec2[];
}

/** Toit d'un bâtiment, ou socle posé au sol quand les bâtiments manquent. */
export type SlotKind = 'roof' | 'pad';

/** Emplacement où le joueur peut installer une tourelle. */
export interface TowerSlot {
  id: number;
  x: number;
  y: number;
  kind: SlotKind;
  /** Hauteur du support (m) : toit du bâtiment ou socle. Sert au rendu. */
  elevation: number;
  /** Bâtiment portant l'emplacement (toit), sinon null. */
  buildingId: number | null;
}

export type RoofShape = 'flat' | 'gable';

export interface Building {
  id: number;
  /** Empreinte au sol (polygone convexe). */
  footprint: Vec2[];
  /** Hauteur des murs (m). */
  height: number;
  roof: RoofShape;
  /** Variante de couleurs choisie par le rendu. */
  palette: number;
}

export type AreaKind = 'park' | 'water' | 'plaza';

/** Surface au sol décorative : parc, plan d'eau, place. */
export interface Area {
  kind: AreaKind;
  polygon: Vec2[];
}

export interface Tree {
  x: number;
  y: number;
  /** Rayon du feuillage (m). */
  radius: number;
  palette: number;
}

/** Rue (empruntée ou non par les Gloutons). */
export interface Street {
  points: Vec2[];
  /** Largeur de la chaussée (m). */
  width: number;
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
  /** Toutes les rues, y compris celles des chemins. */
  streets: Street[];
  buildings: Building[];
  areas: Area[];
  trees: Tree[];
}
