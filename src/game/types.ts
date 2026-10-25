// Contrat entre la source de carte (carte de démonstration codée en dur,
// carte OpenStreetMap importée, quartier généré) et la simulation. Toutes les
// coordonnées sont en mètres, dans un repère local (x vers la droite = vers
// l'est, y vers le bas = vers le sud).

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

/** Itinéraire suivi par les virus : de l'entrée (premier point) à la base (dernier point). */
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
  /** Hauteur du support (m) : toit du bâtiment ou socle. Donne le bonus de portée (toits seulement). */
  elevation: number;
  /** Bâtiment portant l'emplacement (toit), sinon null. */
  buildingId: number | null;
}

export type RoofShape = 'flat' | 'gable';

/** Usage du bâtiment : change ses couleurs (maison, immeuble, bâtiment public…). */
export type BuildingKind = 'house' | 'apartments' | 'public' | 'commercial' | 'annex';

export interface Building {
  id: number;
  /** Empreinte au sol (polygone simple, convexe ou non). */
  footprint: Vec2[];
  /** Hauteur des murs (m). */
  height: number;
  roof: RoofShape;
  /** Variante de couleurs choisie par le rendu. */
  palette: number;
  kind?: BuildingKind;
  /** Nom (bâtiments nommés des cartes OSM). */
  name?: string;
}

export type AreaKind = 'park' | 'wood' | 'water' | 'plaza';

/** Surface au sol décorative : parc ou pelouse, bois, plan d'eau, place. */
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

/** Rue (empruntée ou non par les virus). */
export interface Street {
  points: Vec2[];
  /** Largeur de la chaussée (m). */
  width: number;
}

/** Entrée des virus : début d'un ou plusieurs itinéraires, avec la direction vers l'intérieur. */
export interface EntryMarker {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
}

export interface GameMap {
  id: string;
  /** Clé i18n du nom de la carte (carte de démonstration) ou nom brut (carte OSM ou générée). */
  name: string;
  /** Graine des tirages aléatoires (composition des vagues, décalages latéraux). */
  seed: number;
  /** Zone à afficher à l'écran. */
  bounds: Bounds;
  /** Itinéraires des virus : ils convergent tous vers la base. */
  paths: MapPath[];
  /** Entrées des virus (une par rue qui entre dans le quartier). */
  entries: EntryMarker[];
  slots: TowerSlot[];
  /** Point de la rue où les virus atteignent la base. */
  base: Vec2;
  /** Bâtiment à protéger (null : un bâtiment générique est dessiné au point de base). */
  baseBuildingId: number | null;
  /** Toutes les rues, y compris celles des itinéraires. */
  streets: Street[];
  buildings: Building[];
  areas: Area[];
  trees: Tree[];
  /** Mention de la source des données (cartes OpenStreetMap). */
  attribution?: string;
}
