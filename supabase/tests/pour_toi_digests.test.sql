-- Tests des résumés de « Pour toi » (migration 20261024210000_pour_toi_digests.sql) : la règle sur des valeurs
-- déjà lues (app_is_for_me_by_ids), qui reçoit quoi (app_digest_for_me), la reprise des catégories cochées en goûts
-- (app_interests_from_categories), les droits.
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au lundi 9 novembre 2026, 8:00 (heure de Paris) par `at_time`.

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

-- Les lignes d'app_digest_for_me sur la semaine du 9 novembre : « personne:E1,E2 » par personne, dans l'ordre.
CREATE FUNCTION pg_temp.resume() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(r.qui || ':' || r.codes, ' ' ORDER BY r.qui), '')
  FROM (
    SELECT u.email AS qui, string_agg(split_part(e.title, ' ', 1), ',' ORDER BY e.date, e.title) AS codes
    FROM public.app_digest_for_me('2026-11-09 00:00', '2026-11-16 00:00', '2026-11-09 08:00') AS d
    JOIN auth.users AS u ON u.id = d.user_id
    JOIN public.events AS e ON e.id = d.event_id
    GROUP BY u.email
  ) AS r
$$;

-- Ce que la reprise des catégories écrirait (ou a écrit) : « personne=goûts » par personne.
CREATE FUNCTION pg_temp.reprise(ecrire boolean) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(u.email || '=' || array_to_string(r.interest_slugs, ','), ' ' ORDER BY u.email), '')
  FROM public.app_interests_from_categories(ecrire) AS r
  JOIN auth.users AS u ON u.id = r.user_id
$$;

-- Jeu d'essai --------------------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'ines'),
  ('3d000000-0000-4000-8000-000000000002', 'julien'),
  ('3d000000-0000-4000-8000-000000000003', 'suivis'),
  ('3d000000-0000-4000-8000-000000000004', 'auteur'),
  ('3d000000-0000-4000-8000-000000000011', 'defaut'),
  ('3d000000-0000-4000-8000-000000000012', 'choix'),
  ('3d000000-0000-4000-8000-000000000013', 'aucune'),
  ('3d000000-0000-4000-8000-000000000014', 'lignes'),
  ('3d000000-0000-4000-8000-000000000015', 'deja');

INSERT INTO public.locations (id, name, address) VALUES
  ('1a000000-0000-4000-8000-000000000001', 'Zz Lieu Un', '1 rue A'),
  ('1a000000-0000-4000-8000-000000000002', 'Zz Lieu Deux', '2 rue A');

INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('2c000000-0000-4000-8000-000000000001', 'Zz Concert', true, 91),
  ('2c000000-0000-4000-8000-000000000002', 'Spectacle', true, 92);

INSERT INTO public.tags (id, name) VALUES
  ('4e000000-0000-4000-8000-000000000001', 'jeune public'),
  ('4e000000-0000-4000-8000-000000000002', 'Zz Humour'),
  ('4e000000-0000-4000-8000-000000000004', 'Zz Cirque');

UPDATE public.app_interests SET category_ids = '{}', tag_ids = '{}' WHERE NOT family;
UPDATE public.app_interests AS i SET category_ids = v.categories::uuid[], tag_ids = v.tags::uuid[]
FROM (VALUES
  ('concerts', '{2c000000-0000-4000-8000-000000000001}', '{}'),
  ('humour', '{}', '{4e000000-0000-4000-8000-000000000002}'),
  ('cirque', '{}', '{4e000000-0000-4000-8000-000000000004}')
) AS v(slug, categories, tags)
WHERE i.slug = v.slug;

INSERT INTO public.events (id, title, date, end_date, category, location_id, status, created_by, is_young_audience, tag_ids)
SELECT
  ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  NULL,
  categorie,
  lieu::uuid,
  'approved',
  auteur::uuid,
  jeune,
  tags::uuid[]
FROM (VALUES
  (1, 'D01 concert',                  '2026-11-09 20:00', 'Zz Concert', '1a000000-0000-4000-8000-000000000001', NULL, false, '{}'),
  (2, 'D02 humour',                   '2026-11-10 20:00', 'Spectacle', '1a000000-0000-4000-8000-000000000001', NULL, false,
      '{4e000000-0000-4000-8000-000000000002}'),
  (3, 'D03 cirque jeune',             '2026-11-11 15:00', 'Spectacle', '1a000000-0000-4000-8000-000000000001', NULL, true,
      '{4e000000-0000-4000-8000-000000000004}'),
  (4, 'D04 concert masqué par Inès',  '2026-11-12 20:00', 'Zz Concert', '1a000000-0000-4000-8000-000000000001', NULL, false, '{}'),
  (5, 'D05 concert d''un bloqué',     '2026-11-13 20:00', 'Zz Concert', '1a000000-0000-4000-8000-000000000001',
      '3d000000-0000-4000-8000-000000000004', false, '{}'),
  (6, 'D06 au Lieu Deux',             '2026-11-14 20:00', 'Spectacle', '1a000000-0000-4000-8000-000000000002', NULL, false, '{}'),
  (7, 'D07 concert la semaine d''après', '2026-11-17 20:00', 'Zz Concert', '1a000000-0000-4000-8000-000000000001', NULL, false, '{}'),
  (8, 'D08 concert retiré accueil',   '2026-11-15 20:00', 'Zz Concert', '1a000000-0000-4000-8000-000000000001', NULL, false, '{}')
) AS v(n, titre, debut, categorie, lieu, auteur, jeune, tags);
UPDATE public.events SET hide_from_home = true WHERE id = 'e0000000-0000-4000-8000-000000000008';

INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000004', '3d000000-0000-4000-8000-000000000001');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('3d000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000004');

-- Inès : Concerts, Humour. Julien : Cirque, En famille. « suivis » suit le Lieu Deux, sans goût.
INSERT INTO public.user_interests (user_id, interest_id)
SELECT v.utilisateur::uuid, i.id
FROM (VALUES
  ('3d000000-0000-4000-8000-000000000001', 'concerts'),
  ('3d000000-0000-4000-8000-000000000001', 'humour'),
  ('3d000000-0000-4000-8000-000000000002', 'cirque'),
  ('3d000000-0000-4000-8000-000000000002', 'en-famille'),
  ('3d000000-0000-4000-8000-000000000015', 'danse')
) AS v(utilisateur, slug)
JOIN public.app_interests AS i ON i.slug = v.slug;
INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
  ('3d000000-0000-4000-8000-000000000003', 'location', '1a000000-0000-4000-8000-000000000002'),
  ('3d000000-0000-4000-8000-000000000002', 'location', '1a000000-0000-4000-8000-000000000002');

-- La règle sur des valeurs déjà lues ------------------------------------------------------------------------------

SELECT pg_temp.verifie('app_is_for_me_by_ids : un lieu suivi, un suivi, un goût, rien ; jamais null',
  public.app_is_for_me_by_ids(gen_random_uuid(), '1a000000-0000-4000-8000-000000000002', '{}',
    '{}', '{1a000000-0000-4000-8000-000000000002}', '{}')::text || ' '
  || public.app_is_for_me_by_ids('e0000000-0000-4000-8000-000000000001', NULL, '{}',
    '{}', '{}', '{e0000000-0000-4000-8000-000000000001}')::text || ' '
  || public.app_is_for_me_by_ids(gen_random_uuid(), NULL, '{4f000000-0000-4000-8000-000000000001}',
    '{4f000000-0000-4000-8000-000000000001}', '{}', '{}')::text || ' '
  || public.app_is_for_me_by_ids(gen_random_uuid(), NULL, NULL, NULL, NULL, NULL)::text,
  'true true true false');

-- Qui reçoit quoi --------------------------------------------------------------------------------------------------

-- Inès : ses concerts et l'humour, sans son masqué (D04) ni le bloqué (D05), le retiré de l'accueil compris (D08) ;
-- Julien : le cirque jeune (En famille) et le Lieu Deux qu'il suit ; « suivis » n'a pas de goût : pas ici (le résumé
-- d'avant). Rien de la semaine d'après (D07).
SELECT pg_temp.verifie('app_digest_for_me : pour chacun, ce qui est pour lui cette semaine',
  pg_temp.resume(), 'ines:D01,D02,D08 julien:D03,D06');
SELECT pg_temp.verifie('« deja » a un goût (Danse) sans rien cette semaine : une ligne, sans événement',
  (SELECT count(*)::text || ' ' || count(d.event_id)::text
   FROM public.app_digest_for_me('2026-11-09 00:00', '2026-11-16 00:00', '2026-11-09 08:00') AS d
   WHERE d.user_id = '3d000000-0000-4000-8000-000000000015'),
  '1 0');
SELECT pg_temp.verifie('« suivis » n''a pas de goût : aucune ligne (il garde le résumé d''avant)',
  (SELECT count(*)::text
   FROM public.app_digest_for_me('2026-11-09 00:00', '2026-11-16 00:00', '2026-11-09 08:00') AS d
   WHERE d.user_id = '3d000000-0000-4000-8000-000000000003'),
  '0');
-- Inès masque aussi D01 et D02 : il ne lui reste que D08 ; tout masqué, elle garderait une ligne vide.
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', '3d000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000008', '3d000000-0000-4000-8000-000000000001');
SELECT pg_temp.verifie('Inès a tout masqué : une ligne, sans événement',
  (SELECT count(*)::text || ' ' || count(d.event_id)::text
   FROM public.app_digest_for_me('2026-11-09 00:00', '2026-11-16 00:00', '2026-11-09 08:00') AS d
   WHERE d.user_id = '3d000000-0000-4000-8000-000000000001'),
  '1 0');
DELETE FROM public.user_hidden_events
WHERE user_id = '3d000000-0000-4000-8000-000000000001'
  AND event_id IN ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
                   'e0000000-0000-4000-8000-000000000008');

-- Un goût inactif ne fait plus recevoir.
UPDATE public.app_interests SET is_active = false WHERE slug = 'humour';
SELECT pg_temp.verifie('Humour inactif : Inès garde ses concerts',
  pg_temp.resume(), 'ines:D01,D08 julien:D03,D06');
UPDATE public.app_interests SET is_active = true WHERE slug = 'humour';
UPDATE public.app_interests SET is_active = false WHERE slug = 'danse';
SELECT pg_temp.verifie('Danse inactive : « deja », qui n''a qu''elle, n''est plus destinataire (le résumé d''avant)',
  (SELECT count(*)::text
   FROM public.app_digest_for_me('2026-11-09 00:00', '2026-11-16 00:00', '2026-11-09 08:00') AS d
   WHERE d.user_id = '3d000000-0000-4000-8000-000000000015'),
  '0');
UPDATE public.app_interests SET is_active = true WHERE slug = 'danse';

-- La reprise des catégories cochées ------------------------------------------------------------------------------

-- « defaut » : toutes les catégories actives (le défaut de l'app) ; « choix » : Zz Concert et Spectacle ; « aucune » :
-- [] ; « lignes » : sans category_ids, une ligne Spectacle ; « deja » : une catégorie, mais déjà un goût.
INSERT INTO public.user_notification_preferences (user_id, category_ids)
SELECT '3d000000-0000-4000-8000-000000000011', array_agg(c.id::text) FROM public.categories AS c WHERE c.is_active;
INSERT INTO public.user_notification_preferences (user_id, category_ids) VALUES
  ('3d000000-0000-4000-8000-000000000012', ARRAY['2c000000-0000-4000-8000-000000000001', '2c000000-0000-4000-8000-000000000002']),
  ('3d000000-0000-4000-8000-000000000013', ARRAY[]::text[]),
  ('3d000000-0000-4000-8000-000000000014', NULL),
  ('3d000000-0000-4000-8000-000000000015', ARRAY['2c000000-0000-4000-8000-000000000001']);
INSERT INTO public.user_notification_categories (user_id, category_id) VALUES
  ('3d000000-0000-4000-8000-000000000013', '2c000000-0000-4000-8000-000000000001'),
  ('3d000000-0000-4000-8000-000000000014', '2c000000-0000-4000-8000-000000000002');

SELECT pg_temp.verifie('reprise à blanc : un choix (Spectacle : Théâtre, Humour, Cirque), les lignes ; pas le défaut, ni [], ni qui a déjà un goût',
  pg_temp.reprise(false), 'choix=concerts,theatre,humour,cirque lignes=theatre,humour,cirque');
SELECT pg_temp.verifie('à blanc, rien n''est écrit',
  (SELECT count(*)::text FROM public.user_interests
   WHERE user_id IN ('3d000000-0000-4000-8000-000000000012', '3d000000-0000-4000-8000-000000000014')),
  '0');
SELECT pg_temp.verifie('la reprise écrit les mêmes goûts',
  pg_temp.reprise(true), 'choix=concerts,theatre,humour,cirque lignes=theatre,humour,cirque');
SELECT pg_temp.verifie('écrits : 7 goûts',
  (SELECT count(*)::text FROM public.user_interests
   WHERE user_id IN ('3d000000-0000-4000-8000-000000000012', '3d000000-0000-4000-8000-000000000014')),
  '7');
SELECT pg_temp.verifie('rejouée : plus rien à reprendre',
  '[' || pg_temp.reprise(true) || ']', '[]');

-- Les droits -------------------------------------------------------------------------------------------------------

SELECT pg_temp.verifie('les fonctions des crons sont fermées à anon et authenticated',
  has_function_privilege('anon', 'public.app_digest_for_me(timestamp, timestamp, timestamp)', 'execute')::text || ' '
  || has_function_privilege('authenticated', 'public.app_digest_for_me(timestamp, timestamp, timestamp)', 'execute')::text || ' '
  || has_function_privilege('anon', 'public.app_interests_from_categories(boolean)', 'execute')::text || ' '
  || has_function_privilege('authenticated', 'public.app_interests_from_categories(boolean)', 'execute')::text || ' '
  || has_function_privilege('service_role', 'public.app_digest_for_me(timestamp, timestamp, timestamp)', 'execute')::text,
  'false false false false true');

ROLLBACK;
