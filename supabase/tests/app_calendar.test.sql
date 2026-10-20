-- Tests de app_events_in_range() et app_event_counts()
-- (migration 20261019210000_create_app_events_in_range_and_counts.sql).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au vendredi 6 novembre 2026, 19:15 (heure de Paris) par `at_time`.

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

-- Comptes d'une liste de plages {key, start, end}, en texte « clé=tous/commencent » dans l'ordre.
CREATE FUNCTION pg_temp.comptes(plages jsonb, villes uuid[] DEFAULT NULL, categorie text DEFAULT NULL,
  maintenant timestamp DEFAULT '2026-11-06 19:15') RETURNS text
LANGUAGE sql AS $$
  SELECT string_agg(coalesce(c.range_key, c.range_index::text) || '=' || c.events_count || '/' || c.starting_count,
                    ' ' ORDER BY c.range_index)
  FROM public.app_event_counts(plages, villes, categorie, maintenant) AS c
$$;

-- Titres (numéros) des événements d'une plage, triés.
CREATE FUNCTION pg_temp.liste(debut timestamp, fin timestamp, villes uuid[] DEFAULT NULL,
  categorie text DEFAULT NULL, maintenant timestamp DEFAULT '2026-11-06 19:15') RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(split_part(e.title, ' ', 1), ' ' ORDER BY e.title), '')
  FROM public.app_events_in_range(debut, fin, villes, categorie, maintenant) AS e
$$;

CREATE FUNCTION pg_temp.jour(j text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('key', j, 'start', j || 'T00:00:00', 'end', (j::date + 1)::text || 'T00:00:00')
$$;

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'u1@test.local'),
  ('3d000000-0000-4000-8000-000000000002', 'u2@test.local');

INSERT INTO public.cities (id, label, label_normalized, slug, is_active) VALUES
  ('0a000000-0000-4000-8000-000000000001', 'Ville A', 'ville a', 'ville-a', true),
  ('0a000000-0000-4000-8000-000000000002', 'Ville B', 'ville b', 'ville-b', true);

INSERT INTO public.locations (id, name, address) VALUES
  ('1a000000-0000-4000-8000-000000000001', 'Lieu A', '1 rue A'),
  ('1a000000-0000-4000-8000-000000000002', 'Lieu B', '1 rue B');
-- sync_location_city recalcule city_id depuis l'adresse à l'insertion : la ville est posée après.
UPDATE public.locations SET city_id = '0a000000-0000-4000-8000-000000000001'
WHERE id = '1a000000-0000-4000-8000-000000000001';
UPDATE public.locations SET city_id = '0a000000-0000-4000-8000-000000000002'
WHERE id = '1a000000-0000-4000-8000-000000000002';

INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('2c000000-0000-4000-8000-000000000001', 'Zz Test Concert', true, 90),
  ('2c000000-0000-4000-8000-000000000002', 'Zz Test Atelier', true, 91);

-- Par défaut : approuvé, visible, catégorie Concert (par id), au Lieu A (ville A).
INSERT INTO public.events (id, title, date, end_date, category, location_id, status, created_by)
SELECT
  ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  coalesce(categorie, '2c000000-0000-4000-8000-000000000001'),
  coalesce(lieu, '1a000000-0000-4000-8000-000000000001')::uuid,
  coalesce(statut, 'approved'),
  auteur::uuid
FROM (VALUES
  (1,  'E01 concert ven 20:30 sans fin',      '2026-11-06 20:30', NULL,               NULL, NULL, NULL, NULL),
  (2,  'E02 atelier ven 16:00-19:00 fini',    '2026-11-06 16:00', '2026-11-06 19:00', NULL, NULL, NULL, NULL),
  (3,  'E03 en cours ven 18:45-23:00',        '2026-11-06 18:45', '2026-11-06 23:00', NULL, NULL, NULL, NULL),
  (4,  'E04 soirée ven 22:00-02:00',          '2026-11-06 22:00', '2026-11-07 02:00', NULL, NULL, NULL, NULL),
  (5,  'E05 expo 1/10-20/12',                 '2026-10-01 10:00', '2026-12-20 18:00', NULL, NULL, NULL, NULL),
  (6,  'E06 expo finie hier',                 '2026-10-01 10:00', '2026-11-05 18:00', NULL, NULL, NULL, NULL),
  (7,  'E07 expo finie ven 18:00',            '2026-10-15 10:00', '2026-11-06 18:00', NULL, NULL, NULL, NULL),
  (8,  'E08 ven 09:00-21:30',                 '2026-11-06 09:00', '2026-11-06 21:30', NULL, NULL, NULL, NULL),
  (9,  'E09 nuit 12h30 ven 20:00-08:30',      '2026-11-06 20:00', '2026-11-07 08:30', NULL, NULL, NULL, NULL),
  (10, 'E10 nuit 13h ven 20:00-09:00',        '2026-11-06 20:00', '2026-11-07 09:00', NULL, NULL, NULL, NULL),
  (11, 'E11 atelier sam 10:00',               '2026-11-07 10:00', NULL,               '2c000000-0000-4000-8000-000000000002', NULL, NULL, NULL),
  (12, 'E12 sam 15:00 ville B',               '2026-11-07 15:00', NULL,               NULL, '1a000000-0000-4000-8000-000000000002', NULL, NULL),
  (13, 'E13 sam 16:00 lieu B sans ville',     '2026-11-07 16:00', NULL,               NULL, '1a000000-0000-4000-8000-000000000002', NULL, NULL),
  (14, 'E14 dim 11:00 retiré de l''accueil',  '2026-11-08 11:00', NULL,               NULL, NULL, NULL, NULL),
  (15, 'E15 dim 15:00 catégorie par nom',     '2026-11-08 15:00', NULL,               'zz test CONCERT ', NULL, NULL, NULL),
  (16, 'E16 dim 16:00 en attente',            '2026-11-08 16:00', NULL,               NULL, NULL, 'pending', NULL),
  (17, 'E17 dim 17:00 masqué par U1',         '2026-11-08 17:00', NULL,               NULL, NULL, NULL, NULL),
  (18, 'E18 dim 18:00 auteur bloqué par U1',  '2026-11-08 18:00', NULL,               NULL, NULL, NULL, '3d000000-0000-4000-8000-000000000002'),
  (19, 'E19 lun 00:00 pile',                  '2026-11-09 00:00', NULL,               NULL, NULL, NULL, NULL),
  (20, 'E20 sam 11:00 archivé',               '2026-11-07 11:00', NULL,               NULL, NULL, NULL, NULL),
  (21, 'E21 en 2099',                         '2099-01-01 20:00', NULL,               NULL, NULL, NULL, NULL),
  (22, 'E22 en 2001 20:00-23:00',             '2001-01-01 20:00', '2001-01-01 23:00', NULL, NULL, NULL, NULL)
) AS v(n, titre, debut, fin, categorie, lieu, statut, auteur);

UPDATE public.events SET city_id = NULL WHERE id = 'e0000000-0000-4000-8000-000000000013';
UPDATE public.events SET hide_from_home = true WHERE id = 'e0000000-0000-4000-8000-000000000014';
UPDATE public.events SET archived = true WHERE id = 'e0000000-0000-4000-8000-000000000020';

INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000017', '3d000000-0000-4000-8000-000000000001');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('3d000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000002');

-- Sans session (clé anon publique) --------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT pg_temp.verifie('ville B de E13 vide (repli sur le lieu)',
  (SELECT coalesce(city_id::text, 'null') FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000013'), 'null');

-- Jours : vendredi (aujourd'hui, 19:15), samedi, dimanche, lundi.
SELECT pg_temp.verifie('jours, toutes villes, Tout',
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-06'), pg_temp.jour('2026-11-07'),
                                    pg_temp.jour('2026-11-08'), pg_temp.jour('2026-11-09'))),
  '2026-11-06=7/6 2026-11-07=5/3 2026-11-08=4/3 2026-11-09=2/1');

SELECT pg_temp.verifie('vendredi : commencés (sauf fini), en cours, et l''expo longue ; pas les expos finies',
  pg_temp.liste('2026-11-06 00:00', '2026-11-07 00:00'), 'E01 E03 E04 E05 E08 E09 E10');
SELECT pg_temp.verifie('samedi : 13 h ou plus commencé la veille compte, 12 h 30 et 4 h non',
  pg_temp.liste('2026-11-07 00:00', '2026-11-08 00:00'), 'E05 E10 E11 E12 E13');
SELECT pg_temp.verifie('dimanche : la liste garde hide_from_home (filtré par l''app)',
  pg_temp.liste('2026-11-08 00:00', '2026-11-09 00:00'), 'E05 E14 E15 E17 E18');
SELECT pg_temp.verifie('minuit pile : lundi seulement',
  pg_temp.liste('2026-11-09 00:00', '2026-11-10 00:00'), 'E05 E19');

-- Raccourcis : une fois par plage, même sur plusieurs jours.
SELECT pg_temp.verifie('ce soir (19:15 → minuit) : ce qui commence, plus l''expo longue',
  pg_temp.liste('2026-11-06 19:15', '2026-11-07 00:00'), 'E01 E04 E05 E09 E10');
SELECT pg_temp.verifie('raccourcis',
  pg_temp.comptes(jsonb_build_array(
    jsonb_build_object('key', 'ce_soir', 'start', '2026-11-06T19:15:00', 'end', '2026-11-07T00:00:00'),
    jsonb_build_object('key', 'week_end', 'start', '2026-11-07T00:00:00', 'end', '2026-11-09T00:00:00'),
    jsonb_build_object('key', 'dix_jours', 'start', '2026-11-06T00:00:00', 'end', '2026-11-16T00:00:00'))),
  'ce_soir=5/4 week_end=8/6 dix_jours=14/13');

-- Bornes reçues avec un décalage : ignoré (heure de Paris).
SELECT pg_temp.verifie('décalage ignoré',
  pg_temp.comptes(jsonb_build_array(
    jsonb_build_object('key', 'z', 'start', '2026-11-07T00:00:00.000Z', 'end', '2026-11-08T00:00:00+02:00'))),
  'z=5/3');

-- Plages vides, à l'envers, sans borne ; sans clé ; ranges qui n'est pas un tableau.
SELECT pg_temp.verifie('vide, à l''envers, sans début, sans clé',
  pg_temp.comptes(jsonb_build_array(
    jsonb_build_object('key', 'vide', 'start', '2026-11-07T00:00:00', 'end', '2026-11-07T00:00:00'),
    jsonb_build_object('key', 'envers', 'start', '2026-11-08T00:00:00', 'end', '2026-11-07T00:00:00'),
    jsonb_build_object('key', 'avant', 'end', '2026-11-07T00:00:00'),
    jsonb_build_object('start', '2026-11-09T00:00:00', 'end', '2026-11-10T00:00:00'))),
  'vide=0/0 envers=0/0 avant=7/7 3=2/1');
SELECT pg_temp.verifie('ranges nul ou objet : aucune ligne',
  (SELECT count(*)::text FROM public.app_event_counts(NULL)) || ' ' ||
  (SELECT count(*)::text FROM public.app_event_counts('{"start":"2026-11-07"}'::jsonb)), '0 0');
SELECT pg_temp.verifie('500 plages au plus',
  (SELECT count(*)::text FROM public.app_event_counts(
    (SELECT jsonb_agg(pg_temp.jour(('2026-11-01'::date + i)::text)) FROM generate_series(0, 600) AS i),
    at_time => '2026-11-06 19:15')), '500');

-- Périmètre : id de l'événement, à défaut ville du lieu ; vide = toutes.
SELECT pg_temp.verifie('ville B : E12 et E13 (ville du lieu)',
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-07')), ARRAY['0a000000-0000-4000-8000-000000000002']::uuid[]),
  '2026-11-07=2/2');
SELECT pg_temp.verifie('ville A',
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-07')), ARRAY['0a000000-0000-4000-8000-000000000001']::uuid[]),
  '2026-11-07=3/1');
SELECT pg_temp.verifie('villes A et B = toutes, tableau vide = toutes',
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-07')),
    ARRAY['0a000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000002']::uuid[]) || ' ' ||
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-07')), ARRAY[]::uuid[]),
  '2026-11-07=5/3 2026-11-07=5/3');

-- Catégorie : par id ou par nom ; hide_from_home compté hors « Tout ».
SELECT pg_temp.verifie('Concert par id, par nom, par id en majuscules',
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-08')), NULL, '2c000000-0000-4000-8000-000000000001') || ' ' ||
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-08')), NULL, '  ZZ TEST concert') || ' ' ||
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-08')), NULL, '2C000000-0000-4000-8000-000000000001'),
  '2026-11-08=5/4 2026-11-08=5/4 2026-11-08=5/4');
SELECT pg_temp.verifie('Atelier ; catégorie inconnue ; catégorie vide = Tout',
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-07')), NULL, 'Zz Test Atelier') || ' ' ||
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-07')), NULL, 'Inconnue') || ' ' ||
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-08')), NULL, '  '),
  '2026-11-07=1/1 2026-11-07=0/0 2026-11-08=4/3');
SELECT pg_temp.verifie('liste par catégorie : E15 (nom) et E14 (hide_from_home) compris',
  pg_temp.liste('2026-11-08 00:00', '2026-11-09 00:00', NULL, 'Zz Test Concert'), 'E05 E14 E15 E17 E18');

-- Maintenant réel (at_time nul) : l'événement de 2099 n'est pas terminé, celui de 2001 l'est.
SELECT pg_temp.verifie('sans at_time : maintenant réel',
  (SELECT string_agg(range_key || '=' || events_count, ' ' ORDER BY range_index) FROM public.app_event_counts(
    jsonb_build_array(pg_temp.jour('2099-01-01'), pg_temp.jour('2001-01-01')))),
  '2099-01-01=1 2001-01-01=0');
SELECT pg_temp.verifie('at_time le 1er janvier 2001 à 21:00 : en cours',
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2001-01-01')), maintenant => '2001-01-01 21:00'),
  '2001-01-01=1/1');

-- Le fuseau de la session ne change rien.
SET LOCAL TimeZone = 'UTC';
SELECT pg_temp.verifie('fuseau UTC',
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-06'), pg_temp.jour('2026-11-07'))),
  '2026-11-06=7/6 2026-11-07=5/3');
SET LOCAL TimeZone = 'Pacific/Auckland';
SELECT pg_temp.verifie('fuseau Auckland',
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-06'), pg_temp.jour('2026-11-07'))),
  '2026-11-06=7/6 2026-11-07=5/3');
SET LOCAL TimeZone = 'Europe/Paris';

-- Avec la session de U1 : sans son événement masqué (E17) ni celui de l'auteur bloqué (E18) --------

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001"}', true);
SELECT pg_temp.verifie('U1 : dimanche', pg_temp.liste('2026-11-08 00:00', '2026-11-09 00:00'), 'E05 E14 E15');
SELECT pg_temp.verifie('U1 : comptes du dimanche',
  pg_temp.comptes(jsonb_build_array(pg_temp.jour('2026-11-08'))), '2026-11-08=2/1');

-- U2 n'a rien masqué ni bloqué.
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000002"}', true);
SELECT pg_temp.verifie('U2 : dimanche', pg_temp.liste('2026-11-08 00:00', '2026-11-09 00:00'), 'E05 E14 E15 E17 E18');

RESET ROLE;
ROLLBACK;
