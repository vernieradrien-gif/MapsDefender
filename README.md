# StreetDefense

Tower defense mobile (portrait, une main) joué sur les rues réelles autour d'une adresse, avec les données OpenStreetMap.
Cahier des charges complet : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

**État : jalon 1** — boucle de jeu complète sur une carte fixe (sans OpenStreetMap).

## Tester sur téléphone

👉 **https://vernieradrien-gif.github.io/MapsDefender/**

Le site est publié automatiquement par GitHub Actions à chaque modification de la branche `main`.
Prérequis (une seule fois) : *Settings > Pages > Source : GitHub Actions*.

Mode test : **https://vernieradrien-gif.github.io/MapsDefender/?debug** (5 000 d'argent au départ, pour atteindre vite la fin de partie).

## Comment jouer

- Touchez **Jouer**. Vous avez 10 s de préparation avant la vague 1.
- Touchez un **emplacement ◯** le long de la rue : un menu radial propose la **Mitrailleuse** (50, tir rapide, faibles dégâts) ou le **Canon** (100, lent, dégâts de zone). Une tour trop chère est grisée.
- Touchez une tour posée pour voir sa **portée**.
- Les **Piétons** (ronds jaunes), **Cyclistes** (triangles roses, rapides) et **Voitures** (rectangles rouges, résistantes) suivent la rue jusqu'à la base (hexagone violet, 20 PV).
- Chaque ennemi tué rapporte de l'argent ; chaque vague terminée rapporte un bonus de 10 + 2 × numéro de vague.
- **Vague suivante** lance la prochaine vague sans attendre le compte à rebours ; le bouton **x1 / x2 / x3** change la vitesse ; **⏸** met en pause.
- Victoire après la vague 30, défaite si la base tombe à 0 PV. Le score s'affiche dans les deux cas.

## Développement

```
npm install      # dépendances
npm run dev      # serveur de développement (http://localhost:5173)
npm test         # tests unitaires (Vitest)
npm run build    # vérification TypeScript + build de production dans dist/
```

Organisation du code (détails dans [`CLAUDE.md`](CLAUDE.md)) :

```
src/
  game/     simulation pure : Game, vagues, économie, ciblage, boucle à pas fixe (+ tests)
  geo/      carte fixe du jalon 1 (fixed-map.json) ; plus tard OSM, graphe, Dijkstra
  render/   Canvas 2D : caméra, thème néon, effets
  ui/       HUD, menu radial, écrans (DOM au-dessus du canvas)
  ads/      interface showRewarded / showInterstitial (factice sur le web)
  storage/  accès localStorage protégé
  config/   balance.json — tout l'équilibrage (documenté dans src/config/README.md)
  i18n/     textes (fr.json)
```

Le jeu reçoit une **carte** (`GameMap` dans `src/game/types.ts` : chemins + emplacements + base + rues décoratives). Au jalon 1 elle vient de `src/geo/fixed-map.json` ; au jalon 4 elle sera générée depuis OpenStreetMap, sans changer la simulation.

## Décisions prises (jalon 1)

Choix faits sans validation explicite, à revoir si besoin :

- **Dépôt vide au départ** : une branche `main` a été créée avec un commit initial vide, pour pouvoir ouvrir la pull request.
- **Unités** : tout est en mètres et secondes, comme le seront les cartes OSM. La carte fixe fait 240 × 395 m, avec un chemin de ~1 140 m et 28 emplacements à ~15 m de l'axe de la rue.
- **Enchaînement des vagues** : 10 s de préparation, puis la vague suivante démarre automatiquement 6 s après l'apparition du dernier ennemi de la vague en cours (les vagues peuvent donc se chevaucher). « Vague suivante » écourte ce compte à rebours ; le bouton est inactif pendant qu'une vague apparaît, ce qui évite de lancer deux vagues d'un double toucher.
- **Bonus de fin de vague** : versé quand tous les ennemis de la vague sont résolus (tués ou arrivés à la base).
- **Score** : ennemi tué = points de l'ennemi × numéro de vague ; vague terminée = 50 × numéro de vague ; victoire = 100 × PV restants.
- **Ciblage** : chaque tour vise l'ennemi à portée le plus proche de la base. La Mitrailleuse touche instantanément ; l'obus du Canon suit sa cible puis explose (rayon 20 m).
- **Valeurs non fixées par le cahier des charges** (vitesses, portées, dégâts, gains par ennemi, nombre d'ennemis par vague) : voir `src/config/balance.json`. Équilibrage **provisoire**, vérifié par simulation automatique : avec les 28 emplacements bien remplis on gagne en perdant quelques PV dans les dernières vagues ; avec moins d'une vingtaine de tours on perd vers la vague 29-30. Le début de partie est facile ; l'équilibrage complet (améliorations, revente, nouveaux ennemis) est l'objet du jalon 2.
- **Interface** : la construction passe par le menu radial (§ 5 du cahier des charges) ; la barre basse contient « Vague suivante » et la vitesse, la pause est dans la barre haute. Pause automatique quand l'appli passe en arrière-plan.
- **Fluidité** : la simulation tourne à 60 pas/s fixes ; l'affichage interpole les positions, pour rester fluide sur les écrans 90/120 Hz. Mesure en navigateur : < 1 ms de calcul par image avec 400 ennemis et 28 tours.
- **Vitesse** : le choix x1/x2/x3 est mémorisé sur l'appareil.
- **Erreurs** : en cas de plantage, le message s'affiche à l'écran (pratique pour le signaler avec une capture).
- **Pas encore de PWA installable** (manifeste, mode hors ligne) : prévu avec les écrans et la sauvegarde (jalons 3 et 5).
- **Outils** : Vite 8, TypeScript 7, Vitest 5, Node 22.
