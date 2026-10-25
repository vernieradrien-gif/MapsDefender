# StreetDefense

Tower defense mobile (portrait, une main) joué dans les rues d'un vrai quartier, avec les données OpenStreetMap.
Des **virus** stylisés entrent dans le quartier par toutes les rues qui y mènent ; tu les neutralises avec des **dispositifs sanitaires** installés sur les toits, pour protéger le **bâtiment central**.
Cahier des charges complet : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

**État : jalon 2 + révision 2.** La carte du jeu est un vrai quartier : **Villagexpo**, à Saint-Michel-sur-Orge (Essonne), importé d'OpenStreetMap. Quatre dispositifs, cinq virus, améliorations, revente, boss, équilibrage vérifié par simulation.

Données cartographiques **© OpenStreetMap contributors**, sous licence [ODbL](https://www.openstreetmap.org/copyright).

## Tester sur téléphone

👉 **https://vernieradrien-gif.github.io/MapsDefender/**

Le site est publié automatiquement par GitHub Actions à chaque modification de la branche `main`.

- **Mode test** : https://vernieradrien-gif.github.io/MapsDefender/?debug (5 000 crédits au départ, pour atteindre vite la fin de partie).
- **Carte de démonstration** (l'ancienne carte dessinée à la main) : https://vernieradrien-gif.github.io/MapsDefender/?demo

## Comment jouer

- Touche **Jouer**. Tu as 10 s de préparation avant la vague 1.
- Touche un **toit marqué d'un ⊕** près d'une rue (ou un **socle** au sol) : un menu en arc propose les 4 dispositifs. Un dispositif trop cher est grisé.
  - **Pulvérisateur** (50) : tire vite, petits dégâts, une cible.
  - **Diffuseur** (100) : lance une capsule qui éclate en nuage désinfectant (dégâts de zone), lent.
  - **Laser UV** (150) : longue portée, gros dégâts, très lent (rayon instantané).
  - **Purificateur** (75) : champ qui ralentit de 40 % les virus à portée (sans dégâts).
- Plus le toit est **haut**, plus la portée est grande (+1,2 % par mètre, jusqu'à +25 %) ; un socle ne donne aucun bonus.
- Touche un dispositif posé : sa **portée** s'affiche (et, en pointillés, celle du niveau suivant), avec deux boutons : **Améliorer** (3 niveaux) et **Vendre** (70 % de ce qu'il t'a coûté).
- Les virus entrent par les **cercles rouges** au bord de la carte et empruntent toutes les rues jusqu'à la **base** (toit bleu-vert à croix blanche, avec sa jauge de PV). Chaque virus qui l'atteint lui retire des PV (1 à 5 selon le virus). La base a 20 PV.
- Les virus : **Virus** (rouge), **Variant** (orange, rapide), **Amas** (violet, résistant), **Blindé** (gris-bleu, lent, gros dégâts à la base) et, toutes les 10 vagues, le **Méga-virus**, qui se divise en 3 Amas quand on le neutralise.
- Chaque virus neutralisé rapporte des crédits ; chaque vague terminée rapporte un bonus de 10 + 2 × numéro de vague.
- **Vague suivante** lance la prochaine vague sans attendre ; **x1 / x2 / x3** change la vitesse ; **⏸** met en pause.
- Victoire après la vague 30, défaite si la base n'a plus de PV. Le score s'affiche dans les deux cas.

## Développement

```
npm install        # dépendances
npm run dev        # serveur de développement (http://localhost:5173)
npm test           # tests unitaires (Vitest)
npm run build      # vérification TypeScript (code et scripts) + build de production dans dist/
npm run import-map # réimporte Villagexpo depuis OpenStreetMap (--offline : rejoue la dernière réponse)
npm run simulate   # parties automatiques sur 20 quartiers types + Villagexpo (équilibrage)
npm run captures   # captures Playwright (Pixel 7) dans docs/captures/ et mesure de fluidité
```

`npm run captures` demande une fois `npx playwright install chromium`.

Organisation du code (détails dans [`CLAUDE.md`](CLAUDE.md)) :

```
src/
  game/     simulation pure : Game, vagues, économie, tourelles, ciblage, adaptation à la carte, joueurs automatiques
  geo/      graphe des rues et itinéraires, OSM (projection, simplification, bâtiments), assemblage de carte,
            carte réelle (maps/villagexpo.json), carte de démonstration, générateur de quartiers types
  render/   Canvas 2D pseudo-3D : ville, virus, dispositifs, effets
  ui/       HUD, menus radiaux (construction, amélioration/revente), écrans (DOM au-dessus du canvas)
  ads/      interface showRewarded / showInterstitial (factice sur le web)
  storage/  accès localStorage protégé
  config/   balance.json : tout l'équilibrage et les règles de carte (documenté dans src/config/README.md)
  i18n/     textes (fr.json)
scripts/    import-osm.ts, simulate.ts, captures.ts (lancés avec tsx)
docs/       cahier des charges, captures d'écran
```

Le jeu reçoit une **carte** (`GameMap` dans `src/game/types.ts`) : itinéraires, entrées, emplacements, base et bâtiment de base, rues, bâtiments, surfaces et arbres. Les fonctions de `src/geo` (projection, découpe, graphe, simplification, bâtiments, assemblage) sont pures : le jalon 4 les réutilisera pour construire une carte à partir de n'importe quelle adresse.

## Décisions prises

Choix faits sans validation explicite, à revoir si besoin.

### Carte réelle : Villagexpo (Saint-Michel-sur-Orge)

- **Import** : `npm run import-map` fait une requête Nominatim (« Villagexpo, Saint-Michel-sur-Orge », qui renvoie le Hall du Villagexpo, 48,6298 N / 2,3249 E) puis une seule requête Overpass sur l'emprise de la zone et de son décor, avec deux miroirs de secours (overpass.kumi.systems, overpass.private.coffee). Les deux réponses sont gardées dans `scripts/.cache/` (non versionné) ; `--offline` les rejoue sans réinterroger les serveurs. Données réelles du 24/10/2026 : 475 éléments.
- **Zone de jeu** : un rectangle portrait de **350 × 660 m** centré sur le lieu géocodé, au lieu d'un cercle de 400 m de rayon : la carte entière tient sur l'écran d'un téléphone (environ 1,15 px par mètre sur un Pixel 7) sans zoom ni déplacement. Un décor de 70 m est dessiné autour.
- **Longueur moyenne des itinéraires : 408 m au lieu de 600 m** (écart au cahier des charges). Une zone de 500 × 940 m atteindrait 653 m, mais l'échelle tomberait à 0,8 px par mètre, trop petit sans zoom. Le zoom et le déplacement de la carte sont à prévoir au jalon 4, qui pourra alors agrandir la zone. En attendant, l'adaptation à la carte compense (moins de virus, moins de crédits au départ).
- **Base** : le bâtiment le plus imposant ou central (score = emprise × hauteur / (1 + (distance au centre / 80 m)²), parmi les bâtiments proches d'une rue) : c'est le **Hall du Villagexpo**. Il est relié à la rue la plus proche en coupant le tronçon à l'endroit le plus proche (plutôt qu'au carrefour le plus proche, parfois à plus de 100 m).
- **Entrées** : les 5 extrémités de rues coupées par le bord de la zone. 12 itinéraires.
- **Toutes les rues sont empruntées… sauf les impasses** : 34 tronçons sur 48 (2,1 km sur 2,8 km de réseau). Les 14 autres sont des impasses de plus de 30 m (Villagexpo en compte beaucoup) : on ne peut pas les emprunter sans demi-tour, donc sans repasser par un carrefour. Elles restent dessinées. `coverRoutes` cherche un itinéraire exact (calcul de flot) quand le plus court accès coupe la suite : seules les rues réellement impossibles à emprunter restent de côté (vérifié par un test exhaustif sur 60 quartiers aléatoires).
- **Simplification (§ 4)** : plus grande composante connexe, impasses de moins de 30 m supprimées, Douglas-Peucker à 3 m sur les itinéraires. La fusion des nœuds à moins de 8 m ne fusionne que des carrefours reliés par une rue (deux impasses voisines non reliées ne sont pas raccordées). Les entrées au bord de la zone ne sont jamais déplacées ni supprimées. Les rues dessinées gardent leur tracé fin (0,5 m).
- **Bâtiments réels** : 1 216 bâtiments sur 1 230 sont étiquetés `building=yes`, et seuls 4 ont un nombre d'étages. Le type est donc déduit des étiquettes, puis du nom (école, gymnase, hall, église… = bâtiment public ; « Résidence » = immeuble ; « Centre commercial » = commerce), puis de la surface : abri sous 25 m², maison sous 250 m², immeuble sous 1 500 m², grand bâtiment au-delà. Hauteur : `height`, sinon niveaux × 3 m, sinon 6 m (maison), 12 m (immeuble), 9 m (public), 7 m (commerce), 2,6 m (abri). Une maison dont l'emprise remplit au moins 88 % de son rectangle englobant a un toit à deux pans posé sur ce rectangle ; toutes les autres formes gardent leur vraie emprise avec un toit plat. Les abris de jardin n'accueillent pas de tourelle.
- **Emplacements** : 60 toits (le maximum), au milieu du toit même pour un bâtiment en L ou en U.
- **Arbres** : générés (718), pas importés.
- **Fichier** : `src/geo/maps/villagexpo.json`, 146 Ko (28 Ko compressé), coordonnées arrondies à 10 cm, avec la requête, la date des données et la licence. La carte est validée au chargement ; si elle est invalide, la carte de démonstration la remplace (message sur l'accueil). `?demo` force la carte de démonstration.
- **Mention « © OpenStreetMap contributors »** sur l'écran d'accueil et dans ce README.

### Révision 2 : thème sérieux

- **Base** : un bâtiment (toit bleu-vert, croix sanitaire, halo) avec une jauge de PV au-dessus. La carte de démonstration a désormais un bâtiment de base (« Centre de santé ») à la place du gâteau.
- **Dispositifs** : le Laser UV frappe instantanément (rayon) ; le Purificateur est un champ permanent sans dégâts, et plusieurs champs ne se cumulent pas (on garde le plus fort) ; le nuage du Diffuseur éclate à l'impact.
- **Bonus de hauteur** : calculé sur la hauteur des murs du bâtiment (sans le faîtage), seulement pour un toit. Il est affiché sur la fiche de la tourelle.
- **Repères d'entrée** : un cercle rouge pointillé qui pulse, avec une flèche vers l'intérieur, à chaque rue d'entrée. Ils remplacent les chevrons orange. Les itinéraires ne sont plus peints : toutes les rues servent.
- **Visuels** : virus sans visage (sphères à pointes qui tournent), qui se dissolvent en fines particules ; dispositifs blancs à accents bleu-vert ; monnaie appelée « crédits ».
- **Rendu des emprises non convexes** : normales sortantes selon le sens de parcours du polygone, murs dessinés du plus loin au plus proche, ombres = emprise + emprise décalée + un quadrilatère par arête, rebord de toit seulement sur les formes convexes. Le décor des parcs et les reflets de l'eau restent dans leur contour.

### Jalon 2 : contenu et équilibrage

- **Améliorations** : passer au niveau n (1 à 3) coûte coût × 1,6^n (Pulvérisateur : 80, 128, 205). Chaque niveau donne +60 % de dégâts, +15 % de cadence et +6 % de portée ; pour le Purificateur, +10 % de portée et 5 points de ralentissement en plus. **Revente** : 70 % du total investi (pose + améliorations), arrondi à l'inférieur.
- **Boss** : un Méga-virus ferme la marche des vagues 10, 20 et 30. Ses PV suivent la même croissance que les autres virus (×1,12 par vague). Il retire 5 PV s'il atteint la base. Neutralisé, il se divise en 3 Amas qui repartent de sa position ; la vague n'est soldée qu'une fois les fragments résolus.
- **Adaptation à la carte** : facteur = longueur moyenne des itinéraires / 600 m, borné entre 0,75 et 1,5. Il multiplie le nombre de virus par vague et l'argent de départ (arrondi à 5). Villagexpo (408 m) : facteur 0,75, soit 150 crédits au départ.
- **Menus** : construction par un menu radial en arc (4 boutons, nom sous chacun) ; les rôles et les prix sont rappelés sur l'écran d'accueil. Menu radial d'une tourelle posée : Améliorer, Vendre, et une fiche (niveau, portée, bonus de hauteur).
- **Simulation** (`npm run simulate`) : 20 quartiers types générés (6 grilles, 5 quartiers denses d'immeubles, 5 zones rurales clairsemées avec socles, 4 grilles à diagonales ; 1 à 4 entrées ; zones de 300 × 560 à 400 × 740 m), plus Villagexpo, 3 parties par carte et par joueur.
  - Joueur **moyen** : il pose dès qu'il peut sur un emplacement pris au hasard parmi les 35 % les mieux placés, alterne les dispositifs selon un cycle fixe, améliore de temps en temps, et n'agit qu'une fois toutes les 2 s.
  - Joueur **bon** : il choisit à chaque fois l'action la plus rentable (couverture des itinéraires × dégâts utiles / coût), quitte à économiser.
- **Réglages issus de la simulation** : récompenses 8 / 7 / 15 / 35 / 40 crédits ; vitesses 35 / 58 / 38 / 21 / 16 m/s ; 6 virus à la vague 1, puis 0,9 de plus par vague. Résultat sur les 20 cartes types :

  | Joueur | Vague atteinte (moyenne) | Victoires |
  |---|---|---|
  | moyen | **13,4** (cible 12 à 15) | 0 % |
  | bon | 24,9 | 8 % |

  Écarts notés : la difficulté dépend beaucoup de la carte (une seule entrée : vague 18 à 24 pour le joueur moyen ; 4 entrées : vague 9 à 10). **Sur Villagexpo, le joueur moyen va plus loin (vague 20 en moyenne)** : ses itinéraires courts se rejoignent tous autour du Hall, entouré de toits. L'adaptation à la carte ne tient compte que de la longueur des itinéraires, comme le demande le cahier des charges ; la densité d'emplacements pourrait s'y ajouter au jalon 4. Le joueur « bon » automatique joue mal une carte rurale (vague 11) : c'est une limite du joueur automatique, pas de la carte.
- **Mode test** (`?debug`) : en plus des 5 000 crédits, la page expose `window.streetDefense` (avancer le temps, faire construire le joueur automatique, test de charge, coût d'une image), utilisé par `npm run captures`.
- **Captures et fluidité** : `docs/captures/` (profil Pixel 7 de Playwright : 412 × 839 px visibles). Avec 150 à 176 virus à l'écran, Chromium sans affichage (sur PC) tient **60 images/s**. Une image coûte 12 ms dans ce Chromium, qui dessine sans carte graphique ; elle coûte 2,1 ms (0,14 ms sans virus) dans un navigateur avec accélération graphique. **Pas encore vérifié sur un vrai téléphone.**
- **Pas encore faits** (jalon 3) : gemmes, améliorations permanentes, sauvegarde de la partie, publicités.

### Révision 1 : ville miniature

Décisions toujours valables : rendu pseudo-3D sur Canvas 2D sans moteur 3D, décor dessiné une seule fois dans un calque, police Fredoka embarquée, socles au sol quand les toits manquent, placement des emplacements (toits à moins de 40 m d'un itinéraire, espacés d'au moins 28 m), ciblage du virus le plus proche de la base. Remplacé par la révision 2 : les noms (Lance-bulles, Gloutons, gâteau…), les confettis, les chevrons sur le chemin unique.

### Jalon 1

- **Dépôt vide au départ** : une branche `main` a été créée avec un commit initial vide.
- **Unités** : tout est en mètres et secondes, comme les cartes OSM.
- **Enchaînement des vagues** : 10 s de préparation. Ensuite, la vague suivante démarre 6 s après l'apparition du dernier virus de la vague en cours, donc les vagues peuvent se chevaucher. « Vague suivante » écourte ce compte à rebours ; le bouton est inactif pendant qu'une vague apparaît.
- **Bonus de fin de vague** : versé quand tous les virus de la vague sont résolus, qu'ils soient neutralisés ou arrivés à la base.
- **Score** : chaque virus neutralisé rapporte ses points × le numéro de vague ; chaque vague terminée, 50 × le numéro de vague ; la victoire, 100 × les PV restants.
- **Interface** : la barre basse contient « Vague suivante » et la vitesse ; la pause est dans la barre haute. Le jeu se met en pause automatiquement quand l'appli passe en arrière-plan.
- **Fluidité** : la simulation tourne à 60 pas/s fixes et l'affichage interpole les positions (écrans 90/120 Hz).
- **Vitesse** : le choix x1/x2/x3 est mémorisé sur l'appareil.
- **Erreurs** : en cas de plantage, le message s'affiche à l'écran.
- **Pas encore de PWA installable** (manifeste, mode hors ligne) : prévu aux jalons 3 et 5.
- **Outils** : Vite 8, TypeScript 7, Vitest 5, Node 22 ; tsx pour les scripts, Playwright pour les captures.
