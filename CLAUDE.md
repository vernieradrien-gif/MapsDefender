# CLAUDE.md — StreetDefense

Tower defense mobile (portrait, une main) joué sur le réseau routier réel autour d'une adresse.
**Source de vérité : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).** En cas de doute, c'est lui qui tranche ; tout écart doit être noté dans le README (section « Décisions »).

## Contraintes non négociables

- Coût d'infrastructure 0 € : aucun backend, aucune base de données, hébergement statique (GitHub Pages).
- Cartographie : OpenStreetMap uniquement (Nominatim, Overpass). **Jamais Google Maps.** Pas de tuiles.
- Cible : web (PWA) puis Android via Capacitor. Portrait, tactile, zones touchables ≥ 48 dp, 60 images/s.
- Publicités : identifiants de **test** AdMob uniquement, jamais de pub pendant une vague.
- Français d'abord ; **aucun texte affiché en dur** dans le code : tout passe par `src/i18n`.
- **Ton sérieux et non violent** : des virus stylisés (aucun gore) contre des dispositifs sanitaires ; pas d'armes, pas d'humains ni de véhicules comme ennemis. La base est un bâtiment.
- **Toutes les rues sont empruntées** : les virus entrent par toutes les rues qui mènent au quartier ; les itinéraires couvrent tout le réseau.
- **Style visuel** : ville miniature vue de dessus en pseudo-3D (rues, maisons, parcs), colorée, douce et moderne. Tourelles sur les toits (bonus de portée selon la hauteur), ou sur des socles si la carte manque de bâtiments.

## Règles de code

- TypeScript strict, pas de `any`. Canvas 2D natif, pas de moteur de jeu ni de framework UI.
- **Simulation séparée du rendu** : `src/game` ne touche jamais au DOM ni au canvas ; elle avance à pas de temps fixe (1/60 s).
- **Aucune valeur d'équilibrage en dur** : tout est dans `src/config/balance.json` (documenté dans `src/config/README.md`).
- Le jeu reçoit une **carte** (`GameMap` : chemins + emplacements + base), qu'elle soit codée en dur ou générée.
- Déterminisme : tout aléa de la simulation passe par le générateur à graine (`src/game/rng.ts`).
- Tests Vitest pour toute logique de jeu (économie, vagues, ciblage…) et de carte (graphe, Dijkstra, OSM).
- Style : modules courts, fonctions pures quand c'est possible, noms en anglais dans le code, commentaires et textes en français.

## Organisation

```
src/
  game/     simulation pure (Game, vagues, économie, tourelles, ciblage, boucle à pas fixe, joueurs automatiques)
  geo/      cartes : graphe des rues, Dijkstra, itinéraires, OSM (projection, simplification, bâtiments),
            assemblage, carte réelle (maps/), carte de démonstration, générateur de quartiers types
  render/   dessin Canvas 2D pseudo-3D (caméra, ville, personnages, effets)
  ui/       HUD, menu radial, écrans (DOM par-dessus le canvas)
  ads/      interface showRewarded/showInterstitial (factice sur le web)
  storage/  localStorage / IndexedDB
  config/   balance.json + types et validation
  i18n/     textes (fr.json)
scripts/    import-osm.ts, simulate.ts, captures.ts (tsx)
docs/       cahier des charges, captures
```

## Méthode

- Avancer **jalon par jalon** (cf. § 8 du cahier des charges) ; ne pas anticiper les jalons suivants au-delà de l'architecture.
- Une branche par jalon, commits clairs, pull request à la fin.
- Avant toute PR : `npm test` et `npm run build` doivent passer.
- Décisions prises sans validation explicite : les noter dans le README.
- Ne jamais supprimer un fichier existant sans accord.

## Commandes

```
npm install      # dépendances
npm run dev      # serveur de développement
npm test         # tests unitaires (Vitest)
npm run build    # vérification TypeScript (code + scripts) + build de production dans dist/
npm run import-map  # réimporte la carte réelle (--offline : rejoue scripts/.cache)
npm run simulate    # équilibrage : parties automatiques sur 20 quartiers types
npm run captures    # captures Playwright (Pixel 7) dans docs/captures/
npm run test-places # jalon 4 : 20 adresses variées (réseau ; --offline rejoue scripts/.cache/places)
npx cap sync android                   # après le build : copie dist/ dans le projet Android
cd android && ./gradlew assembleDebug  # APK de test (JDK 21 + SDK Android) ; la CI le construit aussi
```

Publicités : identifiants AdMob de **test** uniquement (`src/ads/admob.ts`, `android/app/src/main/AndroidManifest.xml`).
