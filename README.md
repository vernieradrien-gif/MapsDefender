# StreetDefense

Tower defense mobile (portrait, une main) joué dans les rues d'un vrai quartier, avec les données OpenStreetMap.
Les **Gloutons**, petites créatures gourmandes, veulent manger le gâteau du quartier ; tu les repousses avec des tourelles rigolotes installées sur les toits.
Cahier des charges complet : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

**État : jalon 1** : boucle de jeu complète sur une carte fixe (sans OpenStreetMap), avec le rendu « ville miniature ».

## Tester sur téléphone

👉 **https://vernieradrien-gif.github.io/MapsDefender/**

Le site est publié automatiquement par GitHub Actions à chaque modification de la branche `main`.

Mode test : **https://vernieradrien-gif.github.io/MapsDefender/?debug** (5 000 pièces au départ, pour atteindre vite la fin de partie).

## Comment jouer

- Touche **Jouer**. Tu as 10 s de préparation avant la vague 1.
- Touche un **toit marqué d'un ⊕** près de la rue (ou un **socle** au sol) : un menu propose le **Lance-bulles** (50 pièces, tire vite, petits dégâts) ou le **Lance-ballons** (100 pièces, lent, ses ballons d'eau éclaboussent toute une zone). Une tourelle trop chère est grisée.
- Touche une tourelle posée pour voir sa **portée**.
- Les **Gloutons** (verts), **Filous** (violets, rapides) et **Bouboules** (orange, résistantes) suivent les **flèches orange** jusqu'au **gâteau** : chaque Glouton qui l'atteint en mange une part (deux pour une Bouboule). Le gâteau a 20 parts.
- Chaque Glouton repoussé rapporte des pièces ; chaque vague terminée rapporte un bonus de 10 + 2 × numéro de vague.
- **Vague suivante** lance la prochaine vague sans attendre ; **x1 / x2 / x3** change la vitesse ; **⏸** met en pause.
- Victoire après la vague 30, défaite si le gâteau est entièrement mangé. Le score s'affiche dans les deux cas.

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
  geo/      carte fixe (fixed-map.json), générateur de quartier, placement des emplacements
  render/   Canvas 2D pseudo-3D : ville, personnages, effets
  ui/       HUD, menu radial, écrans (DOM au-dessus du canvas)
  ads/      interface showRewarded / showInterstitial (factice sur le web)
  storage/  accès localStorage protégé
  config/   balance.json : tout l'équilibrage (documenté dans src/config/README.md)
  i18n/     textes (fr.json)
```

Le jeu reçoit une **carte** (`GameMap` dans `src/game/types.ts`) : chemins, emplacements, base, rues, bâtiments, parcs, eau et arbres. Au jalon 1 elle est construite à partir de `src/geo/fixed-map.json` ; au jalon 4 elle viendra d'OpenStreetMap, sans changer la simulation ni le rendu.

## Décisions prises

Choix faits sans validation explicite, à revoir si besoin.

### Révision 1 : ville miniature et ton bon enfant

- **Noms** : le Lance-bulles remplace la Mitrailleuse, le Lance-ballons le Canon ; plus tard, le Lance-tartes remplacera le Sniper et la Barbe à papa le Ralentisseur. Les ennemis deviennent Glouton, Filou, Bouboule, puis Mastodonte et Roi Glouton. La base devient le gâteau du quartier, avec 20 parts = 20 PV. Les rôles et les chiffres du cahier des charges ne changent pas. Le cahier des charges a été mis à jour en ce sens (§ « Historique des révisions »).
- **Aucune violence** : un Glouton vaincu disparaît dans des confettis ; quand il atteint le gâteau, il en croque une part (« Miam ! »).
- **Rendu** : vue de dessus en pseudo-3D sur Canvas 2D, sans moteur 3D. Les bâtiments sont extrudés : murs ombrés selon l'orientation, fenêtres, toits plats ou à deux pans, ombres portées vers le sud-est. S'y ajoutent les arbres, un parc avec étang, des trottoirs, et des chevrons orange peints sur le chemin des Gloutons. Le décor est dessiné une seule fois dans un calque ; seuls les personnages et les effets sont redessinés à chaque image.
- **Emplacements** : sur les toits des bâtiments dont le centre est à moins de 40 m du chemin, au plus proche d'abord, espacés d'au moins 28 m. Des **socles** au sol complètent là où un tronçon du chemin n'a aucun emplacement à 30 m, puis jusqu'au minimum de 25. La carte fixe compte 46 emplacements : 45 toits et 1 socle placé à la main au milieu du parc, pour montrer à quoi ressemble un socle.
- **Carte fixe** : les rues, le parc, l'étang et la place du gâteau sont dessinés à la main. Les maisons et les arbres sont générés automatiquement le long des rues, toujours à l'identique (graine fixe).
- **Tirs** : les deux tourelles tirent des projectiles visibles qui suivent leur cible. La bulle touche un seul Glouton ; le ballon d'eau, lancé en cloche, éclabousse une zone de 20 m. Chaque tourelle vise le Glouton à portée le plus proche du gâteau.
- **Police** : Fredoka (licence libre OFL), embarquée dans le site ; aucun appel à un serveur externe.

### Jalon 1

- **Dépôt vide au départ** : une branche `main` a été créée avec un commit initial vide.
- **Unités** : tout est en mètres et secondes, comme le seront les cartes OSM. La carte fixe fait 220 × 382 m, avec un chemin d'environ 1 200 m.
- **Enchaînement des vagues** : 10 s de préparation. Ensuite, la vague suivante démarre 6 s après l'apparition du dernier Glouton de la vague en cours, donc les vagues peuvent se chevaucher. « Vague suivante » écourte ce compte à rebours ; le bouton est inactif pendant qu'une vague apparaît.
- **Bonus de fin de vague** : versé quand tous les Gloutons de la vague sont résolus, qu'ils soient repoussés ou arrivés au gâteau.
- **Score** : chaque Glouton repoussé rapporte ses points × le numéro de vague ; chaque vague terminée, 50 × le numéro de vague ; la victoire, 100 × les parts restantes.
- **Équilibrage provisoire**, vérifié par simulation automatique. Avec 46 emplacements, il faut environ 30 tourelles bien choisies pour sauver le gâteau ; avec moins de 20, on perd vers les vagues 26 à 30. Le début de partie est facile. L'équilibrage complet (améliorations, revente, nouveaux Gloutons) est l'objet du jalon 2.
- **Interface** : la construction passe par un menu radial. La barre basse contient « Vague suivante » et la vitesse ; la pause est dans la barre haute. Le jeu se met en pause automatiquement quand l'appli passe en arrière-plan.
- **Fluidité** : la simulation tourne à 60 pas/s fixes et l'affichage interpole les positions (écrans 90/120 Hz).
- **Vitesse** : le choix x1/x2/x3 est mémorisé sur l'appareil.
- **Erreurs** : en cas de plantage, le message s'affiche à l'écran.
- **Pas encore de PWA installable** (manifeste, mode hors ligne) : prévu aux jalons 3 et 5.
- **Outils** : Vite 8, TypeScript 7, Vitest 5, Node 22.
