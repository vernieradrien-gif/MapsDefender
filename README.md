# StreetDefense

Tower defense mobile (portrait, une main) joué dans les rues d'un vrai quartier, avec les données OpenStreetMap.
Des **virus** stylisés entrent dans le quartier par toutes les rues qui y mènent ; tu les neutralises avec des **dispositifs sanitaires** installés sur les toits, pour protéger le **bâtiment central**.
Cahier des charges complet : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

**État : jalon 4.** On joue où l'on veut : une adresse, un lieu ou sa position donne une carte construite à partir des vraies rues d'OpenStreetMap (Villagexpo, à Saint-Michel-sur-Orge, reste fournie avec le jeu). Quatre dispositifs, cinq virus, améliorations, revente, boss ; gemmes et améliorations permanentes, sauvegarde, publicités de **test**, application Android.

Données cartographiques **© OpenStreetMap contributors**, sous licence [ODbL](https://www.openstreetmap.org/copyright).

## Tester sur téléphone

👉 **https://vernieradrien-gif.github.io/MapsDefender/**

Le site est publié automatiquement par GitHub Actions à chaque modification de la branche `main`.

- **Mode test** : https://vernieradrien-gif.github.io/MapsDefender/?debug (5 000 crédits au départ, pour atteindre vite la fin de partie).
- **Carte de démonstration** (l'ancienne carte dessinée à la main) : https://vernieradrien-gif.github.io/MapsDefender/?demo
- Sur le web, les publicités sont remplacées par un écran « Publicité de test » de 3 secondes.

### Application Android (APK de test)

L'APK est construit par GitHub Actions (workflow « APK Android ») à chaque pull request et à chaque modification de `main` :

1. onglet **Actions** du dépôt → workflow **APK Android** → dernière exécution réussie ;
2. en bas de la page, artefact **streetdefense-debug-apk** (il faut être connecté à GitHub) : un zip qui contient `app-debug.apk` ;
3. sur le téléphone, ouvrir `app-debug.apk` et autoriser l'installation depuis cette source.

L'appli affiche les vraies publicités AdMob **de test** de Google (bannière « Test Ad », vidéo récompensée, interstitiel) et, dans l'Union européenne, le formulaire de consentement au premier lancement.

## Comment jouer

- **Accueil** : touche une des cartes récentes (avec ton record), puis **Jouer**. Si une partie est en cours, **Reprendre la partie** la relance à la dernière vague terminée.
- **Choisir un lieu** : tape une adresse, une rue ou un lieu, touche **Chercher**, puis le bon résultat ; ou touche **Ma position**. Choisis le rayon du quartier (300, 400 ou 500 m). Le jeu télécharge les rues et les bâtiments, construit la carte, puis montre l'**aperçu du tracé** (rues, itinéraires des virus, entrées, base) : touche **Jouer ici**. Les cartes créées restent sur l'appareil et se rouvrent sans réseau. **Quartier imaginaire** crée un quartier inventé, même hors connexion.
- Avec une adresse précise (avec un numéro), la base est le bâtiment à cette adresse ; sinon, le bâtiment le plus imposant du quartier.
- Tu as 10 s de préparation avant la vague 1.
- **Zoom** : pince avec deux doigts, ou utilise les boutons **+ / −** en bas à droite ; fais glisser un doigt pour déplacer la carte.
- Touche un **toit marqué d'un ⊕** près d'une rue (ou un **socle** au sol) : un menu en arc propose les 4 dispositifs. Un dispositif trop cher est grisé.
  - **Pulvérisateur** (50) : tire vite, petits dégâts, une cible.
  - **Diffuseur** (100) : lance une capsule qui éclate en nuage désinfectant (dégâts de zone), lent.
  - **Laser UV** (150) : longue portée, gros dégâts, très lent (rayon instantané).
  - **Purificateur** (75) : champ qui ralentit de 40 % les virus à portée (sans dégâts).
- Plus le toit est **haut**, plus la portée est grande (+1,2 % par mètre, jusqu'à +25 %) ; un socle ne donne aucun bonus.
- Touche un dispositif posé : sa **portée** s'affiche (et, en pointillés, celle du niveau suivant), avec deux boutons : **Améliorer** (3 niveaux) et **Vendre** (70 % de ce qu'il t'a coûté).
- Les virus arrivent **de l'extérieur de la carte**, par toutes les rues qui entrent dans le quartier (un **cercle rouge** marque chaque entrée), et empruntent toutes les rues jusqu'à la **base** (toit bleu-vert à croix blanche, avec sa jauge de PV). Chaque virus qui l'atteint lui retire des PV (1 à 5 selon le virus). La base a 20 PV.
- Les virus : **Virus** (rouge), **Variant** (orange, rapide), **Amas** (violet, résistant), **Blindé** (gris-bleu, lent, gros dégâts à la base) et, toutes les 10 vagues, le **Méga-virus**, qui se divise en 3 Amas quand on le neutralise.
- Chaque virus neutralisé rapporte des crédits ; chaque vague terminée rapporte un bonus de 10 + 2 × numéro de vague.
- Entre deux vagues, le bouton **×2 crédits · pub** double les gains de la vague suivante contre une publicité.
- **Vague suivante** lance la prochaine vague sans attendre ; **x1 / x2 / x3** change la vitesse ; **⏸** met en pause (et permet de revenir à l'accueil, la partie est gardée).
- Victoire après la vague 30, défaite si la base n'a plus de PV. En cas de défaite, **Continuer** (une fois par partie, contre une publicité) remet la base à 10 PV.
- En fin de partie, tu gagnes des **gemmes** selon ton score (**Doubler** contre une publicité). Elles s'échangent sur l'écran **Améliorations** contre des bonus permanents.
- **Paramètres** : code texte pour copier ta progression sur un autre appareil, réinitialisation, politique de confidentialité.
- Sur Android, le bouton **Retour** met en pause ou ferme le menu ouvert ; il quitte l'appli seulement depuis l'accueil.

## Développement

```
npm install        # dépendances
npm run dev        # serveur de développement (http://localhost:5173)
npm test           # tests unitaires (Vitest)
npm run build      # vérification TypeScript (code et scripts) + build de production dans dist/
npm run import-map # réimporte Villagexpo depuis OpenStreetMap (--offline : rejoue la dernière réponse)
npm run simulate   # parties automatiques sur 20 quartiers types + Villagexpo (équilibrage)
npm run captures   # captures Playwright (Pixel 7) dans docs/captures/ et mesure de fluidité
npm run test-places # essai sur 20 adresses variées (réseau) → docs/essai-adresses.md ; --offline rejoue
```

`npm run captures` demande une fois `npx playwright install chromium`.

Application Android (Capacitor), si l'on veut la construire sur son ordinateur (JDK 21 et SDK Android, par exemple ceux d'Android Studio) :

```
npm run build
npx cap sync android                         # copie dist/ dans le projet Android
cd android && ./gradlew assembleDebug        # APK dans android/app/build/outputs/apk/debug/
```

Organisation du code (détails dans [`CLAUDE.md`](CLAUDE.md)) :

```
src/
  game/     simulation pure : Game, vagues, économie, tourelles, ciblage, adaptation à la carte,
            progression permanente (gemmes), instantané de sauvegarde, joueurs automatiques
  geo/      graphe des rues et itinéraires, OSM (projection, simplification, bâtiments), assemblage de carte,
            client Nominatim / Overpass (osmClient, http), génération d'une carte depuis un lieu (placeMap,
            places, mapWorker), carte réelle (maps/villagexpo.json), démonstration, quartiers types
  render/   Canvas 2D pseudo-3D : caméra (zoom), ville, virus, dispositifs, effets
  ui/       HUD, gestes (pincer, glisser), menus radiaux, écrans d'accueil, améliorations, paramètres, fin de partie
  ads/      interface des publicités : AdMob (Android, identifiants de test) ou fausse publicité (web), règles de rythme
  storage/  localStorage protégé, progression versionnée, partie sauvegardée, cartes en cache (IndexedDB)
  config/   balance.json : tout l'équilibrage et les règles de carte (documenté dans src/config/README.md)
  i18n/     textes (fr.json)
public/     confidentialite.html (politique de confidentialité)
android/    projet Android généré par Capacitor
scripts/    import-osm.ts, simulate.ts, captures.ts, test-places.ts (lancés avec tsx)
docs/       cahier des charges, captures d'écran
```

Le jeu reçoit une **carte** (`GameMap` dans `src/game/types.ts`) : itinéraires, entrées, emplacements, base et bâtiment de base, rues, bâtiments, surfaces et arbres. Les fonctions de `src/geo` (projection, découpe, graphe, simplification, bâtiments, assemblage) sont pures ; seuls `osmClient` et `http` touchent au réseau.

## Décisions prises

Choix faits sans validation explicite, à revoir si besoin.

### Jalon 4 : carte depuis n'importe quel lieu

- **Choisir un lieu** : un champ d'adresse et un bouton **Chercher** (pas d'autocomplétion, au plus une requête Nominatim toutes les 1,1 s). Jusqu'à 5 résultats ; les doublons (même nom, même commune, à moins de 400 m : la place, sa station de métro, ses rues) sont fusionnés. **Ma position** : la position n'est demandée qu'à l'appui ; le nom du lieu vient de Nominatim (recherche inverse), la carte reste centrée sur la position.
- **Rayon** : 300, 400 (par défaut) ou 500 m. La zone de jeu garde la forme portrait de Villagexpo et suit le rayon : 1,25 × 2,25 fois le rayon (375 × 675, 500 × 900, 625 × 1 125 m). Le choix du rayon dure le temps de la session.
- **Une requête Overpass par carte** : les rues sur la zone et 220 m autour (les virus viennent de l'extérieur), mais les bâtiments, parcs et plans d'eau seulement sur la zone et ses 90 m de décor : la réponse est environ 40 % plus légère. Le serveur dispose de 20 s de calcul ; l'appli attend 45 s au plus par serveur (d'abord 25 s, mais l'essai des 20 adresses a montré que les serveurs chargés répondent souvent en 30 à 45 s), puis essaie le suivant : overpass-api.de, puis overpass.private.coffee, puis le serveur public de VK Maps (maps.mail.ru). Au départ, la liste contenait aussi overpass.kumi.systems, mais c'est l'ancien nom de private.coffee (même machine) : il a été remplacé par VK Maps pour avoir deux secours vraiment indépendants. L'écran de chargement l'indique (« Serveur occupé : essai du serveur de secours 1 »). Sur Android, les requêtes passent par le système avec un User-Agent StreetDefense ; sur le web, le navigateur envoie l'adresse du site.
- **Construction dans un worker** : l'écran de chargement reste animé et **Annuler** répond tout de suite. La plantation des arbres utilise maintenant un index spatial : même résultat, 5 fois plus vite (construction de Villagexpo : 850 → 160 ms sur PC).
- **Carte jouable ou message clair** (§ 4 « Cas dégradés ») : la carte doit passer la validation (itinéraires jusqu'à la base, 25 à 60 emplacements) et avoir des itinéraires de **600 m en moyenne**. Sinon le rayon est agrandi de 100 m, jusqu'à 600 m (une nouvelle requête à chaque fois) ; sinon, **quartier imaginaire** avec un message. Si les serveurs ne répondent pas : message, **Réessayer**, et la possibilité de jouer un quartier imaginaire. Adresse introuvable : message.
- **Base** : adresse avec numéro → le bâtiment qui contient le point géocodé, sinon le plus proche à moins de 25 m (s'il est près d'une rue) ; sinon la règle du bâtiment le plus imposant ou central. Les constructions souterraines (parkings, stations : `layer` négatif, `location=underground`…) sont ignorées : à Lyon, le parking sous la place Bellecour devenait la base.
- **Même adresse, même carte** : graine tirée de l'adresse normalisée (minuscules, sans accents ni ponctuation) et du rayon ; pour une position, des coordonnées arrondies. **Cache IndexedDB** : clé = coordonnées arrondies à 4 décimales (environ 10 m) + rayon ; la carte construite y est gardée et se rouvre hors ligne. 20 cartes au plus : les moins récemment jouées sont oubliées, jamais la carte choisie ni celle de la partie sauvegardée. Chaque carte porte la version du générateur : une carte construite par une version plus ancienne est reconstruite quand on redemande le lieu. En navigation privée (IndexedDB indisponible), les cartes ne vivent que le temps de la session (message).
- **Quartier imaginaire** : un des quartiers types de la simulation (grille, diagonales, dense), 2 ou 3 entrées, à la taille du rayon, avec des arbres ; il est enregistré comme les autres cartes pour pouvoir reprendre la partie.
- **Accueil** : les 3 cartes les plus récentes (la carte choisie d'abord) et le bouton **Choisir un lieu**. L'écran du lieu liste toutes les cartes enregistrées.
- **Aperçu du tracé** : vue à plat de la zone (rues, itinéraires en rouge, entrées, base) avec le nombre d'entrées, d'itinéraires, la longueur moyenne et le nombre d'emplacements, et une note si la zone a été agrandie, si la base est à l'adresse, ou si le lieu est remplacé par un quartier imaginaire.
- **Bâtiments publics reconnaissables** (révision 2) : d'après les étiquettes OSM ou le nom, les lieux de culte ont un **clocher avec sa flèche** (à l'extrémité ouest, ou nord) et un toit à deux pans, les mairies un **drapeau tricolore**, les écoles un **toit jaune**. Les autres modèles (maisons à deux pans, hauteur selon `building:levels`) existaient déjà.
- **Android** : permissions de localisation déclarées (demandées seulement à l'appui sur **Ma position**).
- **Version** : 0.4.0.
- **Essai sur 20 adresses** (critère du jalon, `npm run test-places`, détail dans [`docs/essai-adresses.md`](docs/essai-adresses.md)) : **17 cartes réelles jouables**, 2 lieux remplacés par un quartier imaginaire avec un message (aéroport Charles-de-Gaulle : presque que des autoroutes et des voies de service ; Mont-Saint-Michel : ruelles piétonnes, 19 emplacements possibles sur 25 même à 600 m), et un message « adresse introuvable ». Aucune partie injouable. Grandes villes (Paris avec la base à l'adresse, Lyon, Marseille, Toulouse, Bordeaux, Montpellier, Bruxelles), quartier d'affaires (La Défense, zone agrandie à 500 m), centre historique (Carcassonne, Strasbourg agrandi à 500 m), village perché (Gordes), montagne (Chamonix), île (Sein), village rural (Millevaches, agrandi à 500 m). Construction : 0,1 à 1,2 s ; téléchargement : 30 à 230 s ce jour-là, serveurs saturés. « Grand Place, Lille » donne d'abord la Grand Place de Tourcoing : dans l'appli, le joueur choisit parmi les résultats (le script prend toujours le premier).
- **À décider avant la publication (jalon 6) : règles d'usage d'Overpass.** Le serveur principal (overpass-api.de, géré par l'association FOSSGIS) demande d'identifier l'appli (fait : User-Agent sur Android, adresse du site sur le web), de rester sous environ 10 000 requêtes par jour pour l'ensemble des joueurs, et de passer par un serveur à soi ou payant pour un usage commercial ; il déconseille aussi de servir une appli grand public uniquement avec les serveurs publics, et de les appeler depuis des plateformes de déploiement rapide d'applis générées par IA (il cite lovable.app et netlify.app ; le jeu est sur GitHub Pages). Avec des publicités réelles, le jeu deviendrait un usage commercial. Pistes compatibles avec le « 0 € » : cartes de grandes villes précalculées dans le dépôt (prévu par le cahier des charges), cache sur l'appareil (fait), ou une offre gratuite avec clé (NextGIS, Overpass.ch : 10 000 requêtes par mois), qui demande un compte. Pour les tests actuels (quelques requêtes, publicités de test), l'usage reste modeste.
- **Écart : « carte jouable en moins de 8 s sur 4G » n'est pas tenu aujourd'hui.** La construction prend moins d'une seconde (Bruxelles : 0,6 s pour 2,5 Mo de données) et une carte déjà enregistrée s'ouvre tout de suite ; mais le téléchargement dépend des serveurs Overpass publics, surchargés en octobre 2026. Le 25/10 au soir, ils n'ont pas répondu pendant des heures ; le 26/10, chaque carte a demandé de 30 s à près de 4 min. L'écran de chargement montre où on en est et propose Annuler, puis Réessayer ou un quartier imaginaire. Une carte rapide demanderait des cartes précalculées ou un serveur moins chargé (voir le point sur les règles d'usage ci-dessus).

### Jalon 3 : écrans, sauvegarde, publicités, Android

- **Gemmes** : gagnées en fin de partie, ⌊0,18 × √score⌋. Le score grandit beaucoup plus vite que les vagues (points × numéro de vague) : une formule proportionnelle au score donnait des centaines de gemmes par partie. Avec la racine, 10 000 points donnent 18 gemmes et 40 000 points 36 ; une partie du joueur automatique « moyen » sur Villagexpo (vague 26 à 29) en rapporte 70 à 80. L'arbre complet coûte 698 gemmes, soit une dizaine de bonnes parties.
- **Améliorations permanentes** : un arbre à deux rangs.
  - **Désinfectant renforcé** : +5 % de dégâts par niveau, 5 niveaux (8, 16, 30, 50, 80 gemmes).
  - **Budget de départ** : +25 crédits au départ par niveau, 5 niveaux (mêmes prix).
  - **Dispositif offert** : un Pulvérisateur gratuit de plus par niveau, 3 niveaux (25, 50, 90), après Budget de départ niveau 2. C'est ma lecture de « +1 emplacement initial » du cahier des charges : tous les emplacements sont libres dès le départ, donc on offre plutôt le premier dispositif.
  - **Buses longue portée** : +4 % de portée par niveau, 3 niveaux (25, 50, 90), après Désinfectant renforcé niveau 2.
  - L'équilibrage (simulation) se fait sans amélioration permanente, comme le demande le cahier des charges.
- **Sauvegarde** : la partie est enregistrée à chaque fin de vague (cahier des charges), et aussi quand l'appli passe en arrière-plan ou quand on revient à l'accueil depuis la pause. On reprend à l'identique (même tirage aléatoire, mêmes virus en jeu). La sauvegarde est effacée en fin de partie ; une sauvegarde abîmée ou d'une autre carte est ignorée (message).
- **Progression** (`localStorage`, clé `streetdefense:v1:progress`) : JSON versionné avec migration : gemmes, améliorations, records par lieu (meilleure vague, meilleur score, nombre de parties), réglages, compteurs des publicités. Le choix de vitesse du jalon 1 est repris. Les champs abîmés sont réparés un par un plutôt que de tout effacer.
- **Export / import** : code texte `SD1.<données>.<somme de contrôle>` à copier-coller dans Paramètres ; l'import remplace gemmes, améliorations et records, et garde les réglages de l'appareil.
- **Écrans** : accueil (cartes avec record, Jouer ou Reprendre, gemmes, Améliorations, Paramètres, Aide), améliorations, paramètres (progression, confidentialité, choix publicitaires sur Android, à propos), aide, pause (Reprendre, Recommencer, Accueil), fin de partie (score, vague, gemmes, Continuer, Doubler, Rejouer, Accueil, Partager). « Cartes récentes » du cahier des charges : la liste des cartes avec leur record ; elle grandira au jalon 4 avec les adresses. Le choix du lieu par adresse et l'écran de chargement viendront au jalon 4.
- **Partager** : partage natif du téléphone (texte avec le lieu, la vague et le score), sinon copie dans le presse-papiers. Le lien « Défier un ami » et l'image de score viendront au jalon 5.
- **Publicités** (§ 6), toutes avec les identifiants de **test** de Google, et **jamais pendant une vague** :
  - **Continuer** : une fois par partie, base remise à 10 PV, la vague en cours continue.
  - **Doubler les gemmes** : une fois par partie.
  - **Boost ×2 crédits** : proposé seulement quand aucun virus n'est en jeu ; il double les récompenses de la vague suivante.
  - **Interstitiel** : au retour à l'accueil après une partie (pas sur « Rejouer »), au plus toutes les 3 minutes, jamais après la première partie du jour.
  - **Bannière** : seulement sur l'accueil, sur Android.
  - Sur le web, une fausse publicité de 3 s (« Publicité de test ») ; la fermer avant la fin ne donne pas la récompense.
  - Le jeu reste figé tant que la publicité est ouverte, et la récompense n'est donnée qu'à sa fermeture (sur Android, l'appel d'affichage d'AdMob se termine dès la récompense, publicité encore à l'écran).
- **Consentement RGPD** : formulaire UMP de Google au premier lancement (seulement là où il est requis, Espace économique européen). S'il n'a pas pu s'afficher (réseau lent), il est redemandé avant la publicité suivante. Il se rouvre depuis Paramètres → Mes choix publicitaires (Android).
- **Politique de confidentialité** : `public/confidentialite.html`, publiée avec le site (https://vernieradrien-gif.github.io/MapsDefender/confidentialite.html) : stockage sur l'appareil, AdMob et consentement, Nominatim/Overpass (l'adresse saisie leur sera envoyée au jalon 4), GPS seulement à l'appui sur « Ma position », hébergement GitHub Pages.
- **Android** : Capacitor 8, identifiant `io.github.vernieradrien.streetdefense`, portrait. Modules : `@capacitor-community/admob` (publicités et consentement), `@capacitor/app` (bouton Retour). L'identifiant d'application AdMob de test est dans `AndroidManifest.xml`. Le jeu fonctionne sans réseau (la carte est dans l'appli) ; seules les publicités en ont besoin.
- **APK** : APK de test (debug, non signé pour le Play Store) construit par `.github/workflows/android.yml`. La version signée viendra au jalon 6 (publication). Vérifié sur un émulateur Android 15 : jeu, consentement, bannière, vidéo récompensée de test, reprise de la partie, bouton Retour. **Pas encore vérifié sur un vrai téléphone.**
- **Version** : 0.3.0, affichée dans Paramètres.

### Zoom et virus venant de l'extérieur

- **Zoom** de 1× (toute la zone visible) à 4×, centré sous les doigts ; boutons + / − ; molette sur ordinateur. Glisser déplace la carte (un débord de 50 px est permis au bord). Un toucher reste un toucher tant que le doigt bouge de moins de 10 px. Pendant le geste, le décor déjà dessiné est simplement agrandi, puis redessiné net à la fin ; seul ce qui est visible est redessiné.
- **Zone agrandie** à 500 × 900 m (au lieu de 350 × 660), grâce au zoom. La longueur moyenne des itinéraires passe à **775 m** : la cible de 600 m du cahier des charges est atteinte.
- **Virus venant de l'extérieur** : le réseau des rues est construit sur la zone plus 220 m tout autour. Les entrées sont les bouts de ce réseau élargi, hors de la zone ; les virus démarrent 60 m avant le bord de la zone, sur la rue qui y entre, et le cercle rouge marque l'endroit où la rue franchit le bord. Les rues extérieures ne servent qu'à arriver : « toutes les rues sont empruntées » se compte sur les rues de la zone.
- **De tous les côtés** : 10 entrées, au nord (3), à l'est (2) et à l'ouest (5), 23 itinéraires. **Aucune entrée au sud** : au sud du Villagexpo, OpenStreetMap ne montre que la voie ferrée et des champs, sans rue qui traverse. Le test de la carte exige des entrées sur au moins 3 côtés.
- La carte de démonstration et les quartiers générés pour la simulation ont aussi des rues d'entrée qui commencent hors de la carte (100 m).

### Carte réelle : Villagexpo (Saint-Michel-sur-Orge)

- **Import** : `npm run import-map` fait une requête Nominatim (« Villagexpo, Saint-Michel-sur-Orge », qui renvoie le Hall du Villagexpo, 48,6298 N / 2,3249 E) puis une seule requête Overpass sur l'emprise de la zone, de son décor et du réseau extérieur, avec les mêmes serveurs de secours que l'appli (overpass.private.coffee, VK Maps). Les deux réponses sont gardées dans `scripts/.cache/` (non versionné) ; `--offline` les rejoue sans réinterroger les serveurs. Données réelles du 25/10/2026 : 1 451 éléments.
- **Zone de jeu** : un rectangle portrait de **500 × 900 m** centré sur le lieu géocodé, au lieu d'un cercle de 400 m de rayon : à 1×, la carte entière tient sur l'écran d'un téléphone ; le zoom permet de voir le détail. Un décor de 90 m est dessiné autour.
- **Base** : le bâtiment le plus imposant ou central (score = emprise × hauteur / (1 + (distance au centre / 80 m)²), parmi les bâtiments proches d'une rue) : c'est le **Hall du Villagexpo**. Il est relié à la rue la plus proche en coupant le tronçon à l'endroit le plus proche (plutôt qu'au carrefour le plus proche, parfois à plus de 100 m).
- **Toutes les rues sont empruntées… sauf les impasses** : 60 tronçons sur 84 dans la zone (5,2 km sur 6,7 km de réseau). Les autres sont des impasses de plus de 30 m (Villagexpo en compte beaucoup) : on ne peut pas les emprunter sans demi-tour, donc sans repasser par un carrefour. Elles restent dessinées. `coverRoutes` cherche un itinéraire exact (calcul de flot) quand le plus court accès coupe la suite : seules les rues réellement impossibles à emprunter restent de côté (vérifié par un test exhaustif sur 60 quartiers aléatoires).
- **Simplification (§ 4)** : plus grande composante connexe, impasses de moins de 30 m supprimées, Douglas-Peucker à 3 m sur les itinéraires. La fusion des nœuds à moins de 8 m ne fusionne que des carrefours reliés par une rue (deux impasses voisines non reliées ne sont pas raccordées). Les nœuds au bord de la zone et au-delà ne sont jamais déplacés ni supprimés. Les rues dessinées gardent leur tracé fin (0,5 m).
- **Bâtiments réels** : presque tous sont étiquetés `building=yes`, et très peu ont un nombre d'étages. Le type est donc déduit des étiquettes, puis du nom (école, gymnase, hall, église… = bâtiment public ; « Résidence » = immeuble ; « Centre commercial » = commerce), puis de la surface : abri sous 25 m², maison sous 250 m², immeuble sous 1 500 m², grand bâtiment au-delà. Hauteur : `height`, sinon niveaux × 3 m, sinon 6 m (maison), 12 m (immeuble), 9 m (public), 7 m (commerce), 2,6 m (abri). Une maison dont l'emprise remplit au moins 88 % de son rectangle englobant a un toit à deux pans posé sur ce rectangle ; toutes les autres formes gardent leur vraie emprise avec un toit plat. Les abris de jardin n'accueillent pas de tourelle.
- **Emplacements** : 60 toits (le maximum), au milieu du toit même pour un bâtiment en L ou en U.
- **Décor** : 530 bâtiments, 83 rues, 20 surfaces ; arbres générés (1 855), pas importés.
- **Fichier** : `src/geo/maps/villagexpo.json`, 249 Ko, coordonnées arrondies à 10 cm, avec la requête, la date des données et la licence. La carte est validée au chargement ; si elle est invalide, la carte de démonstration la remplace (message sur l'accueil). `?demo` force la carte de démonstration.
- **Mention « © OpenStreetMap contributors »** sur l'écran d'accueil, dans Paramètres → À propos et dans ce README.

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
- **Adaptation à la carte** : facteur = longueur moyenne des itinéraires / 600 m, borné entre 0,75 et 1,5. Il multiplie le nombre de virus par vague et l'argent de départ (arrondi à 5). Villagexpo (775 m) : facteur 1,29, soit 260 crédits au départ.
- **Menus** : construction par un menu radial en arc (4 boutons, nom sous chacun) ; les rôles et les prix sont rappelés dans l'aide. Menu radial d'une tourelle posée : Améliorer, Vendre, et une fiche (niveau, portée, bonus de hauteur).
- **Simulation** (`npm run simulate`) : 20 quartiers types générés (6 grilles, 5 quartiers denses d'immeubles, 5 zones rurales clairsemées avec socles, 4 grilles à diagonales ; 1 à 4 entrées ; zones de 300 × 560 à 400 × 740 m), plus Villagexpo, 3 parties par carte et par joueur.
  - Joueur **moyen** : il pose dès qu'il peut sur un emplacement pris au hasard parmi les 35 % les mieux placés, alterne les dispositifs selon un cycle fixe, améliore de temps en temps, et n'agit qu'une fois toutes les 2 s.
  - Joueur **bon** : il choisit à chaque fois l'action la plus rentable (couverture des itinéraires × dégâts utiles / coût), quitte à économiser.
- **Réglages issus de la simulation** : récompenses 8 / 7 / 15 / 35 / 40 crédits ; vitesses 35 / 58 / 38 / 21 / 16 m/s ; 6 virus à la vague 1, puis 0,9 de plus par vague. Résultat sur les 20 cartes types (simulation refaite au jalon 3, rues d'entrée venant de l'extérieur) :

  | Joueur | Vague atteinte (moyenne) | Victoires |
  |---|---|---|
  | moyen | **14,2** (cible 12 à 15) | 0 % |
  | bon | 26,1 | 2 % |

  Écarts notés : la difficulté dépend beaucoup de la carte (une seule entrée : vague 16 à 24 pour le joueur moyen ; 4 entrées : vague 8 à 13). **Sur Villagexpo, le joueur moyen va beaucoup plus loin (vague 25 en moyenne)**, malgré ses 10 entrées : tous les itinéraires se rejoignent autour du Hall, entouré de toits, où quelques dispositifs couvrent tous les virus. Augmenter le nombre de virus ou réduire les emplacements changeait peu le résultat. L'adaptation à la carte ne tient compte que de la longueur des itinéraires, comme le demande le cahier des charges ; un critère d'« entonnoir » près de la base pourrait s'y ajouter au jalon 4, quand les cartes viendront de n'importe quelle adresse. La carte de démonstration est elle aussi très facile (les joueurs automatiques la gagnent) : elle sert de carte de secours et de découverte.
- **Mode test** (`?debug`) : en plus des 5 000 crédits, la page expose `window.streetDefense` (avancer le temps, faire construire le joueur automatique, test de charge, coût d'une image), utilisé par `npm run captures`.
- **Captures et fluidité** : `docs/captures/` (profil Pixel 7 de Playwright : 412 × 839 px visibles). Avec 150 à 177 virus à l'écran, Chromium sans affichage (sur PC) tient **54 à 59 images/s** selon les mesures (54 au jalon 4). Une image coûte 14 ms dans ce Chromium, qui dessine sans carte graphique ; elle coûte environ 2 ms dans un navigateur avec accélération graphique. **Pas encore vérifié sur un vrai téléphone.**

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
- **Pas encore de PWA installable** (manifeste, mode hors ligne sur le web) : prévu au jalon 5. L'application Android fonctionne déjà sans réseau (cartes fournies, cartes enregistrées, quartier imaginaire).
- **Outils** : Vite 8, TypeScript 7, Vitest 5, Node 22 ; tsx pour les scripts, Playwright pour les captures, Capacitor 8 pour Android.
