# Cahier des charges : Tower defense des rues

> Nom provisoire : **StreetDefense**
>
> Ce document est la **source de vérité** du projet. Toute décision qui s'en écarte doit être notée dans le README.

## Sommaire

1. [Vision et contraintes](#1-vision-et-contraintes)
2. [Stack](#2-stack)
3. [Gameplay](#3-gameplay)
4. [Génération de carte (jalon 4)](#4-génération-de-carte-jalon-4)
5. [Écrans](#5-écrans)
6. [Publicités (jalon 3)](#6-publicités-jalon-3)
7. [Données et partage sans serveur](#7-données-et-partage-sans-serveur)
8. [Jalons](#8-jalons)
9. [Critères d'acceptation v1](#9-critères-dacceptation-v1)

---

## 1. Vision et contraintes

Tower defense mobile Android où le joueur saisit une adresse (ou utilise sa position) et joue sur le réseau routier réel autour de ce point.

- **Coût d'infrastructure 0 €** : aucun backend, hébergement statique gratuit (GitHub Pages), aucune base de données.
- **Données cartographiques** : OpenStreetMap uniquement. **Jamais Google Maps.**
- **Cible** : Android (Capacitor) + version web PWA. Français d'abord, textes externalisés (i18n).
- **Sessions** de 3 à 8 minutes, une main, portrait.
- **Chaque lieu = carte unique et rejouable** (même adresse = même carte, graine déterministe).
- **Ton sérieux et non violent** : des **virus** stylisés veulent pénétrer dans le quartier ; le joueur les neutralise avec des **dispositifs sanitaires** (pulvérisateur, diffuseur, laser UV, purificateur). Aucun gore, pas d'armes réalistes, ni humains ni véhicules comme ennemis.
- **Style visuel** : ville miniature vue de dessus en pseudo-3D (rues, maisons, parcs, arbres), belle et moderne.
- **Revenu** : pubs récompensées et interstitiels entre deux parties.
- **Hors v1** : multijoueur, classement en ligne, comptes, achats intégrés, tuiles de carte.

## 2. Stack

- TypeScript + Vite
- Canvas 2D natif
- GitHub Pages
- Capacitor
- AdMob (`@capacitor-community/admob`) avec consentement UMP
- Nominatim (géocodage) et Overpass (routes) appelés directement depuis l'appli
- IndexedDB (cartes en cache) + localStorage (progression)

### Règles

- Aucun backend.
- Modules :
  - `geo/` (OSM, graphe)
  - `game/` (simulation)
  - `render/`
  - `ui/`
  - `ads/` (interface unique `showRewarded` / `showInterstitial`, version factice sur le web)
  - `storage/`
  - `config/` (équilibrage en JSON, aucune valeur en dur)
  - `i18n/`
- Simulation séparée du rendu, à pas de temps fixe (60 mises à jour/s).
- Identifiants de test AdMob uniquement.

### Limites d'usage

- **Nominatim** : 1 requête/s maximum, recherche déclenchée par un bouton (pas d'autocomplétion), identification de l'appli.
- **Overpass** : une requête par carte, rayon limité, timeout court, 2 serveurs miroirs en secours.
- Si la fréquentation grandit : cartes de grandes villes précalculées en JSON statique dans le dépôt.

## 3. Gameplay

Les virus entrent dans le quartier par **toutes les rues qui y mènent** et **toutes les rues sont empruntées** : chaque rue fait partie d'au moins un itinéraire, autant de chemins alternatifs jusqu'à la base, **le bâtiment à protéger**. Le joueur installe des tourelles **sur les toits** des bâtiments proches des rues ou, à défaut, sur des **socles** posés au sol.

**Boucle** : préparation 10 s, vagues successives, argent gagné pour chaque virus neutralisé, base à 20 PV, victoire après 30 vagues, score dans tous les cas.

Un virus neutralisé se dissout (pas de violence graphique).

**Bonus de hauteur** : une tourelle posée sur un bâtiment gagne de la portée selon la hauteur du toit (par exemple +1,2 % par mètre, plafonné à +25 %) ; pas de bonus sur un socle.

### Tourelles (4)

| Tourelle | Rôle (nom d'origine) | Coût | Caractéristiques |
|---|---|---|---|
| Pulvérisateur | (Mitrailleuse) | 50 | cadence rapide, faible dégât |
| Diffuseur | (Canon) | 100 | capsule qui éclate en nuage désinfectant : zone, lent |
| Laser UV | (Sniper) | 150 | longue portée, dégâts élevés, très lent |
| Purificateur | (Ralentisseur) | 75 | champ qui ralentit les virus de 40 % dans sa zone |

- 3 niveaux d'amélioration par tour (coût ×1,6 par niveau).
- Revente à 70 %.

### Ennemis : les virus (5)

| Virus | Rôle (nom d'origine) | PV | Caractéristiques |
|---|---|---|---|
| Virus | (Piéton) | 20 | vitesse moyenne |
| Variant | (Cycliste) | 12 | rapide |
| Amas | (Voiture) | 60 | — |
| Blindé | (Camion) | 200 | lent, gros dégâts à la base |
| Méga-virus (boss, toutes les 10 vagues) | (Convoi) | 800 | se divise en 3 Amas quand il est neutralisé |

### Économie

- Argent de départ : 200.
- Gain par ennemi vaincu : 5 à 40.
- Bonus de fin de vague : 10 + 2 × numéro de vague.
- Monnaie permanente (**gemmes**) gagnée selon le score, dépensée dans un petit arbre d'améliorations permanentes (+5 % dégâts, +1 emplacement initial, argent de départ…).

### Adaptation à la carte

- Nombre d'ennemis par vague et argent de départ proportionnels à la longueur moyenne des itinéraires.
- Plusieurs entrées et itinéraires : les vagues se répartissent entre eux ; tous convergent vers la base.

## 4. Génération de carte (jalon 4)

1. **Géocodage** Nominatim (ou position GPS avec consentement).
2. **Requête Overpass** dans un rayon de 400 m (300 à 500), en une seule requête :
   - voies `highway=*` — types retenus : `residential`, `tertiary`, `secondary`, `primary`, `unclassified`, `living_street` ; exclus : autoroutes, chemins piétons, escaliers, voies de service ;
   - bâtiments `building=*` (emplacements sur les toits et décor) ;
   - espaces verts et eau pour le décor : `leisure=park`, `leisure=garden`, `landuse=grass`, `landuse=forest`, `natural=wood`, `natural=water`.
3. **Projection** équirectangulaire locale en mètres, mise à l'échelle écran.
4. **Graphe** : nœuds partagés = carrefours, arêtes pondérées par la longueur.
5. **Simplification** : impasses < 30 m supprimées, fusion des nœuds à moins de 8 m, Douglas-Peucker tolérance 3 m, plus grande composante connexe seulement.
6. **Base** = un bâtiment :
   - si le joueur donne une **adresse précise** (avec numéro), le bâtiment à cette adresse ;
   - sinon (nom de rue, lieu, position GPS), le bâtiment **le plus imposant ou le plus central** du quartier (emprise × hauteur, proximité du centre) ;
   - la base est reliée au nœud de rue le plus proche.
   **Entrées** = extrémités des rues au bord de la zone : les virus arrivent par toutes les rues qui entrent dans le quartier.
7. **Itinéraires** : pour chaque entrée, le plus court chemin (Dijkstra) vers la base ; puis des itinéraires supplémentaires, sans repasser deux fois par le même carrefour, jusqu'à ce que **chaque rue soit empruntée** par au moins un itinéraire. Longueur moyenne des itinéraires d'au moins 600 m (sinon agrandir le rayon, jusqu'à 600 m).
8. **Emplacements de tourelles**, 25 à 60 par carte :
   - en priorité **sur les toits** : un emplacement par bâtiment dont le centre est à moins de 40 m d'un itinéraire, emplacements espacés d'au moins 25 m ;
   - si la carte n'a pas assez de bâtiments : **socles** posés au sol de chaque côté des itinéraires à 12 m de l'axe, espacés de 25 m, sans chevaucher une rue ni un bâtiment.

### Déterminisme et cache

- Graine dérivée de l'adresse normalisée et du rayon.
- Cache IndexedDB (clé = coordonnées arrondies + rayon), consultable hors ligne.

### Cas dégradés

| Situation | Comportement |
|---|---|
| Zone rurale | agrandir le rayon, puis carte aléatoire de secours avec message |
| Itinéraires trop courts (moyenne < 600 m) | idem |
| Overpass en erreur | 2 miroirs, puis bouton Réessayer |
| Hors connexion | cartes en cache + carte locale générée |
| Adresse introuvable | message |

### Rendu

- Ville miniature vue de dessus en **pseudo-3D** : bâtiments extrudés (murs, toits, ombres portées), arbres, parcs, eau.
- **Modèles de bâtiments au plus proche de la réalité** : vraies emprises OSM ; maisons à toit à deux pans (`building=house`, `detached`…), immeubles à toit plat dont la hauteur suit `building:levels` (`apartments`, `commercial`…), bâtiments publics reconnaissables (mairie, école, église…).
- Rues en vectoriel (trait arrondi, largeur selon le type de voie, trottoirs) ; entrées des virus et base repérables d'un coup d'œil.
- Style coloré, doux et moderne, sans tuiles.
- Mention **« © OpenStreetMap contributors »** dans À propos et sur l'écran de choix de carte (licence ODbL).

## 5. Écrans

Portrait, zones tactiles d'au moins 48 dp.

- **Accueil** : Jouer, cartes récentes, gemmes, Améliorations, Paramètres.
- **Choix du lieu** : champ adresse, bouton Ma position, cartes en cache, aperçu du tracé, rayon.
- **Chargement** : étapes animées, Annuler.
- **Partie** : carte plein écran, barre haute (argent / PV de la base / vague), barre basse (Vague suivante, vitesse ×1/×2/×3), pause ; construction, amélioration et revente par menu radial.
- **Fin de partie** : score, vague, gemmes, bouton Doubler (pub), Rejouer, Partager.
- **Améliorations**.

### Ergonomie

- Toucher un emplacement puis menu radial.
- Portées affichées au toucher d'une tour.
- Pause automatique en arrière-plan.
- Sauvegarde automatique de la partie à chaque fin de vague.
- Formes distinctes par silhouette (accessibilité).

### Performance

- 60 images/s avec 150 ennemis maximum.
- Moins de 200 Mo.

## 6. Publicités (jalon 3)

- **Récompensées** :
  - fin de partie : gemmes ×2 ;
  - défaite : « Continuer » une fois par partie (base remise à 10 PV) ;
  - avant une vague : boost argent ×2 pendant une vague.
- **Interstitiel** entre deux parties, au retour à l'accueil, au plus toutes les 3 minutes, jamais à la première partie du jour.
- **Bannière** facultative sur l'accueil.
- **Jamais de pub pendant une vague.**
- **Consentement RGPD (UMP)**, politique de confidentialité sur GitHub Pages mentionnant AdMob, Nominatim/Overpass (l'adresse saisie leur est envoyée) et l'usage éventuel du GPS (demandé uniquement à l'appui sur Ma position).

## 7. Données et partage sans serveur

- **localStorage** : JSON versionné avec migrations (progression, partie en cours, records par lieu).
- **IndexedDB** : cartes.
- Export/import de la progression en code texte.
- Bouton **« Défier un ami »** : lien `https://<site>/#/jouer?lat=...&lon=...&r=400&seed=...` et texte prêt à partager ; image de score générée en canvas avec le tracé de la rue.
- Pas de classement en ligne en v1.

### Équilibrage

- Script de simulation sans rendu jouant des parties automatiques sur 20 cartes types, taux de victoire par carte.
- Cible : un joueur moyen atteint la vague 12 à 15 sans amélioration permanente.

## 8. Jalons

1. **Boucle de jeu sur carte fixe.**
2. **Contenu et équilibrage** : 4 tours, 5 ennemis, améliorations, boss, config, simulation.
3. **Écrans, sauvegarde, pubs** : AdMob test, RGPD, APK construit par GitHub Action.
4. **Génération de carte OSM** : géocodage, Overpass, graphe, simplification, chemins, emplacements, cache. Critère : 20 adresses variées donnent un niveau jouable ou un message clair.
5. **Partage et finitions.**
6. **Publication** : politique de confidentialité, fiche Google Play, test fermé de 12 testeurs sur 14 jours.

## 9. Critères d'acceptation v1

- Carte jouable en moins de 8 s sur 4G.
- Même adresse = même carte.
- Carte en cache ouverte hors ligne.
- Aucune partie injouable (itinéraires de 600 m en moyenne, au moins 25 emplacements).
- Pubs récompensées OK et jamais pendant une vague.
- Consentement RGPD au premier lancement dans l'Espace économique européen.
- 60 images/s avec 150 ennemis.
- Progression conservée après mise à jour.

## Historique des révisions

- **Révision 1 (24/10/2026)**, demandée après le jalon 1 :
  - ton bon enfant : tourelles et ennemis renommés (Lance-bulles, Lance-ballons, Lance-tartes, Barbe à papa ; Glouton, Filou, Bouboule, Mastodonte, Roi Glouton), la base devient un gâteau ; les rôles et les chiffres ne changent pas ;
  - rendu en ville miniature pseudo-3D (rues, maisons, parcs) au lieu du néon sur fond sombre ;
  - tourelles sur les toits des bâtiments, socles au sol si la carte manque de bâtiments ;
  - requête Overpass élargie aux bâtiments, espaces verts et plans d'eau.
- **Révision 2 (24/10/2026)**, demandée après la révision 1 :
  - thème plus sérieux : des virus (Virus, Variant, Amas, Blindé, Méga-virus) contre des dispositifs sanitaires (Pulvérisateur, Diffuseur, Laser UV, Purificateur) ; la base est un bâtiment ; rôles et chiffres inchangés ;
  - toutes les rues sont empruntées : entrées = toutes les rues qui entrent dans le quartier, itinéraires couvrant tout le réseau ; le critère des 600 m porte sur la longueur moyenne des itinéraires ;
  - base = bâtiment à l'adresse précise donnée, sinon bâtiment le plus imposant ou central ;
  - bonus de portée selon la hauteur du bâtiment qui porte la tourelle ;
  - jalon 4 : modèles de bâtiments au plus proche de la réalité.
