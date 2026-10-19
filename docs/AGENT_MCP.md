# Agent Claude : serveur MCP de l'admin

L'admin expose des **outils** que Claude (app de bureau, Claude Code, connecteurs) peut appeler pour récupérer,
créer et publier des événements, sans passer par l'interface.

| Outil | Rôle | Écrit en base |
| --- | --- | --- |
| `list_sources` | Sources de collecte (sites, Instagram, Facebook), à revoir d'abord | non |
| `scan_agenda` | Lit l'agenda d'un site, d'une billetterie Socoop ou d'une page Facebook : événements trouvés, déjà importés, passés, annulés | non |
| `import_urls` | Lit des pages d'événements et crée les événements | oui |
| `create_event` | Crée un événement lu par Claude (post Instagram, page Facebook, affiche) | oui |
| `upsert_artist` | Retrouve ou crée la fiche d'un artiste | oui |
| `search` | Cherche lieux, organisateurs, artistes, catégories, tags | non |
| `mark_source_reviewed` | Marque une source revue (sort de « À revoir ») | oui |
| `recent_activity` | Ce que l'agent a créé récemment, événements en attente | non |

Aucun outil ne supprime ni ne modifie un événement existant.

## Règle de publication

- Source suivie (active dans la Collecte) **et** fiche complète (heure, lieu, catégorie, affiche) → **publié directement**.
- Sinon → **en attente** dans Événements, avec ce qui manque.
- Doublons écartés : même page déjà importée, même lieu au même horaire, ou même titre le même jour. Depuis
  On sort ! (agenda partagé, horaires et titres souvent écrits autrement) : même lieu à deux heures près.
- Jeune public (`events.is_young_audience`) : coché quand la source le dit (catégorie, tag « Jeune public »),
  quand le titre ou la description annonce un public d'enfants (« dès 3 ans », « 7-10 ans », « tout-petits »,
  « boum ») ou quand Claude le précise dans `create_event`. Modifiable dans l'admin ; l'app ne filtre pas dessus.
- Lieu annoncé sans fiche : l'événement reste en attente, avec le nom et l'adresse du lieu dans son adresse
  (montrés dans le formulaire de l'admin, remplacés par ceux du lieu choisi).
- Date douteuse → **rien n'est créé** (statut `to_check`) : jour de semaine qui contredit la date sur la page,
  ou titre qui annonce un autre jour. Claude relit la page et crée l'événement avec la bonne date.
- Artistes absents créés automatiquement (noms génériques comme « DJ set » ou « invités » ignorés).
- Affiches copiées dans le stockage et réduites sous 2 Mo ; un post Instagram fournit sa propre affiche.
- Chaque création est inscrite au journal d'audit avec l'auteur « Agent Claude ».

## Lecture des pages

- **Dates** : toujours ramenées à l'heure de Paris. Les pages Odoo (Orléans Comedy Club) écrivent leurs dates en UTC
  sans fuseau ; elles sont converties. Sans année écrite, l'année est celle où le jour de semaine annoncé tombe
  juste (« mercredi 7 octobre » = 2026) ; un événement passé n'est pas reporté à l'année suivante. La date collée
  au titre (« Atelier broderie - dim. 01/11 ») est retirée, comme le lieu en fin de titre (« … - Théâtre de la Tête Noire »).
- **Séances** : seules les séances à venir ou en cours sont créées ; une exposition déjà ouverte s'ajoute tant
  qu'elle n'est pas finie.
- **Agendas** : billetteries Socoop (L'Astrolabe, La Passerelle) lues par leur API publique ; menus, en-tête et pied
  de page ignorés ; adresse morte ou page d'accueil → le lien « Agenda » du site est suivi et renvoyé (`agenda_url`).
- **On sort !** (agenda d'Orléans Métropole sur OpenAgenda) : lu par son API sur le mois à venir, réduit à la scène
  locale et indépendante. Écartés et comptés : jeune public, programmation des institutions (organisateur ou agenda
  d'origine : mairie, médiathèque, musée, université, patrimoine, office de tourisme, Scène nationale, CADO),
  conférences et dédicaces, musique classique et harmonies, thés dansants, lotos et collections, tributes,
  expositions d'histoire ou de sciences et expositions de plus de six mois, en plus des ateliers, du sport, des
  visites et des salons. Chaque événement garde son lieu et son organisateur pour le tri final par Claude.
- **Facebook** : les événements à venir d'une page publique sont listés et importés sans connexion, affiche
  comprise ; seules les pages réservées aux membres restent à lire dans le navigateur.
- **Affiche** d'une page sans image de partage : image mise en avant ou plus grande image du contenu.
- **Lieux** : reconnus par leur nom, une de leurs salles (« Salle du CREDO au 108 ») ou leur adresse (numéro et voie).

Tests : `node --test lib/scraping/*.test.mjs lib/agent/*.test.mjs`.

## Brancher les outils

**En local (recommandé)** : serveur stdio lancé par Claude, qui lit `.env.local` et travaille directement sur la base.

```bash
claude mcp add -s user outlive -- node /chemin/vers/live-admin/scripts/outlive-mcp.mjs
```

Ajoute `--dry-run` après le chemin du script pour une simulation (rien n'est écrit). Le serveur garde en mémoire le
code de son lancement : après une mise à jour, ouvre une nouvelle session Claude (ou relance le serveur).

**À distance** : `POST /api/mcp` (transport HTTP de MCP), avec l'en-tête `Authorization: Bearer <OUTLIVE_AGENT_TOKEN>`.
Sans cette variable d'environnement, l'endpoint répond 503. L'en-tête `X-Outlive-Dry-Run: 1` active la simulation.

## Routine

La compétence `.claude/skills/collecte/SKILL.md` (commande `/collecte`) enchaîne : sources à revoir → scan des sites
et des pages Facebook, puis import → lecture des comptes Instagram (et des pages Facebook fermées) dans Chrome →
création des événements → sources marquées revues → récapitulatif.
