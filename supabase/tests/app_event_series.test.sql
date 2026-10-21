-- Tests de app_event_series(), app_event_series_of() et des titres de série (migration
-- 20261021170000_create_app_event_series.sql), et de la règle des séries dans app_see_also().
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au vendredi 6 novembre 2026, 19:15 (heure de Paris) par `at_time`. Les
-- événements sont désignés par les deux derniers chiffres de leur id (« 01 » = l'événement 01).

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events) THEN
    RAISE EXCEPTION 'Base non vide : ces tests se lancent sur une base jetable (scripts/db-test.sh), jamais en prod.';
  END IF;
END $$;

CREATE FUNCTION pg_temp.verifie(nom text, obtenu text, attendu text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF obtenu IS DISTINCT FROM attendu THEN
    RAISE EXCEPTION 'ÉCHEC % : obtenu « % », attendu « % »', nom, obtenu, attendu;
  END IF;
  RAISE NOTICE 'ok  %', nom;
END $$;

-- Les séries, dans l'ordre rendu par la fonction : pour chacune, ses dates par date, puis sa première
-- date et son nombre de dates : « 01 02 03 (01:3) | 11 12 (11:2) » ; « ! » si les lignes d'une série ne
-- se suivent pas.
CREATE FUNCTION pg_temp.series(maintenant timestamp DEFAULT '2026-11-06 19:15') RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(g.texte, ' | ' ORDER BY g.rang), '')
  FROM (
    SELECT
      min(s.n) AS rang,
      string_agg(right(s.event_id::text, 2), ' ' ORDER BY s.n)
        || ' (' || right(s.series_id::text, 2) || ':' || min(s.dates_count) || ')'
        || CASE WHEN max(s.n) - min(s.n) + 1 = count(*) THEN '' ELSE '!' END AS texte
    FROM public.app_event_series(maintenant) WITH ORDINALITY AS s(event_id, series_id, date, dates_count, n)
    GROUP BY s.series_id
  ) AS g
$$;

-- Rangée « Aussi à » d'app_see_also, dans l'ordre du rang, et sa source : « 05 (Zz Théâtre:location=6) ».
CREATE FUNCTION pg_temp.aussi(evenement text) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(
    string_agg(right(s.event_id::text, 2), ' ' ORDER BY s.rank)
      || ' (' || min(s.source_name || ':' || s.source_kind || '=' || s.source_events_count) || ')',
    '')
  FROM public.app_see_also(('e6000000-0000-4000-8000-0000000000' || evenement)::uuid, NULL, '2026-11-06 19:15', 20) AS s
  WHERE s.section = 'place'
$$;

-- Le titre d'une série ------------------------------------------------------------------------------

-- Les motifs de stripDateFromTitle (lib/scraping/dates.ts), puis app_search_normalize.
SELECT pg_temp.verifie('titre : date en fin de titre, après un séparateur',
  public.app_event_series_title('Atelier broderie - dim. 01/11') || ' / '
  || public.app_event_series_title('Plonger | Mercredi 21/10/2026') || ' / '
  || public.app_event_series_title('Visite – 1er novembre') || ' / '
  || public.app_event_series_title('Fora - 23 oct.'),
  'atelier broderie / plonger / visite / fora');
SELECT pg_temp.verifie('titre : mois et année en fin de titre',
  public.app_event_series_title('Live de chant - Novembre 2026') || ' / '
  || public.app_event_series_title('Expo (octobre 2026)') || ' / '
  || public.app_event_series_title('Atelier - DÉCEMBRE 2026'),
  'live de chant / expo / atelier');
SELECT pg_temp.verifie('titre : date en début de titre, avant un séparateur',
  public.app_event_series_title('Samedi 31 octobre 2026 : Atelier SITA') || ' / '
  || public.app_event_series_title('1er mai : Fête du travail') || ' / '
  || public.app_event_series_title('Jeu. 5/11 - Quiz'),
  'atelier sita / fete du travail / quiz');
-- Pas de séparateur, pas une date, ou moins de 3 caractères sans la date : le titre reste.
SELECT pg_temp.verifie('titre : ce qui n''est pas une date à retirer reste',
  public.app_event_series_title('Concert du 10 novembre') || ' / '
  || public.app_event_series_title('Stage 8-12 ans') || ' / '
  || public.app_event_series_title('Concert : 5 & 5') || ' / '
  || public.app_event_series_title('30/30') || ' / '
  || public.app_event_series_title('Mars - 12 mars') || ' / '
  || public.app_event_series_title('Samedi 12/11 - Ok'),
  'concert du 10 novembre / stage 8 12 ans / concert 5 5 / 30 30 / mars / samedi 12 11 ok');
SELECT pg_temp.verifie('titre : casse, accents, ponctuation ; nul',
  public.app_event_series_title('THÉÂTRE  Samedi !') || ' / ' || public.app_event_series_title(NULL) || '|',
  'theatre samedi / |');

-- La règle seule, sur des tableaux : deux dates d'un titre au même lieu, une autre à 8 jours, une sans
-- lieu ; par série puis par date.
SELECT pg_temp.verifie('règle seule : sur des événements donnés, sans rien lire',
  (SELECT string_agg(right(s.event_id::text, 1) || '>' || right(s.series_id::text, 1) || ':' || s.dates_count, ' '
     ORDER BY n)
   FROM public.app_event_series_of(
     ARRAY['a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
       'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004',
       'a0000000-0000-4000-8000-000000000005']::uuid[],
     ARRAY['2026-11-03 20:00', '2026-11-01 20:00', '2026-11-11 20:00', '2026-11-02 20:00',
       '2026-11-01 18:00']::timestamptz[],
     ARRAY['1c000000-0000-4000-8000-000000000001', '1c000000-0000-4000-8000-000000000001',
       '1c000000-0000-4000-8000-000000000001', NULL, '1c000000-0000-4000-8000-000000000001']::uuid[],
     ARRAY['Bal', 'BAL !', 'Bal', 'Bal', 'Autre']::text[]
   ) WITH ORDINALITY AS s(event_id, series_id, date, dates_count, n)),
  '2>2:2 1>2:2');

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'u1@test.local'),
  ('3d000000-0000-4000-8000-000000000002', 'u2@test.local');

-- L1 théâtre, L2 salle, L3 bar.
INSERT INTO public.locations (id, name, address) VALUES
  ('1b000000-0000-4000-8000-000000000001', 'Zz Théâtre', '1 rue A'),
  ('1b000000-0000-4000-8000-000000000002', 'Zz Salle', '2 rue A'),
  ('1b000000-0000-4000-8000-000000000003', 'Zz Bar', '3 rue A');

INSERT INTO public.events (id, title, date, end_date, category, location_id, status, created_by)
SELECT
  ('e6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  'Zz Spectacle',
  CASE WHEN lieu IS NOT NULL THEN ('1b000000-0000-4000-8000-00000000000' || lieu)::uuid END,
  coalesce(statut, 'approved'),
  auteur::uuid
FROM (VALUES
  -- « Plonger » au théâtre (L1) : 01 ce soir, 02 et 03 demain (deux séances, deux dates), 09 le 12, 04 le
  -- 14 (sa date dans le titre), à 7 jours au plus l'une de l'autre ; 05, 8 jours après 04 : une autre
  -- série, seule. Pas 06 (un autre lieu), 07 (hier), 08 (en attente).
  (1,  'Plonger',                '2026-11-06 20:00', NULL, 1, NULL, NULL),
  (2,  'Plonger',                '2026-11-07 18:00', NULL, 1, NULL, NULL),
  (3,  'PLONGER !',              '2026-11-07 21:00', NULL, 1, NULL, NULL),
  (4,  'Plonger - sam. 14/11',   '2026-11-14 20:30', NULL, 1, NULL, NULL),
  (5,  'Plonger',                '2026-11-22 20:00', NULL, 1, NULL, NULL),
  (6,  'Plonger',                '2026-11-08 20:00', NULL, 2, NULL, NULL),
  (7,  'Plonger',                '2026-11-05 20:00', NULL, 1, NULL, NULL),
  (8,  'Plonger',                '2026-11-10 20:00', NULL, 1, 'pending', NULL),
  (9,  'Plonger',                '2026-11-12 20:00', NULL, 1, NULL, NULL),
  -- « Plateaux » au bar (L3), chaque semaine, le vendredi et le samedi : 14 tombe 7 jours après 13, une
  -- demi-heure plus tard (7 jours de calendrier : la même série) ; 15 est retiré de l'accueil, 16 vient
  -- d'U2.
  (11, 'Plateaux',               '2026-11-13 21:00', NULL, 3, NULL, NULL),
  (12, 'Plateaux',               '2026-11-14 21:00', NULL, 3, NULL, NULL),
  (13, 'Plateaux',               '2026-11-20 21:30', NULL, 3, NULL, NULL),
  (14, 'Plateaux',               '2026-11-27 22:00', NULL, 3, NULL, NULL),
  (15, 'Plateaux',               '2026-12-04 21:00', NULL, 3, NULL, NULL),
  (16, 'Plateaux',               '2026-12-11 21:00', NULL, 3, NULL, '3d000000-0000-4000-8000-000000000002'),
  -- Un atelier ce matin, sans heure de fin (« à venir » toute la journée), et après-demain.
  (17, 'Atelier',                '2026-11-06 10:00', NULL, 3, NULL, NULL),
  (18, 'Atelier',                '2026-11-08 10:00', NULL, 3, NULL, NULL),
  -- Sans lieu : d'aucune série.
  (21, 'Sans lieu',              '2026-11-09 20:00', NULL, NULL, NULL, NULL),
  (22, 'Sans lieu',              '2026-11-10 20:00', NULL, NULL, NULL, NULL),
  -- Un festival en cours (commencé hier, plus de 12 h) et sa soirée du 9 : la même série, qui commence
  -- avant aujourd'hui.
  (33, 'Festival',               '2026-11-05 10:00', '2026-11-08 23:00', 2, NULL, NULL),
  (34, 'Festival',               '2026-11-09 20:00', NULL, 2, NULL, NULL)
) AS v(n, titre, debut, fin, lieu, statut, auteur);

UPDATE public.events SET hide_from_home = true WHERE id = 'e6000000-0000-4000-8000-000000000015';
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e6000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000001');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('3d000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000002');

-- Sans session (clé anon publique) --------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

-- Par série (sa première date : le festival en cours d'abord), puis par date ; chaque série : sa
-- première date et son nombre de dates. Le festival compte sa date d'hier, en cours ; l'atelier celle
-- de ce matin ; « Plonger » ses deux séances de demain et 04, dont le titre porte la date ; « Plateaux »
-- 14 (7 jours de calendrier), 15 (retiré de l'accueil) et 16. Pas de ligne pour une date seule (05,
-- 06), passée (07), en attente (08), sans lieu (21, 22).
SELECT pg_temp.verifie('séries : titre, lieu, 7 jours au plus entre deux dates',
  pg_temp.series(),
  '33 34 (33:2) | 17 18 (17:2) | 01 02 03 09 04 (01:5) | 11 12 13 14 15 16 (11:6)');
-- Le 13 novembre : « Plonger » n'a plus que 04 (le 14) et 05 (le 22), à 8 jours : plus de série. Le
-- festival est fini.
SELECT pg_temp.verifie('séries : les dates passées ne comptent plus',
  pg_temp.series('2026-11-13 09:00'), '11 12 13 14 15 16 (11:6)');
SELECT pg_temp.verifie('séries : une ligne par date, date de l''événement',
  (SELECT count(*) || ' ' || to_char(min(s.date) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
   FROM public.app_event_series('2026-11-06 19:15') AS s),
  '15 2026-11-05 10:00');

-- « À voir aussi » : une ligne par série. La fiche de 01 (ou de 02, la même série) propose 05, du même
-- titre au même lieu mais 8 jours après la série ; celle de 05 propose la série de 01, à sa première
-- date. Le compte reste celui de la page du lieu : 01, 02, 03, 04, 05, 09.
SELECT pg_temp.verifie('voir aussi : pas la série de la fiche, une autre série du même titre',
  pg_temp.aussi('01') || ' / ' || pg_temp.aussi('02') || ' / ' || pg_temp.aussi('05'),
  '05 (Zz Théâtre:location=6) / 05 (Zz Théâtre:location=6) / 01 (Zz Théâtre:location=6)');
-- 06 (seul à la salle) : la salle propose le festival, sa première date (33), une seule ligne.
SELECT pg_temp.verifie('voir aussi : une ligne par série, à sa première date',
  pg_temp.aussi('06'), '33 (Zz Salle:location=3)');

-- Avec la session de U1 : sans 01, qu'il a masqué (la série commence à 02), ni 16, d'un auteur qu'il a
-- bloqué.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001"}', true);
SELECT pg_temp.verifie('U1 : sans l''événement masqué ni l''auteur bloqué',
  pg_temp.series(),
  '33 34 (33:2) | 17 18 (17:2) | 02 03 09 04 (02:4) | 11 12 13 14 15 (11:5)');

RESET ROLE;
ROLLBACK;
