# Notion Import Kit

Ce dossier contient un kit CSV pour creer rapidement les 4 sources Notion attendues par la synchro:

- `01_locations.csv`
- `02_organizers.csv`
- `03_events.csv`
- `04_requests.csv`

## Limite importante

L'import CSV natif de Notion ne sait pas creer ou mapper des proprietes `Relation`.

Consequence:

- les bases `Locations` et `Organizers` sont quasi totalement importables telles quelles
- les bases `Events` et `Requests` doivent etre completees apres import avec les relations manquantes

## Ordre recommande

1. Importer `01_locations.csv`
2. Importer `02_organizers.csv`
3. Importer `03_events.csv`
4. Importer `04_requests.csv`

## Ce que fait chaque CSV

- chaque fichier contient les noms de colonnes definitifs attendus par le code
- chaque fichier contient une ligne d'exemple pour aider Notion a proposer les bons types
- apres import, supprimer la ligne `SCHEMA_EXAMPLE__DELETE_ME`

## Reglages manuels apres import

### Base `Events`

Ajouter ces proprietes manuellement dans Notion:

- `Location` : relation vers la base `Locations`
- `Organizers` : relation vers la base `Organizers`

Colonnes importantes deja importees:

- `Title`
- `Status`
- `Date`
- `End date`
- `Price`
- `Presale price`
- `Subscriber price`
- `Is full`
- `Is featured`
- `Archived`
- `Organizer summary`
- `External URL`
- `Image URL`
- `Address`
- `Description`
- `Capacity`
- `Live event ID`
- `Sync origin`
- `Source updated at`
- `Last synced at`
- `Sync hash`
- `Action`

### Base `Requests`

Ajouter ces proprietes manuellement dans Notion:

- `Location` : relation vers la base `Locations`
- `Organizers` : relation vers la base `Organizers`

Colonnes importantes deja importees:

- `Title`
- `Request type`
- `Status`
- `Lane`
- `Event date`
- `End date`
- `Category`
- `Location summary`
- `Organizer summary`
- `Source URL`
- `External URL`
- `Image URL`
- `Moderation reason`
- `Contributor message`
- `Internal notes`
- `Allow resubmission`
- `Live request ID`
- `Converted event ID`
- `Sync origin`
- `Source updated at`
- `Last synced at`
- `Sync hash`
- `Action`

### Base `Locations`

Cette base peut etre importee telle quelle.

Colonnes:

- `Name`
- `Address`
- `City`
- `Image URL`
- `Live location ID`
- `Sync origin`
- `Source updated at`
- `Last synced at`
- `Sync hash`

### Base `Organizers`

Cette base peut etre importee telle quelle.

Colonnes:

- `Name`
- `Owner kind`
- `Website URL`
- `Instagram URL`
- `Facebook URL`
- `Image URL`
- `Live organizer ID`
- `Sync origin`
- `Source updated at`
- `Last synced at`
- `Sync hash`

## Types a verifier pendant l'import

Notion peut se tromper pendant le mapping CSV. Verifier en priorite:

- `Date`, `End date`, `Event date` : type `Date`
- `Price`, `Presale price`, `Subscriber price`, `Capacity` : type `Number`
- `Is full`, `Is featured`, `Archived`, `Allow resubmission` : type `Checkbox`
- `External URL`, `Source URL`, `Scraping URL`, `Instagram URL`, `Facebook URL`, `Image URL`, `Website URL` : type `URL`

Le reste peut rester en `Text` si besoin.

## Proprietes techniques a garder

Ne pas supprimer ces colonnes, meme si vous les masquez ensuite:

- `Live event ID`
- `Live request ID`
- `Live location ID`
- `Live organizer ID`
- `Sync origin`
- `Source updated at`
- `Last synced at`
- `Sync hash`
- `Action`

## Astuce pratique

Une fois l'import termine:

- masquer les colonnes techniques dans chaque vue
- garder au moins une vue "raw sync" visible pour le debug
- supprimer la ligne d'exemple dans chaque base
