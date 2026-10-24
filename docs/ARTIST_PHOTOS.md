# Photos des artistes

Chantier U33 de `../live/docs/AMELIORATIONS.md`. Sur la fiche d'un événement, un artiste sans photo
n'a que ses initiales. Le 2026-10-21, 4 artistes sur 195 avaient une photo ; le 2026-10-24, 8 sur 189, dont 4
avec leur crédit, et 28 photos validées attendent la prochaine version de l'app (« Relecture du 2026-10-24 »).

## Règles (décision du 2026-10-21)

- **Wikimedia Commons seulement**, et seulement sous licence libre : CC BY, CC BY-SA, CC0 ou domaine
  public. Pas de photos de presse ni d'autres sites. Sans image libre, l'artiste garde ses initiales.
- **Pas de Deezer** : ses conditions pour les développeurs limitent l'usage au non commercial (§ IV) et
  interdisent de reproduire les photos d'artistes, propriété de Deezer ou des ayants droit (§ VII).
- **Le crédit s'affiche avec la photo**, partout où elle paraît (page de l'artiste dans l'app, page publique
  `/artists/[slug]`, et toute rangée qui montre la photo) : « Photo : <auteur>, <licence> », l'auteur menant à
  la page Commons du fichier. Les licences CC BY et CC BY-SA l'exigent. Tant qu'une version de l'app en service
  ne l'affiche pas, ne poser que des photos CC0 ou du domaine public (confirmé le 2026-10-24).
- **Où en est le crédit, le 2026-10-24** : la page de l'artiste l'affiche dans l'app depuis live-app#162
  (prochaine version), la page publique et l'API publique v1 (`artists[].imageCredit`, `imageLicense`,
  `imageSourceUrl`) aussi. La 1.0.6 de l'App Store (avril 2026) montre la photo sans crédit, sur la page de
  l'artiste et sur la fiche d'un événement. Les rangées d'artistes (fiche d'un événement dans l'app et sur le
  web) montrent la photo en vignette et mènent à la page de l'artiste.

## Colonnes d'`artists`

Migration `20261021160000_add_artist_image_credit.sql` :

| Colonne | Contenu |
| --- | --- |
| `image_credit` | auteur de `image_url` (texte tiré de Commons, « Auteur inconnu » pour le domaine public sans auteur) |
| `image_license` | « CC BY-SA 4.0 », « CC BY 2.0 », « CC0 », « Domaine public »… |
| `image_source_url` | page du fichier sur Commons, lien du crédit |

Les trois à `null` : photo sans crédit à afficher (envoyée par l'artiste ou l'admin). Un trigger les remet à
`null` quand `image_url` change sans eux dans la même écriture (photo remplacée ou retirée dans l'admin), et
une contrainte refuse un crédit sans photo. Tests : `supabase/tests/artist_image_credit.test.sql`.

## Comment une photo est trouvée

`lib/artists/commons-photos.ts`, `findArtistPhoto(nom)` :

1. Wikidata, par le nom (libellé ou alias identique, sans tenir compte des accents ni de la casse). Une
   fiche ne compte que si c'est un artiste de scène : un identifiant musical (MusicBrainz, Discogs, Spotify,
   Deezer, Apple Music) ou une description d'artiste (« chanteuse », « compagnie de cirque »…), et pas un
   lieu (« salle de danse… »).
2. Sinon MusicBrainz (une requête par seconde), qui relie les musiciens à leur fiche Wikidata.
3. Deux artistes de scène du même nom : rien (« ambiguous »).
4. L'image de la fiche (P18) sur Commons : licence acceptée, photo (JPEG, PNG, WebP ou TIFF) de 400 px de
   large au moins, auteur connu pour CC BY et CC BY-SA. Copie de 1 280 px de large (vignette que Commons sert
   sur `upload.wikimedia.org` ou, depuis peu, `thumb.wikimedia.org`).

Un homonyme peut encore passer (un rappeur espagnol pour une chanteuse française du même nom) : la liste
se relit avant d'écrire, avec la description de Wikidata et les événements de l'artiste chez nous.

## Poser les photos

Depuis le checkout principal (avec `.env.local`) :

```bash
node --env-file=.env.local scripts/artist-photos.mjs --out=photos.json
node --env-file=.env.local scripts/artist-photos.mjs --plan=photos.json
node --env-file=.env.local scripts/artist-photos.mjs --plan=photos.json --write --confirm=<ref du projet>
```

1. La recherche lit les artistes sans photo et écrit les photos trouvées dans `photos.json` : artiste,
   description Wikidata, ses événements, auteur, licence, lien. Rien n'est écrit en base.
2. Relire `photos.json` et retirer les lignes douteuses.
3. La simulation montre ce qui serait posé ; `--write` copie chaque photo dans
   `organizers-images/artists/` (comme la collecte) et remplit `image_url` et les trois colonnes du crédit,
   seulement si l'artiste n'a toujours pas de photo.

Recherche du 2026-10-21 sur les 185 artistes sans photo : 30 photos trouvées, dont 4 écartées à la relecture
(homonymes, repérés à leurs événements : des ateliers pour « Marine » et « Sidonie », un spectacle de krump
pour « Nach », une soirée d'artistes locaux pour « Luce ») ; 25 fiches Wikidata sans image, 4 noms ambigus,
2 photos trop petites, 121 artistes sans fiche, 3 recherches à refaire (MusicBrainz saturé).

## Relecture du 2026-10-24

La recherche automatique ne regarde que l'image de la fiche Wikidata. Pour les 185 artistes sans photo, la
relecture est allée plus loin, en lecture seule : les fiches Wikidata du même nom (en français et en anglais),
leur image, leur catégorie Commons et les fichiers qui les représentent, puis la recherche plein texte de
Commons. Chaque artiste a été recoupé avec ses événements chez nous et la page de la salle, chaque photo
regardée, et sa provenance vérifiée : photo déposée par son auteur, licence Flickr vérifiée sur Commons, ou
autorisation enregistrée (VRT).

- **38 photos proposées** (32 sûres, 6 probables), relues par l'utilisateur sur une page avec les vignettes, la
  licence, le crédit et le degré de certitude. Les 32 sûres sont validées : `docs/artist-photos-2026-10-24.json`,
  au format de `--plan`.
- **4 posées le 2026-10-24** (CC0 ou domaine public) : Albertina Carri, Brad Mehldau, Marie Brassard, Marie
  Chouinard. Vérifié en anonyme : photo, crédit et lien ; « Photo : Björn Milcke, Domaine public » sur la page
  publique de Brad Mehldau.
- **28 à poser à la sortie de la prochaine version** (CC BY ou CC BY-SA), puisque la 1.0.6 montre la photo sans
  crédit. Depuis le checkout principal, simulation puis écriture ; les 4 déjà posées sont laissées :

  ```bash
  node --env-file=.env.local scripts/artist-photos.mjs --plan=docs/artist-photos-2026-10-24.json
  node --env-file=.env.local scripts/artist-photos.mjs --plan=docs/artist-photos-2026-10-24.json --write --confirm=<ref du projet>
  ```

- **Les 6 probables, laissées de côté** : Abou Lagraa et Les 7 Doigts de la Main (photo déposée par la compagnie
  elle-même, sans autorisation VRT), La Jungle, Jean-Yves Masson, Nans Vincent et Philippe Gordiani (rien ne relie
  les photos à l'artiste de chez nous).
- **Choix faits à la main** : une autre photo que l'image Wikidata pour Jeanne Added (image déposée par son label,
  sans autorisation), Leïla Martial (elles sont deux sur l'image) et Catherine Major (plusieurs images) ; crédit
  raccourci quand Commons y ajoute un lieu ou une adresse (Alcest, Omar Sosa, L'Orchestre d'Hommes-Orchestres) ;
  « Olivier Dumay » pour Dick Annegarn (Commons : « DUMAY Olivier Victor Marius »).
- **147 artistes sans photo trouvée** : 15 prénoms seuls (ateliers) ; 13 fiches Wikidata sans photo libre (Agathe
  & Adrien, Aurélien Bory, Cirque Alfonse, Daniel Garlitsky, Emma Bojan, Hélène Bressiant, Leïla Ka, Linda
  Hayford, Louis Mazetier, Rosa Bursztein, Shana Carroll, Thibaut Garcia, Triptik) ; 15 écartés (homonymes pour
  Nach, Luce, Luiza, The Gnomes, El Coyoté, Borduas, Shedding et Assassin ; photo trop petite pour Thierry
  Malandain ; la gare de Biarritz pour le Malandain Ballet Biarritz ; une photo prise à travers une vitre pour
  Guilhem Valayé ; une photo de groupe pour Suzanne de Baecque ; une statue pour David Coria ; une image de
  YouTube pas encore vérifiée sur Commons pour Zed Yun Pavarotti ; des photos de la BnF données pour domaine
  public, à tort semble-t-il, pour Robyn Orlin) ; 104 sans fiche ni photo libre.

Revenir en arrière pour une photo posée : remettre `image_url` à `null` si c'est toujours notre copie (le trigger
efface le crédit), puis supprimer la copie dans le stockage (tableau de bord Supabase, ou
`supabase.storage.from("organizers-images").remove([...])`).

```sql
update public.artists set image_url = null
where id = '<artist_id>' and image_url = '<adresse de la copie>';
```

Copies du 2026-10-24, dans `organizers-images/artists/` : `1792811293227-emvyx9q4g7b.jpg` (Albertina Carri),
`1792811213889-nohf7ijnec.jpg` (Brad Mehldau), `1792811215738-07gipxw8tcuc.jpg` (Marie Brassard),
`1792811217088-3fvrtkdakwr.jpg` (Marie Chouinard).
