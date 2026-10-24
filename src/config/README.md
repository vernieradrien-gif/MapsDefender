# Configuration d'équilibrage — `balance.json`

Toutes les valeurs de jeu sont ici : le code n'en contient aucune.
On peut modifier ce fichier directement depuis GitHub (crayon « Edit ») ; le site est reconstruit automatiquement après fusion dans `main`.
Les tests (`npm test`) vérifient que les valeurs imposées par le cahier des charges sont respectées.

Unités : distances en **mètres** (unités de carte), durées en **secondes**, vitesses en **m/s**.

## `simulation`

| Champ | Rôle |
|---|---|
| `stepsPerSecond` | Mises à jour de la simulation par seconde (pas fixe, 60). |
| `maxFrameSeconds` | Durée maximale d'une image prise en compte (évite un saut après une pause). |
| `maxStepsPerFrame` | Nombre maximal de pas de simulation par image. |
| `speeds` | Vitesses proposées par le bouton de vitesse (×1, ×2, ×3). |

## `base`

| Champ | Rôle |
|---|---|
| `hp` | Points de vie de la base : le gâteau compte autant de parts (20). |

## `economy`

| Champ | Rôle |
|---|---|
| `startMoney` | Argent de départ (200). |
| `waveBonusBase`, `waveBonusPerWave` | Bonus de fin de vague = `waveBonusBase + waveBonusPerWave × numéro de vague` (10 + 2 × n). |

## `score`

| Champ | Rôle |
|---|---|
| `perWaveCleared` | Points par vague terminée, multipliés par le numéro de la vague. |
| `perBaseHpOnVictory` | Points par part de gâteau restante en cas de victoire. |

Chaque Glouton repoussé rapporte aussi `score × numéro de vague` (voir `enemies`).

## `waves`

| Champ | Rôle |
|---|---|
| `total` | Nombre de vagues pour gagner (30). |
| `prepSeconds` | Préparation avant la vague 1 (10 s). |
| `interWaveSeconds` | Compte à rebours avant la vague suivante, lancé quand le dernier Glouton d'une vague est apparu. Le bouton « Vague suivante » l'écourte. |
| `hpGrowth` | PV d'un Glouton = PV de base × `hpGrowth`^(vague − 1) (1,12). |
| `countBase`, `countPerWave` | Nombre de Gloutons = `countBase + countPerWave × (vague − 1)`, arrondi. |
| `spawnIntervalStart`, `spawnIntervalPerWave`, `spawnIntervalMin` | Secondes entre deux apparitions : `start + perWave × (vague − 1)`, jamais sous `min`. |
| `laneOffsetMax` | Décalage latéral aléatoire maximal des Gloutons par rapport à l'axe de la rue (visuel). |
| `composition` | Types de Gloutons : `enemy` (identifiant), `fromWave` (première vague où il apparaît), `weight` (poids dans la répartition). |

## `enemies` (les Gloutons)

| Champ | Rôle |
|---|---|
| `id` | Identifiant (`glouton`, `filou`, `bouboule`). Le nom affiché est dans `src/i18n/fr.json` (`enemy.<id>.name`). |
| `hp` | PV à la vague 1. |
| `speed` | Vitesse (m/s). |
| `reward` | Pièces gagnées quand il est repoussé (5 à 40). |
| `baseDamage` | Parts de gâteau mangées s'il atteint le gâteau. |
| `score` | Points (× numéro de vague) quand il est repoussé. |

## `towers` (les tourelles)

| Champ | Rôle |
|---|---|
| `id` | Identifiant (`bulles`, `ballons`). Nom affiché : `tower.<id>.name` dans `src/i18n/fr.json`. |
| `cost` | Prix en pièces. |
| `range` | Portée (m). |
| `damage` | Dégâts par projectile (sur la cible, ou sur toute la zone si `splashRadius` > 0). |
| `fireInterval` | Secondes entre deux tirs. |
| `projectileSpeed` | Vitesse de la bulle ou du ballon (m/s). |
| `splashRadius` | Rayon d'éclaboussure (m) ; 0 = une seule cible. |

## `mapRules`

Règles de construction et de validité d'une carte (emplacements de tourelles).

| Champ | Rôle |
|---|---|
| `slotMinDistanceFromPath` | Distance minimale entre un socle et l'axe d'une rue (m). |
| `slotMinSpacing` | Distance minimale entre deux emplacements (m). |
| `roofMaxDistanceFromPath` | Un toit devient emplacement si le centre du bâtiment est à moins de cette distance du chemin (m). |
| `padOffsetFromPath` | Distance des socles à l'axe du chemin (m). |
| `padStep` | Pas entre deux socles candidats le long du chemin (m). |
| `padCoverageRadius` | Un tronçon du chemin sans emplacement dans ce rayon reçoit un socle (m). |
| `padClearance` | Écart minimal entre un socle et un bâtiment ou un plan d'eau (m). |
| `padElevation` | Hauteur d'un socle (m), pour le rendu. |
| `minSlots`, `maxSlots` | Nombre d'emplacements par carte (25 à 60). |
| `baseMaxDistanceFromPathEnd` | Écart maximal entre la fin d'un chemin et la base (m). |

## `debug`

| Champ | Rôle |
|---|---|
| `startMoney` | Pièces au départ quand l'adresse se termine par `?debug`. |
