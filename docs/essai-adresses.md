# Essai sur 20 adresses (jalon 4)

Généré par `npm run test-places` le 26/10/2026, rayon 400 m.
Critère du cahier des charges : chaque adresse donne un niveau jouable ou un message clair.

**Résultat : 17 cartes réelles jouables sur 20 adresses ; les autres donnent une carte imaginaire avec un message, ou un message clair.**

| # | Adresse | Résultat | Détails | Temps |
|---|---|---|---|---|
| 1 | 10 rue de Rivoli, Paris | jouable | 10 Rue de Rivoli (75004 Paris) : 22 entrées, 48 itinéraires de 620 m en moyenne, 60 emplacements, base à l’adresse | 31.7 s de téléchargement (2226 Ko), 0.8 s de construction |
| 2 | Place Bellecour, Lyon | jouable | Place Bellecour (69002 Lyon) : 20 entrées, 52 itinéraires de 727 m en moyenne, 60 emplacements | 30.0 s de téléchargement (3869 Ko), 0.9 s de construction |
| 3 | Vieux-Port, Marseille | jouable | Vieux-Port (13002 Marseille) : 23 entrées, 42 itinéraires de 1043 m en moyenne, 60 emplacements | 43.0 s de téléchargement (1786 Ko), 0.5 s de construction |
| 4 | Place du Capitole, Toulouse | jouable | Place du Capitole (31000 Toulouse) : 22 entrées, 33 itinéraires de 1281 m en moyenne, 60 emplacements | 36.6 s de téléchargement (2469 Ko), 0.7 s de construction |
| 5 | Grand Place, Lille | jouable | Grand Place (59200 Tourcoing) : 27 entrées, 49 itinéraires de 624 m en moyenne, 60 emplacements | 38.8 s de téléchargement (1878 Ko), 0.5 s de construction |
| 6 | Petite France, Strasbourg | jouable (rayon 500 m) | La Petite France (67000 Strasbourg) : 26 entrées, 53 itinéraires de 1187 m en moyenne, 60 emplacements | 120.3 s de téléchargement (4209 Ko), 1.1 s de construction |
| 7 | Rue Sainte-Catherine, Bordeaux | jouable | Rue Sainte-Catherine (33000 Bordeaux) : 28 entrées, 71 itinéraires de 635 m en moyenne, 60 emplacements | 42.8 s de téléchargement (3545 Ko), 1.2 s de construction |
| 8 | Place de la Comédie, Montpellier | jouable | Place de la Comédie (34062 Montpellier) : 11 entrées, 15 itinéraires de 1573 m en moyenne, 60 emplacements | 197.8 s de téléchargement (2497 Ko), 0.6 s de construction |
| 9 | Villagexpo, Saint-Michel-sur-Orge | jouable | Hall du Villagexpo (91240 Saint-Michel-sur-Orge) : 10 entrées, 23 itinéraires de 775 m en moyenne, 60 emplacements | 35.6 s de téléchargement (664 Ko), 0.2 s de construction |
| 10 | 1 avenue du Général de Gaulle, Créteil | jouable | Immeuble Le Pascal (94000 Créteil) : 13 entrées, 27 itinéraires de 882 m en moyenne, 60 emplacements, base à l’adresse | 40.9 s de téléchargement (710 Ko), 0.2 s de construction |
| 11 | La Défense, Puteaux | jouable (rayon 500 m) | La Défense - Grande Arche (92800 Puteaux) : 31 entrées, 70 itinéraires de 813 m en moyenne, 60 emplacements | 64.9 s de téléchargement (2228 Ko), 1.1 s de construction |
| 12 | Aéroport Paris-Charles de Gaulle | carte imaginaire + message | Aéroport de Paris-Charles-de-Gaulle : 400 m : pas assez d'emplacements (1 < 25), itinéraires trop courts (81 m < 600 m) ; 500 m : itinéraires trop courts (397 m < 600 m) ; 600 m : itinéraires trop courts (453 m < 600 m) | 108.9 s de téléchargement (804 Ko), 0.2 s de construction |
| 13 | Gordes | jouable | Gordes (84220 Gordes) : 12 entrées, 23 itinéraires de 824 m en moyenne, 60 emplacements | 104.3 s de téléchargement (700 Ko), 0.2 s de construction |
| 14 | Chamonix-Mont-Blanc | jouable | Chamonix-Mont-Blanc (74400 Chamonix-Mont-Blanc) : 11 entrées, 18 itinéraires de 1078 m en moyenne, 60 emplacements | 106.2 s de téléchargement (1107 Ko), 0.2 s de construction |
| 15 | La Cité, Carcassonne | jouable | Hôtel de la Cité (11000 Carcassonne) : 17 entrées, 26 itinéraires de 695 m en moyenne, 60 emplacements | 121.2 s de téléchargement (1439 Ko), 0.3 s de construction |
| 16 | Mont-Saint-Michel | carte imaginaire + message | Mont Saint-Michel : 400 m : pas assez d'emplacements (9 < 25), itinéraires trop courts (370 m < 600 m) ; 500 m : pas assez d'emplacements (17 < 25), itinéraires trop courts (506 m < 600 m) ; 600 m : pas assez d'emplacements (19 < 25) | 233.9 s de téléchargement (670 Ko), 0.1 s de construction |
| 17 | Île de Sein | jouable | Île-de-Sein (29990 Quimper) : 4 entrées, 23 itinéraires de 779 m en moyenne, 60 emplacements | 122.2 s de téléchargement (326 Ko), 0.1 s de construction |
| 18 | Millevaches | jouable (rayon 500 m) | Millevaches (19290 Millevaches) : 5 entrées, 8 itinéraires de 675 m en moyenne, 60 emplacements | 91.2 s de téléchargement (233 Ko), 0.1 s de construction |
| 19 | Grand-Place, Bruxelles | jouable | Grand-Place (Bruxelles) : 17 entrées, 25 itinéraires de 720 m en moyenne, 60 emplacements | 29.4 s de téléchargement (2534 Ko), 0.6 s de construction |
| 20 | zzqxw introuvable | message (notFound) | adresse introuvable : « zzqxw introuvable » |  |

Données © OpenStreetMap contributors (licence ODbL).
