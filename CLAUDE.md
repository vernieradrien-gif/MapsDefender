# CLAUDE.md — StreetDefense

Tower defense mobile (portrait, une main) joué sur le réseau routier réel autour d'une adresse.
**Source de vérité : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).** En cas de doute, c'est lui qui tranche ; tout écart doit être noté dans le README (section « Décisions »).

## Contraintes non négociables

- Coût d'infrastructure 0 € : aucun backend, aucune base de données, hébergement statique (GitHub Pages).
- Cartographie : OpenStreetMap uniquement (Nominatim, Overpass). **Jamais Google Maps.** Pas de tuiles.
- Cible : web (PWA) puis Android via Capacitor. Portrait, tactile, zones touchables ≥ 48 dp, 60 images/s.
- Publicités : identifiants de **test** AdMob uniquement, jamais de pub pendant une vague.
- Français d'abord ; **aucun texte affiché en dur** dans le code : tout passe par `src/i18n`.

## Règles de code

- TypeScript strict, pas de `any`. Canvas 2D natif, pas de moteur de jeu ni de framework UI.
- **Simulation séparée du rendu** : `src/game` ne touche jamais au DOM ni au canvas ; pas de temps fixe de 1/60 s.
- **Aucune valeur d'équilibrage en dur** : tout est dans `src/config/balance.json` (documenté dans `src/config/README.md`).
- Le jeu reçoit une **carte** (`GameMap` : chemins + emplacements + base), qu'elle soit codée en dur ou générée.
- Déterminisme : tout aléa de la simulation passe par le générateur à graine (`src/game/rng.ts`).
- Tests Vitest pour toute logique de jeu (économie, vagues, ciblage…) et, plus tard, graphe et Dijkstra.
- Style : modules courts, fonctions pures quand c'est possible, noms en anglais dans le code, commentaires et textes en français.

## Organisation

```
src/
  game/     simulation pure (Game, vagues, économie, ciblage, boucle à pas fixe)
  geo/      cartes : carte fixe (jalon 1), plus tard OSM, graphe, Dijkstra
  render/   dessin Canvas 2D (caméra, thème néon, effets)
  ui/       HUD, menu radial, écrans (DOM par-dessus le canvas)
  ads/      interface showRewarded/showInterstitial (factice sur le web)
  storage/  localStorage / IndexedDB
  config/   balance.json + types et validation
  i18n/     textes (fr.json)
docs/       cahier des charges
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
npm run build    # vérification TypeScript + build de production dans dist/
```
