# Fixtures de la radio

Lues le 2026-10-23 chez Radio Campus Orléans et Labomedia, en lecture seule (des GET), pour les tests de
`lib/radio/` (aucun appel réseau dans les tests). Extraits verbatim ; seules les adresses e-mail
personnelles sont masquées (`radio@example.org`, `admin@example.org`).

| Fichier | Source |
| --- | --- |
| `rco-show-nation-groove.html` | `https://orleans.radiocampus.org/emission/nation-groove/` : l'article de l'émission, icônes SVG vidées |
| `rco-feed-nation-groove.xml` | `https://orleans.radiocampus.org/podcasts/nation-groove/itunes/feed/`, entier (30 épisodes) |
| `rco-past-titles.json` | `https://orleans.radiocampus.org/wp-admin/admin-ajax.php?action=rco-get-past-titles` (« Titres diffusés ») : les quatre jours, les premières heures de chacun |
| `icecast-status.json` | `https://streams.labomedia.org:8443/status-json.xsl`, à 13:23 |
| `rco-slots-2026-10-23.json` | les créneaux des 91 émissions, tels qu'écrits sur leurs pages (`.rco-show-infos-dates-time li`) |
| `rco-wp-shows.json` | `https://orleans.radiocampus.org/wp-json/wp/v2/show?per_page=100` : quatre émissions, champs `id`, `slug`, `link`, `title` |
