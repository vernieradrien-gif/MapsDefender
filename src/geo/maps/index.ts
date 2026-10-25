import type { MapRulesConfig } from '../../config';
import { validateMap } from '../../game/mapValidation';
import type { GameMap } from '../../game/types';
import { createFixedMap } from '../fixedMap';
import villagexpo from './villagexpo.json';

// Cartes réelles précalculées (npm run import-map) et enregistrées dans le
// dépôt. La carte de démonstration sert de secours.

export interface LoadedMap {
  map: GameMap;
  /** Vrai si la carte demandée était invalide et que la carte de démonstration la remplace. */
  fallback: boolean;
  errors: string[];
}

/** Carte réelle du jeu : le quartier Villagexpo à Saint-Michel-sur-Orge. */
export function villagexpoMap(): GameMap {
  return (villagexpo as unknown as { map: GameMap }).map;
}

/** Carte à jouer : Villagexpo, ou la carte de démonstration (`demo`, ou si Villagexpo est invalide). */
export function loadGameMap(rules: MapRulesConfig, options: { demo?: boolean } = {}): LoadedMap {
  if (options.demo) return { map: createFixedMap(rules), fallback: false, errors: [] };
  const map = villagexpoMap();
  const errors = validateMap(map, rules);
  if (errors.length === 0) return { map, fallback: false, errors };
  return { map: createFixedMap(rules), fallback: true, errors };
}
