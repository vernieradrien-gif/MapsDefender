import type { BuildingKind } from '../game/types';
import balance from './balance.json';

// Types de la configuration d'équilibrage. Les valeurs vivent dans
// balance.json (documenté dans README.md de ce dossier) : aucune valeur
// d'équilibrage ne doit être écrite en dur dans le code.

export interface SimulationConfig {
  /** Mises à jour de la simulation par seconde (pas de temps fixe). */
  stepsPerSecond: number;
  /** Durée maximale d'une image prise en compte (évite l'emballement après une pause). */
  maxFrameSeconds: number;
  /** Nombre maximal de pas de simulation par image. */
  maxStepsPerFrame: number;
  /** Vitesses proposées par le bouton de vitesse. */
  speeds: number[];
}

export interface EconomyConfig {
  /** Argent de départ pour un itinéraire moyen de référence (adapté à la carte, voir mapScaling). */
  startMoney: number;
  /** Bonus de fin de vague = waveBonusBase + waveBonusPerWave × numéro de vague. */
  waveBonusBase: number;
  waveBonusPerWave: number;
  /** Part du total investi rendue à la revente d'une tourelle (0 à 1). */
  sellRefund: number;
}

export interface ScoreConfig {
  /** Points par vague terminée, multipliés par le numéro de la vague. */
  perWaveCleared: number;
  /** Points par PV de base restant en cas de victoire. */
  perBaseHpOnVictory: number;
}

/** Adaptation à la carte : facteur = longueur moyenne des itinéraires / référence, borné. */
export interface MapScalingConfig {
  referenceRouteLength: number;
  minFactor: number;
  maxFactor: number;
}

export interface WaveCompositionEntry {
  enemy: string;
  fromWave: number;
  weight: number;
}

export interface WavesConfig {
  total: number;
  prepSeconds: number;
  interWaveSeconds: number;
  /** PV = PV de base × hpGrowth^(vague − 1). */
  hpGrowth: number;
  /** Nombre d'ennemis = (countBase + countPerWave × (vague − 1)) × facteur de carte. */
  countBase: number;
  countPerWave: number;
  spawnIntervalStart: number;
  spawnIntervalPerWave: number;
  spawnIntervalMin: number;
  /** Décalage latéral maximal (m) des ennemis par rapport à l'axe de la rue. */
  laneOffsetMax: number;
  /** Un boss arrive toutes les `bossEvery` vagues (à la fin de la vague). */
  bossEvery: number;
  /** Identifiant de l'ennemi boss. */
  boss: string;
  composition: WaveCompositionEntry[];
}

export interface EnemyConfig {
  id: string;
  hp: number;
  /** Vitesse en m/s. */
  speed: number;
  /** Argent gagné quand l'ennemi est neutralisé. */
  reward: number;
  /** PV retirés à la base si l'ennemi l'atteint. */
  baseDamage: number;
  /** Points de score, multipliés par le numéro de la vague. */
  score: number;
  /** Ennemi qui apparaît à sa place quand il est neutralisé (boss). */
  splitInto?: string;
  splitCount?: number;
}

/**
 * Mode d'action d'une tourelle :
 * - `projectile` : projectile à tête chercheuse (dégâts de zone si splashRadius > 0) ;
 * - `beam` : rayon instantané sur une cible ;
 * - `field` : champ permanent qui ralentit les virus à portée.
 */
export type TowerAttack = 'projectile' | 'beam' | 'field';

/** Gain par niveau d'amélioration (proportion de la valeur de base, ou points pour slow). */
export interface TowerPerLevel {
  damage: number;
  range: number;
  /** Cadence : l'intervalle entre deux tirs est divisé par (1 + fireRate × niveau). */
  fireRate: number;
  /** Ralentissement ajouté par niveau (0,05 = 5 points de plus). */
  slow: number;
}

export interface TowerConfig {
  id: string;
  attack: TowerAttack;
  cost: number;
  /** Portée en mètres (avant bonus de hauteur et améliorations). */
  range: number;
  /** Dégâts par tir (sur la cible, ou sur toute la zone si splashRadius > 0). */
  damage: number;
  /** Secondes entre deux tirs. */
  fireInterval: number;
  /** Vitesse du projectile (m/s). */
  projectileSpeed: number;
  /** Rayon d'éclatement (m) ; 0 = une seule cible. */
  splashRadius: number;
  /** Ralentissement des virus dans le champ (0,4 = 40 % plus lents). */
  slow: number;
  perLevel: TowerPerLevel;
}

export interface UpgradesConfig {
  /** Nombre de niveaux d'amélioration par tourelle. */
  maxLevel: number;
  /** Coût pour passer au niveau n = coût de la tourelle × costGrowth^n. */
  costGrowth: number;
}

export interface HeightBonusConfig {
  /** Bonus de portée par mètre de hauteur du toit (0,012 = 1,2 %). */
  rangePerMeter: number;
  /** Bonus maximal (0,25 = 25 %). */
  maxBonus: number;
}

export interface MapRulesConfig {
  /** Distance minimale entre un emplacement au sol (socle) et l'axe d'une rue (m). */
  slotMinDistanceFromPath: number;
  /** Distance minimale entre deux emplacements (m). */
  slotMinSpacing: number;
  /** Un toit devient emplacement si le centre du bâtiment est à moins de cette distance d'un itinéraire (m). */
  roofMaxDistanceFromPath: number;
  /** Distance des socles à l'axe de l'itinéraire (m). */
  padOffsetFromPath: number;
  /** Pas entre deux socles candidats le long de l'itinéraire (m). */
  padStep: number;
  /** Un tronçon d'itinéraire sans emplacement dans ce rayon reçoit un socle (m). */
  padCoverageRadius: number;
  /** Écart minimal entre un socle et un bâtiment ou un plan d'eau (m). */
  padClearance: number;
  /** Hauteur d'un socle (m), pour le rendu. */
  padElevation: number;
  minSlots: number;
  maxSlots: number;
  baseMaxDistanceFromPathEnd: number;
}

export interface TreeRules {
  /** Tentatives de plantation par hectare (jardins, bords de rue). */
  density: number;
  /** Tentatives par hectare dans les parcs et les bois. */
  parkDensity: number;
  woodDensity: number;
  /** Écart minimal entre deux arbres (m). */
  spacing: number;
  radius: [number, number];
  paletteCount: number;
}

/** Construction d'une carte à partir de données OpenStreetMap (ou d'un quartier généré). */
export interface OsmRulesConfig {
  /** Zone de jeu (m), centrée sur le lieu. */
  zoneWidth: number;
  zoneHeight: number;
  /** Décor dessiné autour de la zone (m). */
  decorMargin: number;
  /** Abords pris dans le réseau des rues (m) : liaisons par l'extérieur et rues d'entrée. */
  graphMargin: number;
  /** Les virus apparaissent à cette distance avant d'entrer dans la carte (m). */
  entryLead: number;
  /** Une extrémité de rue à moins de cette distance du bord est une entrée (m). */
  entryMargin: number;
  /** Largeur de chaussée (m) par type de voie OSM. */
  streetWidths: Record<string, number>;
  /** Raccordement des extrémités de rue (m). */
  graphTolerance: number;
  /** Fusion des carrefours reliés par un tronçon plus court (m). */
  mergeDistance: number;
  /** Les impasses plus courtes sont supprimées (m). */
  minDeadEnd: number;
  /** Douglas-Peucker des itinéraires (m). */
  simplifyTolerance: number;
  /** Douglas-Peucker des rues dessinées et des surfaces (m). */
  drawTolerance: number;
  /** Douglas-Peucker des contours de bâtiments (m). */
  footprintTolerance: number;
  buildingMinArea: number;
  /** Sans étiquette précise : abri sous annexMaxArea, maison sous houseMaxArea, immeuble, puis grand bâtiment. */
  annexMaxArea: number;
  houseMaxArea: number;
  commercialMinArea: number;
  /** Hauteur d'un niveau (m). */
  levelHeight: number;
  /** Hauteur des murs (m) quand OSM ne donne ni hauteur ni niveaux. */
  defaultHeights: Record<BuildingKind, number>;
  /** Toit à deux pans si surface / rectangle englobant ≥ ce seuil. */
  gableMinRectangularity: number;
  /** Choix de la base : score = emprise × hauteur / (1 + (distance au centre / baseProximity)²). */
  baseProximity: number;
  /** Adresse précise : la base est le bâtiment à moins de cette distance du point géocodé (m). */
  addressMaxDistance: number;
  baseMaxStreetDistance: number;
  paletteCount: number;
  trees: TreeRules;
}

/** Amélioration permanente achetée avec des gemmes. */
export interface PermanentUpgradeConfig {
  id: string;
  maxLevel: number;
  /** Coût en gemmes de chaque niveau (costs[0] = niveau 1). */
  costs: number[];
  /** Effet par niveau (proportion, crédits ou nombre selon l'amélioration). */
  effect: number;
  /** Niveau d'une autre amélioration à atteindre d'abord (arbre), ou null. */
  requires: { id: string; level: number } | null;
}

/** Cartes générées depuis une adresse ou une position (jalon 4). */
export interface PlacesConfig {
  /** Rayons proposés au joueur (m). La zone de jeu suit le rayon : osm.zoneWidth × rayon / defaultRadius. */
  radii: number[];
  defaultRadius: number;
  /** Rayon maximal atteint en agrandissant la zone (zone rurale, itinéraires trop courts). */
  maxRadius: number;
  radiusStep: number;
  /** Longueur moyenne minimale des itinéraires (m) ; en dessous, la zone est agrandie. */
  minAverageRouteLength: number;
  /** Résultats proposés après une recherche d'adresse. */
  geocodeResults: number;
  /** Écart minimal entre deux requêtes Nominatim (s). */
  nominatimInterval: number;
  /** Temps de calcul accordé au serveur Overpass (s). */
  overpassTimeout: number;
  /** Attente maximale d'une réponse du réseau (s). */
  requestTimeout: number;
  /** Tours de tous les serveurs Overpass avant d'abandonner (2 : un nouvel essai automatique). */
  overpassRounds: number;
  /** Pause avant un nouveau tour quand tous les serveurs sont saturés (s ; règle d'usage : 30 s). */
  overpassRetryPause: number;
  /** Cartes gardées en cache sur l'appareil (les moins récemment jouées partent d'abord). */
  cacheMaxMaps: number;
  /** Graines essayées pour la carte imaginaire de secours. */
  fallbackAttempts: number;
}

export interface ProgressionConfig {
  /** Gemmes d'une partie = gemFactor × √score (arrondi à l'inférieur) : le score grimpe très vite avec les vagues, les gemmes plus régulièrement. */
  gemFactor: number;
  upgrades: PermanentUpgradeConfig[];
}

/** Publicités (identifiants de test uniquement, jamais pendant une vague). */
export interface AdsConfig {
  /** PV de la base après « Continuer » (pub récompensée, une fois par partie). */
  continueHp: number;
  /** Gemmes multipliées par cette valeur après la pub de fin de partie. */
  gemsMultiplier: number;
  /** Crédits gagnés multipliés pendant la vague boostée. */
  boostMultiplier: number;
  /** Écart minimal entre deux interstitiels (s). */
  interstitialMinSeconds: number;
  /** Durée de la fausse publicité sur le web (s). */
  fakeAdSeconds: number;
}

export interface GameConfig {
  version: number;
  simulation: SimulationConfig;
  base: { hp: number };
  economy: EconomyConfig;
  score: ScoreConfig;
  mapScaling: MapScalingConfig;
  waves: WavesConfig;
  enemies: EnemyConfig[];
  towers: TowerConfig[];
  upgrades: UpgradesConfig;
  heightBonus: HeightBonusConfig;
  mapRules: MapRulesConfig;
  osm: OsmRulesConfig;
  places: PlacesConfig;
  progression: ProgressionConfig;
  ads: AdsConfig;
  debug: { startMoney: number };
}

/** Vérifie la cohérence d'une configuration ; renvoie la liste des erreurs. */
export function validateConfig(config: GameConfig): string[] {
  const errors: string[] = [];
  const positive = (value: number, name: string) => {
    if (!(Number.isFinite(value) && value > 0)) errors.push(`${name} doit être > 0`);
  };
  const nonNegative = (value: number, name: string) => {
    if (!(Number.isFinite(value) && value >= 0)) errors.push(`${name} doit être >= 0`);
  };
  const ratio = (value: number, name: string) => {
    if (!(Number.isFinite(value) && value >= 0 && value <= 1)) errors.push(`${name} doit être entre 0 et 1`);
  };

  positive(config.simulation.stepsPerSecond, 'simulation.stepsPerSecond');
  positive(config.simulation.maxFrameSeconds, 'simulation.maxFrameSeconds');
  positive(config.simulation.maxStepsPerFrame, 'simulation.maxStepsPerFrame');
  if (config.simulation.speeds.length === 0) errors.push('simulation.speeds est vide');
  config.simulation.speeds.forEach((s, i) => positive(s, `simulation.speeds[${i}]`));

  positive(config.base.hp, 'base.hp');
  nonNegative(config.economy.startMoney, 'economy.startMoney');
  nonNegative(config.economy.waveBonusBase, 'economy.waveBonusBase');
  nonNegative(config.economy.waveBonusPerWave, 'economy.waveBonusPerWave');
  ratio(config.economy.sellRefund, 'economy.sellRefund');

  const s = config.mapScaling;
  positive(s.referenceRouteLength, 'mapScaling.referenceRouteLength');
  positive(s.minFactor, 'mapScaling.minFactor');
  if (!(s.maxFactor >= s.minFactor)) errors.push('mapScaling.maxFactor doit être >= minFactor');

  const w = config.waves;
  positive(w.total, 'waves.total');
  nonNegative(w.prepSeconds, 'waves.prepSeconds');
  nonNegative(w.interWaveSeconds, 'waves.interWaveSeconds');
  positive(w.hpGrowth, 'waves.hpGrowth');
  positive(w.countBase, 'waves.countBase');
  nonNegative(w.countPerWave, 'waves.countPerWave');
  positive(w.spawnIntervalStart, 'waves.spawnIntervalStart');
  positive(w.spawnIntervalMin, 'waves.spawnIntervalMin');
  nonNegative(w.laneOffsetMax, 'waves.laneOffsetMax');
  positive(w.bossEvery, 'waves.bossEvery');

  const enemyIds = new Set<string>();
  for (const e of config.enemies) {
    if (enemyIds.has(e.id)) errors.push(`ennemi en double : ${e.id}`);
    enemyIds.add(e.id);
    positive(e.hp, `enemies.${e.id}.hp`);
    positive(e.speed, `enemies.${e.id}.speed`);
    nonNegative(e.reward, `enemies.${e.id}.reward`);
    nonNegative(e.baseDamage, `enemies.${e.id}.baseDamage`);
    nonNegative(e.score, `enemies.${e.id}.score`);
  }
  for (const e of config.enemies) {
    if (e.splitInto === undefined) continue;
    if (!enemyIds.has(e.splitInto) || e.splitInto === e.id) errors.push(`enemies.${e.id}.splitInto invalide`);
    positive(e.splitCount ?? 0, `enemies.${e.id}.splitCount`);
  }
  if (!enemyIds.has(w.boss)) errors.push(`waves.boss : ennemi inconnu ${w.boss}`);
  if (w.composition.length === 0) errors.push('waves.composition est vide');
  for (const c of w.composition) {
    if (!enemyIds.has(c.enemy)) errors.push(`waves.composition : ennemi inconnu ${c.enemy}`);
    positive(c.weight, `waves.composition.${c.enemy}.weight`);
    positive(c.fromWave, `waves.composition.${c.enemy}.fromWave`);
  }
  if (!w.composition.some((c) => c.fromWave <= 1)) {
    errors.push('waves.composition : aucun ennemi disponible à la vague 1');
  }

  const towerIds = new Set<string>();
  if (config.towers.length === 0) errors.push('towers est vide');
  for (const t of config.towers) {
    if (towerIds.has(t.id)) errors.push(`tour en double : ${t.id}`);
    towerIds.add(t.id);
    positive(t.cost, `towers.${t.id}.cost`);
    positive(t.range, `towers.${t.id}.range`);
    ratio(t.slow, `towers.${t.id}.slow`);
    nonNegative(t.splashRadius, `towers.${t.id}.splashRadius`);
    for (const [key, value] of Object.entries(t.perLevel)) nonNegative(value, `towers.${t.id}.perLevel.${key}`);
    if (t.attack === 'field') {
      positive(t.slow, `towers.${t.id}.slow`);
      ratio(t.slow + t.perLevel.slow * config.upgrades.maxLevel, `towers.${t.id}.slow au niveau maximal`);
    } else if (t.attack === 'projectile' || t.attack === 'beam') {
      positive(t.damage, `towers.${t.id}.damage`);
      positive(t.fireInterval, `towers.${t.id}.fireInterval`);
      if (t.attack === 'projectile') positive(t.projectileSpeed, `towers.${t.id}.projectileSpeed`);
    } else {
      errors.push(`towers.${t.id}.attack inconnu`);
    }
  }
  positive(config.upgrades.costGrowth, 'upgrades.costGrowth');
  nonNegative(config.upgrades.maxLevel, 'upgrades.maxLevel');
  nonNegative(config.heightBonus.rangePerMeter, 'heightBonus.rangePerMeter');
  nonNegative(config.heightBonus.maxBonus, 'heightBonus.maxBonus');

  const r = config.mapRules;
  positive(r.slotMinSpacing, 'mapRules.slotMinSpacing');
  positive(r.padStep, 'mapRules.padStep');
  positive(r.minSlots, 'mapRules.minSlots');
  if (r.maxSlots < r.minSlots) errors.push('mapRules.maxSlots doit être >= minSlots');

  const o = config.osm;
  positive(o.zoneWidth, 'osm.zoneWidth');
  positive(o.zoneHeight, 'osm.zoneHeight');
  positive(o.entryLead, 'osm.entryLead');
  if (!(o.graphMargin >= o.entryLead)) errors.push('osm.graphMargin doit être >= entryLead');
  if (!(o.decorMargin >= o.entryLead)) errors.push('osm.decorMargin doit être >= entryLead (les virus marchent sur des rues dessinées)');
  positive(o.levelHeight, 'osm.levelHeight');
  for (const [kind, h] of Object.entries(o.defaultHeights)) positive(h, `osm.defaultHeights.${kind}`);
  ratio(o.gableMinRectangularity, 'osm.gableMinRectangularity');

  positive(o.addressMaxDistance, 'osm.addressMaxDistance');

  const pl = config.places;
  pl.radii.forEach((r, i) => positive(r, `places.radii[${i}]`));
  if (!pl.radii.includes(pl.defaultRadius)) errors.push('places.defaultRadius doit être un des rayons proposés');
  if (!(pl.maxRadius >= Math.max(...pl.radii))) errors.push('places.maxRadius doit être >= au plus grand rayon');
  positive(pl.radiusStep, 'places.radiusStep');
  positive(pl.minAverageRouteLength, 'places.minAverageRouteLength');
  positive(pl.geocodeResults, 'places.geocodeResults');
  nonNegative(pl.nominatimInterval, 'places.nominatimInterval');
  positive(pl.overpassTimeout, 'places.overpassTimeout');
  if (!(pl.requestTimeout > pl.overpassTimeout)) errors.push('places.requestTimeout doit dépasser overpassTimeout');
  positive(pl.overpassRounds, 'places.overpassRounds');
  nonNegative(pl.overpassRetryPause, 'places.overpassRetryPause');
  positive(pl.cacheMaxMaps, 'places.cacheMaxMaps');
  positive(pl.fallbackAttempts, 'places.fallbackAttempts');

  const p = config.progression;
  positive(p.gemFactor, 'progression.gemFactor');
  const upgradeIds = new Set(p.upgrades.map((u) => u.id));
  for (const u of p.upgrades) {
    if (u.costs.length !== u.maxLevel) errors.push(`progression.${u.id} : un coût par niveau`);
    u.costs.forEach((c, i) => positive(c, `progression.${u.id}.costs[${i}]`));
    if (u.requires && (!upgradeIds.has(u.requires.id) || u.requires.id === u.id)) {
      errors.push(`progression.${u.id}.requires invalide`);
    }
  }
  const a = config.ads;
  positive(a.continueHp, 'ads.continueHp');
  if (a.continueHp > config.base.hp) errors.push('ads.continueHp doit être <= base.hp');
  positive(a.gemsMultiplier, 'ads.gemsMultiplier');
  positive(a.boostMultiplier, 'ads.boostMultiplier');
  nonNegative(a.interstitialMinSeconds, 'ads.interstitialMinSeconds');
  return errors;
}

/** Configuration par défaut, validée au chargement. */
export function loadConfig(): GameConfig {
  const config = balance as unknown as GameConfig;
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Configuration invalide :\n- ${errors.join('\n- ')}`);
  }
  return config;
}
