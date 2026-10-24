# Accès et photos des lieux

Chantier U13 de la refonte (`../live/docs/HISTORIQUE.md`), côté admin ; la suite, « L'accès des lieux » (U33),
est dans `../live/docs/FEUILLE_DE_ROUTE.md` (« Chantiers »). La fiche d'un événement de l'app
(`../live/docs/fonctionnalites/fiche.md`, « Les sections, dans l'ordre ») affiche l'accès du lieu sous son
adresse, sous l'intitulé « Accès » (`locations.directions`).

## Écrire l'accès

Texte brut, une ligne par mode, trois lignes au plus, sans emoji, sans puce ni point final :

```
Tram B, arrêt Madeleine
Bus 2, 12 et 15, arrêt Mairie Jean Zay
Parking de la Patinoire, gratuit les soirs de concert
```

- **Tram** : l'arrêt le plus proche, à 500 m au plus (« Tram A et B, arrêt De Gaulle » quand les deux
  lignes s'y arrêtent).
- **Bus** : seulement si le tram est à plus de 250 m. L'arrêt le plus proche, avec les lignes qui roulent
  le soir. Sans la navette O (20, de jour), le Noctambus (N), les lignes scolaires (50 à 66) ni les bus
  qui remplacent le tram (LA, LB). Des lignes qui se suivent : « Bus 2 à 7 ».
- **Parking** : celui que donne le site du lieu, sinon le parc public le plus proche (400 m au plus).
- Un lieu à adresse secrète n'a pas d'accès.

## Sources

- Arrêts et lignes : GTFS du réseau TAO (jeu « Réseau urbain TAO » sur transport.data.gouv.fr, Licence
  Ouverte), `https://chouette.enroute.mobi/api/v1/datas/keolis_orleans/gtfs.zip`. Les arrêts proches
  des coordonnées du lieu se calculent avec `stops.txt`, et leurs lignes avec `stop_times.txt` et
  `trips.txt`. Les sites des lieux citent parfois des lignes qui n'existent plus (L'Astrolabe : 5 et 71,
  en 2026).
- Parkings : jeu « Parcs de stationnement » d'Orléans Métropole (data.orleans-metropole.fr,
  `om-mobilite-parcs-stationnement`, Licence Ouverte), et la page « Accès » ou « Infos pratiques » du lieu.
- Stationnement sur place, arrêt proche : fiche du lieu sur acceslibre.beta.gouv.fr.

## Photos

Seulement une photo sous licence libre (CC BY, CC BY-SA, CC0, domaine public), ou fournie par le lieu
lui-même pour cet usage. Le 2026-10-21, Commons et Wikidata n'avaient rien pour les lieux actifs sans
photo. Une photo sous CC BY ou CC BY-SA demandera le même crédit que les artistes (`ARTIST_PHOTOS.md`),
avec des colonnes à ajouter à `locations`.

## Appliquer une liste

`scripts/location-details.mjs` lit une liste JSON relue (format en tête du script) et n'écrit une valeur que
si elle est encore celle relevée dans la liste :

```bash
node --env-file=.env.local scripts/location-details.mjs lieux.json
node --env-file=.env.local scripts/location-details.mjs lieux.json --write --confirm=<ref du projet>
```

La première commande ne fait qu'afficher avant → après. Relancer après écriture ne refait rien.
