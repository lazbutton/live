# Accès et photos des lieux

Chantier U13 de `../live/docs/AMELIORATIONS.md`, côté admin. La fiche d'un événement de l'app affiche
l'accès du lieu sous son adresse, sous l'intitulé « Accès » (`locations.directions`).

## Écrire l'accès

Texte brut, une ligne par mode, trois lignes au plus, sans emoji, sans puce ni point final :

```
Tram B, arrêt Halmagrand
Bus 2 et 3, arrêt Carré St-Vincent
Parking des Mails, gratuit après 18 h et le week-end
```

- **Tram** : l'arrêt le plus proche, à 500 m au plus (« Tram A et B, arrêt De Gaulle » quand les deux
  lignes s'y arrêtent).
- **Bus** : seulement si le tram est à plus de 250 m. L'arrêt le plus proche, avec les lignes qui roulent
  le soir : celles qui y passent encore après 22 h en semaine, dans les deux sens, pour rentrer après un
  spectacle (le 24/10/2026, autour des lieux relevés : 1, 2 et 3 ; les 4 à 7, 40 et 45 s'arrêtent vers
  21 h 30). Pour un lieu dont les événements sont de jour (expositions), les lignes qui y passent
  l'après-midi (château de Saint-Jean-le-Blanc : le 5). Sans la navette O (20, de jour), le Noctambus (N),
  les lignes scolaires (50 à 66) ni les bus qui remplacent le tram (LA, LB). Des lignes qui se suivent :
  « Bus 2 à 7 ».
- **Distances** : à vol d'oiseau depuis les coordonnées du lieu ; entre deux arrêts presque aussi proches,
  le plus court à pied l'emporte (Orléans Comedy Club : Cathédrale, 290 m à pied, plutôt que Jeanne d'Arc,
  430 m). Un arrêt à plus de 650 m à pied ne compte pas (MAM : Saint-Marceau, 500 m à vol d'oiseau mais
  790 m à pied).
- **Parking** : celui que donne le site du lieu, avec ses mots (« libres d'accès » n'est pas « gratuit »),
  sinon le parc public le plus proche (400 m au plus), sous son nom dans le jeu de la Métropole
  (« Parking Cathédrale »).
- **Noms d'arrêts** : ceux du GTFS (« Carré St-Vincent »), casse corrigée au besoin (« L'Inox-L'Alliage »).
- Un lieu à adresse secrète n'a pas d'accès.

## Sources

- Arrêts et lignes : GTFS du réseau TAO (jeu « Réseau urbain TAO » sur transport.data.gouv.fr, Licence
  Ouverte), `https://www.data.gouv.fr/api/1/datasets/r/b2dfbaa3-47e9-4749-b6a4-750bebd760e7` (le même que
  `https://chouette.enroute.mobi/api/v1/datas/keolis_orleans/gtfs.zip` ; celui du 23/10/2026 vaut jusqu'au
  3 janvier 2027). Les arrêts proches des coordonnées du lieu se calculent avec `stops.txt` (un quai par
  sens : les regrouper par nom), et leurs lignes et derniers passages avec `stop_times.txt` et `trips.txt`
  (l'arrivée au terminus n'est pas un départ). Pas de `calendar.txt` : les jours de service sont dans
  `calendar_dates.txt` ; prendre un mardi et un samedi hors vacances. Les sites des lieux citent parfois des
  lignes qui n'existent plus ou ne passent plus là (L'Astrolabe : 5, 71 et LB ; Le Bouillon : 7, en 2026).
- Distance à pied : profil piéton d'OSRM sur routing.openstreetmap.de (`/routed-foot/table/v1/foot/…`,
  une requête par lieu).
- Parkings : jeu « Parcs de stationnement » d'Orléans Métropole (data.orleans-metropole.fr,
  `om-mobilite-parcs-stationnement`, Licence Ouverte : parcs en ouvrage et parkings relais, pas les parkings
  de surface comme celui des Mails), et la page « Accès » ou « Infos pratiques » du lieu (celle d'une salle
  municipale est sur le site de la ville).
- Stationnement sur place, arrêt proche, fauteuil roulant : fiche du lieu sur acceslibre.beta.gouv.fr. Son
  API demande une clé, mais la recherche du site lit un JSON public,
  `https://acceslibre.beta.gouv.fr/search/erps/?q=<nom>&zone=<lon1,lat1,lon2,lat2>&page=1&page_size=50`.
  Les fiches sont inégales (de 10 à 97 % remplies), parfois en double : vérifier l'adresse.
- Coordonnées : celles de `locations`, recoupées avec la Base Adresse Nationale
  (`https://data.geopf.fr/geocodage/search?q=…` ; api-adresse.data.gouv.fr ne répondait plus le 24/10/2026).

## Photos

Seulement une photo sous licence libre (CC BY, CC BY-SA, CC0, domaine public), ou fournie par le lieu
lui-même pour cet usage. L'app n'affiche pas de crédit sous la photo d'un lieu : d'ici là, seulement CC0 ou
domaine public. Une photo sous CC BY ou CC BY-SA demandera le même crédit que les artistes
(`ARTIST_PHOTOS.md`), avec des colonnes à ajouter à `locations`.

- Chercher sur Commons autour des coordonnées (`list=geosearch`, `gsnamespace=6`, 100 à 150 m), pas
  seulement par le nom : le Théâtre de la Tête Noire occupe l'ancienne chapelle Notre-Dame-des-Aydes, et
  ses photos portent ce nom. Un contributeur (U4you) a versé en 2026 des milliers de photos CC0 des rues
  d'Orléans.
- Copier la miniature de 1 280 px de large (`iiurlwidth=1280`), sans les paramètres `utm_*`.
- L'en-tête de la page du lieu (390 × 300, recadré au centre) coupe le haut et le bas d'une photo en
  hauteur : vérifier que le nom du lieu ou son entrée reste visible.

## Appliquer une liste

`scripts/location-details.mjs` lit une liste JSON relue (format en tête du script) et n'écrit une valeur que
si elle est encore celle relevée dans la liste :

```bash
node --env-file=.env.local scripts/location-details.mjs lieux.json
node --env-file=.env.local scripts/location-details.mjs lieux.json --write --confirm=<ref du projet>
```

La première commande ne fait qu'afficher avant → après. Relancer après écriture ne refait rien.

Revenir en arrière : la même commande avec la liste inverse (`before` et `after` échangés ; pour une photo,
`"image": { "before": <adresse posée>, "source": null }`), qui ne remet l'ancienne valeur que là où la
valeur écrite est toujours en place ; puis supprimer du stockage le fichier copié.

## Relevé du 2026-10-24

Les 27 lieux qui avaient des événements à venir dans l'app (les 350 dates) ont leur accès en prod, relu par
l'utilisateur, en deux lots : les 15 qui en avaient 5 ou plus, puis les 12 autres ; le détail est dans
`supabase/migrations/MIGRATIONS_LOG.md`. Photos posées : la Tête Noire et le Musée des Beaux-Arts (CC0), la
Collégiale Saint-Pierre-le-Puellier (domaine public) ; 13 autres lieux actifs en avaient déjà une.

Reste :

- **Photos** : rien de libre sur Commons, et des photos « tous droits réservés » sur leurs sites, pour 11 lieux
  actifs : Espace Béraire, L'Unisson, Zigotastiques – le QG, L'Envolée, L'Improviste Bar, MAM, Chafouin,
  château de Saint-Jean-le-Blanc, Théâtre Gérard-Philipe, La Cave Végétale, Les Frangins. À demander aux lieux.
- **Adresses en base**, sans effet sur l'accès : L'Envolée est au 193 rue Jean Zay (189 en base), le CCNO au
  37 rue du Bourdon Blanc (7), le Théâtre Gérard-Philipe au 7 place Sainte-Beuve, la Collégiale au
  13 cloître Saint-Pierre-le-Puellier.
- **Le Vinaigrier** : son accès (« 📍Le Vinaigrier, Résidence Dessaux du Crous ») est une précision
  d'adresse, pas un accès.

Fauteuil roulant, pour la suite d'U33 (l'app n'a pas encore de champ) : ce que disent acceslibre et les
sites des lieux.

| Lieu | acceslibre | Site du lieu |
| --- | --- | --- |
| Théâtre d'Orléans | [fiche « Théâtre La Scène Nationale »](https://acceslibre.beta.gouv.fr/app/45-orleans/a/theatre/erp/theatre-la-scene-nationale/) (34 %) : entrée de plain-pied, toilettes adaptées, places PMR à proximité | salles accessibles ; signaler ses besoins en réservant |
| Théâtre de la Tête Noire | [fiche](https://acceslibre.beta.gouv.fr/app/45-saran/a/theatre/erp/theatre-de-la-tete-noire/) (81 %) : entrée de plain-pied, aide possible, toilettes adaptées, places PMR à proximité | prévenir en amont, arriver 15 min avant |
| La Passerelle | [fiche](https://acceslibre.beta.gouv.fr/app/45-fleury-les-aubrais/a/theatre/erp/centre-culturel-la-passerelle/) (20 %) : entrée de plain-pied, parking avec places PMR | toutes les salles ; places PMR aux parkings Sud et Nord |
| Artéphé | [fiche](https://acceslibre.beta.gouv.fr/app/45-orleans/a/commerce/erp/artephe/) (35 %) : une marche, rampe amovible, sonnette ; toilettes classiques | rien |
| Espace Béraire | [fiche](https://acceslibre.beta.gouv.fr/app/45-la-chapelle-saint-mesmin/a/centre-culturel/erp/espace-beraire-2/) (97 %) : entrée de plain-pied, mais marches sans rampe vers l'accueil ; ascenseur, toilettes adaptées, parking PMR | rien |
| L'Astrolabe | [fiche](https://acceslibre.beta.gouv.fr/app/45-orleans/a/theatre/erp/lastrolabe/) (26 %) : entrée de plain-pied, toilettes adaptées, parking PMR | pas de places assises ; contacter l'équipe |
| L'Alliage | [fiche](https://acceslibre.beta.gouv.fr/app/45-olivet/a/theatre/erp/lalliage-olivet-centre-culturel/) (20 %) : entrée de plain-pied, parking PMR | tout accessible ; réserver par téléphone |
| L'Unisson | [fiche](https://acceslibre.beta.gouv.fr/app/45-saint-jean-de-la-ruelle/a/salle-de-spectacle/erp/lunisson/) (91 %) : de plain-pied, personnel formé, boucle magnétique, toilettes adaptées, places PMR à proximité | rien |
| Zigotastiques – le QG | [fiche](https://acceslibre.beta.gouv.fr/app/45-orleans/a/theatre/erp/zigotastiques-le-qg/) (12 %) : presque vide | rien |
| L'Envolée | [fiche « salle des fêtes »](https://acceslibre.beta.gouv.fr/app/45-saint-jean-de-braye/a/salle-des-fetes/erp/salle-des-fetes-1784/) (29 %) : entrée de plain-pied, toilettes adaptées, places PMR à proximité | rien |
| Le 108 | deux fiches qui se contredisent, au nom des compagnies (Éventail, Céphise) | rien |
| Le Bouillon | [fiche](https://acceslibre.beta.gouv.fr/app/45-orleans/a/centre-culturel/erp/le-bouillon-2/) (44 %) : de plain-pied, toilettes adaptées, parking PMR | salles accessibles ; prévenir de sa venue |
| Orléans Comedy Club | pas de fiche | bar et salle accessibles |
| L'Argonaute | celle du complexe sportif seulement | rien |
| MAM | [fiche](https://acceslibre.beta.gouv.fr/app/45-orleans/a/theatre/erp/maison-des-arts-et-de-la-musique/) (20 %) : entrée de plain-pied, places PMR sur place | rien |
| CCNO | [fiche](https://acceslibre.beta.gouv.fr/app/45-orleans/a/theatre/erp/centre-choregraphique-national-dorleans/) (32 %) : entrée de plain-pied, toilettes adaptées, pas de parking | « accessible », sans détail |
| Chafouin | celles du 108 | rien |
| Théâtre Gérard-Philipe | [fiche](https://acceslibre.beta.gouv.fr/app/45-orleans/a/theatre/erp/theatre-gerard-philipe-3/) (12 %) : entrée de plain-pied | fermé pour travaux depuis juin 2025 |
| La Ruche en Scène | [fiche](https://acceslibre.beta.gouv.fr/app/45-orleans/a/theatre/erp/la-ruche-en-scene/) (24 %) : entrée de plain-pied, toilettes adaptées | rien |
| Musée des Beaux-Arts | [fiche](https://acceslibre.beta.gouv.fr/app/45-orleans/a/musee/erp/musee-des-beaux-arts-7/) (28 %) : entrée de plain-pied, toilettes adaptées, places PMR à proximité | collections du XIXe (entresols) inaccessibles ; deux fauteuils prêtés à l'accueil |
| Java Pop, L'Improviste Bar, Dropkick, château de Saint-Jean-le-Blanc, Collégiale, La Cave Végétale, Les Frangins | pas de fiche | rien |
