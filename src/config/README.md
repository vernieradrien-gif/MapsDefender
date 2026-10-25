# Configuration d'équilibrage — `balance.json`

Toutes les valeurs de jeu sont ici : le code n'en contient aucune.
On peut modifier ce fichier directement depuis GitHub (crayon « Edit ») ; le site est reconstruit automatiquement après fusion dans `main`.
Les tests (`npm test`) vérifient que les valeurs imposées par le cahier des charges sont respectées ; `npm run simulate` montre l'effet d'un réglage sur 20 quartiers types (vague atteinte par un joueur moyen et un bon joueur).

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
| `hp` | Points de vie du bâtiment à protéger (20). |

## `economy`

| Champ | Rôle |
|---|---|
| `startMoney` | Argent de départ pour des itinéraires de longueur de référence (200), multiplié par le facteur de carte (voir `mapScaling`) et arrondi à 5. |
| `waveBonusBase`, `waveBonusPerWave` | Bonus de fin de vague = `waveBonusBase + waveBonusPerWave × numéro de vague` (10 + 2 × n). |
| `sellRefund` | Part du total investi (pose + améliorations) rendue à la revente (0,7). |

## `score`

| Champ | Rôle |
|---|---|
| `perWaveCleared` | Points par vague terminée, multipliés par le numéro de la vague. |
| `perBaseHpOnVictory` | Points par PV de base restant en cas de victoire. |

Chaque virus neutralisé rapporte aussi `score × numéro de vague` (voir `enemies`).

## `mapScaling`

Adaptation à la carte : facteur = longueur moyenne des itinéraires / `referenceRouteLength`, borné entre `minFactor` et `maxFactor`. Il multiplie le nombre de virus par vague et l'argent de départ.

| Champ | Rôle |
|---|---|
| `referenceRouteLength` | Longueur moyenne de référence (600 m). |
| `minFactor`, `maxFactor` | Bornes du facteur (0,75 et 1,5). |

## `waves`

| Champ | Rôle |
|---|---|
| `total` | Nombre de vagues pour gagner (30). |
| `prepSeconds` | Préparation avant la vague 1 (10 s). |
| `interWaveSeconds` | Compte à rebours avant la vague suivante, lancé quand le dernier virus d'une vague est apparu. Le bouton « Vague suivante » l'écourte. |
| `hpGrowth` | PV d'un virus = PV de base × `hpGrowth`^(vague − 1) (1,12), boss compris. |
| `countBase`, `countPerWave` | Nombre de virus = (`countBase + countPerWave × (vague − 1)`) × facteur de carte, arrondi. |
| `spawnIntervalStart`, `spawnIntervalPerWave`, `spawnIntervalMin` | Secondes entre deux apparitions : `start + perWave × (vague − 1)`, jamais sous `min`. |
| `laneOffsetMax` | Décalage latéral aléatoire maximal des virus par rapport à l'axe de la rue (visuel). |
| `bossEvery` | Un boss ferme la marche toutes les `bossEvery` vagues (10). |
| `boss` | Identifiant du boss (`megavirus`). |
| `composition` | Virus ordinaires : `enemy` (identifiant), `fromWave` (première vague où il apparaît), `weight` (poids dans la répartition). |

## `enemies` (les virus)

| Champ | Rôle |
|---|---|
| `id` | Identifiant (`virus`, `variant`, `amas`, `blinde`, `megavirus`). Le nom affiché est dans `src/i18n/fr.json` (`enemy.<id>.name`). |
| `hp` | PV à la vague 1 (20, 12, 60, 200, 800). |
| `speed` | Vitesse (m/s). |
| `reward` | Crédits gagnés quand il est neutralisé (5 à 40). |
| `baseDamage` | PV retirés à la base s'il l'atteint. |
| `score` | Points (× numéro de vague) quand il est neutralisé. |
| `splitInto`, `splitCount` | (Méga-virus) Virus qui apparaissent à sa place quand il est neutralisé : 3 Amas. |

## `towers` (les dispositifs sanitaires)

| Champ | Rôle |
|---|---|
| `id` | Identifiant (`pulverisateur`, `diffuseur`, `laser`, `purificateur`). Nom et rôle affichés : `tower.<id>.name` et `tower.<id>.role` dans `src/i18n/fr.json`. |
| `attack` | `projectile` (projectile à tête chercheuse), `beam` (rayon instantané : Laser UV) ou `field` (champ ralentisseur permanent : Purificateur). |
| `cost` | Prix en crédits (50, 100, 150, 75). |
| `range` | Portée (m) avant bonus de hauteur et améliorations. |
| `damage` | Dégâts par tir (sur la cible, ou sur toute la zone si `splashRadius` > 0). Inutile pour un champ. |
| `fireInterval` | Secondes entre deux tirs. Inutile pour un champ. |
| `projectileSpeed` | Vitesse du projectile (m/s), pour `projectile`. |
| `splashRadius` | Rayon du nuage (m) ; 0 = une seule cible. |
| `slow` | Ralentissement dans le champ (0,4 = 40 % plus lent). Plusieurs champs ne se cumulent pas : le plus fort s'applique. |
| `perLevel` | Gain par niveau d'amélioration : `damage` et `range` en proportion de la valeur de base (0,6 = +60 % par niveau), `fireRate` (l'intervalle entre deux tirs est divisé par 1 + `fireRate` × niveau), `slow` en points ajoutés (0,05 = 5 points). |

## `upgrades`

| Champ | Rôle |
|---|---|
| `maxLevel` | Nombre de niveaux d'amélioration (3). |
| `costGrowth` | Passer au niveau n coûte le prix du dispositif × `costGrowth`^n (1,6). |

## `heightBonus`

| Champ | Rôle |
|---|---|
| `rangePerMeter` | Bonus de portée par mètre de hauteur du toit (0,012 = +1,2 %). Aucun bonus sur un socle. |
| `maxBonus` | Bonus maximal (0,25 = +25 %). |

## `mapRules`

Règles de construction et de validité d'une carte (emplacements de tourelles).

| Champ | Rôle |
|---|---|
| `slotMinDistanceFromPath` | Distance minimale entre un socle et l'axe d'une rue (m). |
| `slotMinSpacing` | Distance minimale entre deux emplacements (m). |
| `roofMaxDistanceFromPath` | Un toit devient emplacement si le milieu du bâtiment est à moins de cette distance d'un itinéraire (m). Les abris de jardin sont exclus. |
| `padOffsetFromPath` | Distance des socles à l'axe de l'itinéraire (m). |
| `padStep` | Pas entre deux socles candidats le long de l'itinéraire (m). |
| `padCoverageRadius` | Un tronçon d'itinéraire sans emplacement dans ce rayon reçoit un socle (m). |
| `padClearance` | Écart minimal entre un socle et un bâtiment ou un plan d'eau (m). |
| `padElevation` | Hauteur d'un socle (m), pour le rendu. |
| `minSlots`, `maxSlots` | Nombre d'emplacements par carte (25 à 60). |
| `baseMaxDistanceFromPathEnd` | Écart maximal entre la fin d'un itinéraire et la base (m). |

## `osm`

Construction d'une carte à partir d'OpenStreetMap (`npm run import-map`) ou d'un quartier généré (`npm run simulate`). Changer ces valeurs demande de réimporter la carte (`npm run import-map -- --offline` suffit).

| Champ | Rôle |
|---|---|
| `zoneWidth`, `zoneHeight` | Zone de jeu (m), centrée sur le lieu (500 × 900, portrait ; le joueur zoome pour voir le détail). |
| `decorMargin` | Décor dessiné autour de la zone (m). Au moins `entryLead`, pour que l'arrivée des virus soit dessinée. |
| `graphMargin` | Le réseau des rues est construit sur la zone plus cette marge (220 m) : les virus arrivent par les rues qui viennent de l'extérieur. Au moins `entryLead`. |
| `entryLead` | Les virus apparaissent à cette distance avant le bord de la zone, sur la rue qui y entre (60 m). Une entrée est un bout du réseau élargi situé au moins à `entryLead` / 2 hors de la zone. |
| `entryMargin` | Les nœuds du réseau à moins de cette distance du bord de la zone, ou au-delà, ne sont jamais fusionnés ni supprimés par la simplification (m). |
| `streetWidths` | Largeur de chaussée (m) par type de voie OSM. |
| `graphTolerance` | Distance sous laquelle deux extrémités de rues sont raccordées (m). |
| `mergeDistance` | Deux carrefours reliés par un tronçon plus court sont fusionnés (8 m). |
| `minDeadEnd` | Les impasses plus courtes sont supprimées (30 m). |
| `simplifyTolerance` | Douglas-Peucker des itinéraires (3 m). |
| `drawTolerance` | Douglas-Peucker des rues dessinées et des surfaces (m). |
| `footprintTolerance` | Douglas-Peucker des contours de bâtiments (m). |
| `buildingMinArea` | Les bâtiments plus petits sont ignorés (m²). |
| `annexMaxArea`, `houseMaxArea`, `commercialMinArea` | Sans étiquette précise : abri sous `annexMaxArea`, maison sous `houseMaxArea`, immeuble sous `commercialMinArea`, grand bâtiment au-delà (m²). |
| `levelHeight` | Hauteur d'un niveau (3 m). |
| `defaultHeights` | Hauteur des murs (m) par type quand OSM ne donne ni hauteur ni niveaux. Elle donne le bonus de portée. |
| `gableMinRectangularity` | Une maison a un toit à deux pans si son emprise remplit au moins cette part de son rectangle englobant. |
| `baseProximity` | Choix de la base : score = emprise × hauteur / (1 + (distance au centre / `baseProximity`)²). |
| `baseMaxStreetDistance` | La base doit être à moins de cette distance d'une rue (m). |
| `paletteCount` | Nombre de variantes de couleurs des bâtiments. |
| `trees` | Arbres décoratifs : tentatives par hectare (`density`, `parkDensity`, `woodDensity`), écart minimal (`spacing`), rayon du feuillage (`radius`), variantes de couleurs (`paletteCount`). |

## `progression`

Monnaie permanente (gemmes) et arbre d'améliorations permanentes. L'équilibrage des vagues (`npm run simulate`) se fait sans ces bonus.

| Champ | Rôle |
|---|---|
| `gemFactor` | Gemmes gagnées en fin de partie = ⌊`gemFactor` × √score⌋ (0,18 : 10 000 points → 18 gemmes). |
| `upgrades` | Liste des améliorations : `id`, `maxLevel`, `costs` (prix en gemmes de chaque niveau, un par niveau), `effect` (effet par niveau), `requires` (prérequis `{ id, level }` ou `null`). |

Effet selon l'`id` (les noms affichés sont dans `src/i18n/fr.json`, clés `upgrade.<id>.name`) :

| `id` | Effet par niveau |
|---|---|
| `degats` | Dégâts de tous les dispositifs × (1 + `effect`) (0,05 = +5 %). |
| `portee` | Portée × (1 + `effect`) (0,04 = +4 %). |
| `credits` | `effect` crédits de plus au départ (après l'adaptation à la carte). |
| `offert` | `effect` Pulvérisateur(s) que le joueur pose gratuitement (le prix revient à la normale ensuite). |

## `ads`

Effets des publicités récompensées et rythme des interstitiels. Jamais de publicité pendant une vague (règle du code, pas un réglage).

| Champ | Rôle |
|---|---|
| `continueHp` | « Continuer » après une défaite (une fois par partie) : PV rendus à la base (10), sans dépasser `base.hp`. |
| `gemsMultiplier` | « Doubler » en fin de partie : multiplicateur des gemmes gagnées (2). |
| `boostMultiplier` | Boost proposé entre deux vagues : multiplicateur des crédits gagnés pendant la vague suivante (2). |
| `interstitialMinSeconds` | Délai minimal entre deux interstitiels (180 s). Jamais après la première partie du jour. |
| `fakeAdSeconds` | Durée de la fausse publicité affichée sur le web (3 s). |

## `debug`

| Champ | Rôle |
|---|---|
| `startMoney` | Crédits au départ quand l'adresse se termine par `?debug`. |
