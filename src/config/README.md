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
| `hp` | Points de vie de la base (20). |

## `economy`

| Champ | Rôle |
|---|---|
| `startMoney` | Argent de départ (200). |
| `waveBonusBase`, `waveBonusPerWave` | Bonus de fin de vague = `waveBonusBase + waveBonusPerWave × numéro de vague` (10 + 2 × n). |

## `score`

| Champ | Rôle |
|---|---|
| `perWaveCleared` | Points par vague terminée, multipliés par le numéro de la vague. |
| `perBaseHpOnVictory` | Points par PV de base restant en cas de victoire. |

Chaque ennemi tué rapporte aussi `score × numéro de vague` (voir `enemies`).

## `waves`

| Champ | Rôle |
|---|---|
| `total` | Nombre de vagues pour gagner (30). |
| `prepSeconds` | Préparation avant la vague 1 (10 s). |
| `interWaveSeconds` | Compte à rebours avant la vague suivante, lancé quand le dernier ennemi d'une vague est apparu. Le bouton « Vague suivante » l'écourte. |
| `hpGrowth` | PV d'un ennemi = PV de base × `hpGrowth`^(vague − 1) (1,12). |
| `countBase`, `countPerWave` | Nombre d'ennemis = `countBase + countPerWave × (vague − 1)`, arrondi. |
| `spawnIntervalStart`, `spawnIntervalPerWave`, `spawnIntervalMin` | Secondes entre deux apparitions : `start + perWave × (vague − 1)`, jamais sous `min`. |
| `laneOffsetMax` | Décalage latéral aléatoire maximal des ennemis par rapport à l'axe de la rue (visuel). |
| `composition` | Types d'ennemis : `enemy` (identifiant), `fromWave` (première vague où il apparaît), `weight` (poids dans la répartition). |

## `enemies`

| Champ | Rôle |
|---|---|
| `id` | Identifiant (`pieton`, `cycliste`, `voiture`). Le nom affiché est dans `src/i18n/fr.json` (`enemy.<id>.name`). |
| `hp` | PV à la vague 1. |
| `speed` | Vitesse (m/s). |
| `reward` | Argent gagné quand il est tué (5 à 40). |
| `baseDamage` | PV retirés à la base s'il l'atteint. |
| `score` | Points (× numéro de vague) quand il est tué. |

## `towers`

| Champ | Rôle |
|---|---|
| `id` | Identifiant (`mitrailleuse`, `canon`). Nom affiché : `tower.<id>.name` dans `src/i18n/fr.json`. |
| `kind` | `hitscan` = tir instantané sur une cible ; `shell` = obus qui explose (dégâts de zone). |
| `cost` | Prix. |
| `range` | Portée (m). |
| `damage` | Dégâts par tir (ou par explosion pour `shell`). |
| `fireInterval` | Secondes entre deux tirs. |
| `splashRadius` | (`shell`) Rayon de l'explosion (m). |
| `projectileSpeed` | (`shell`) Vitesse de l'obus (m/s). |

## `mapRules`

Règles de validité d'une carte (vérifiées par les tests, et plus tard pour les cartes générées).

| Champ | Rôle |
|---|---|
| `slotMinDistanceFromPath` | Distance minimale entre un emplacement et l'axe d'une rue (m). |
| `slotMinSpacing` | Distance minimale entre deux emplacements (m). |
| `baseMaxDistanceFromPathEnd` | Écart maximal entre la fin d'un chemin et la base (m). |

## `debug`

| Champ | Rôle |
|---|---|
| `startMoney` | Argent de départ quand l'adresse se termine par `?debug`. |
