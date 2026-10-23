-- Tests des festivals (migration 20261023120000_create_festivals.sql) : events.festival_id et ses règles
-- (pas lui-même, pas de festival dans un festival), festival_locations (contraintes, RLS, droits), la zone (un
-- festival y entre par sa fiche, comme tout événement), app_festival_events.
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au jeudi 19 novembre 2026, 18:00 (heure de Paris) par `at_time`. Les événements
-- sont désignés par les deux derniers caractères de leur id : « 01 » à « 12 » pour les événements, « f1 » à
-- « f6 » pour les festivals (« F1 » dans les résultats).

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

-- La session : anon, ou un compte (« 01 »). Toujours suivie de RESET ROLE.
CREATE FUNCTION pg_temp.session(compte text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF compte IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object(
      'role', 'authenticated',
      'sub', 'e9a00000-0000-4000-8000-0000000000' || compte,
      'is_anonymous', false,
      'app_metadata', json_build_object('provider', 'email')
    )::text, true);
    SET LOCAL ROLE authenticated;
  END IF;
END $$;

-- Une écriture, essayée puis annulée : « ok », « 0 ligne » (rien de touché) ou le code de son erreur.
CREATE FUNCTION pg_temp.essai(requete text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  lignes integer;
BEGIN
  BEGIN
    EXECUTE requete;
    GET DIAGNOSTICS lignes = ROW_COUNT;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = lignes::text;
  EXCEPTION
    WHEN raise_exception THEN
      RETURN CASE SQLERRM WHEN '0' THEN '0 ligne' ELSE 'ok' END;
    WHEN OTHERS THEN
      RETURN SQLSTATE;
  END;
END $$;

-- Rattacher l'événement « 09 » au festival « f1 » (ou détacher : NULL), par essai().
CREATE FUNCTION pg_temp.rattache(evenement text, festival text) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.essai(format(
    'UPDATE public.events SET festival_id = %s WHERE id = %L',
    coalesce(quote_literal('e9000000-0000-4000-8000-0000000000' || festival), 'NULL'),
    'e9000000-0000-4000-8000-0000000000' || evenement
  ))
$$;

-- Les lieux de festival lisibles par la session, dans l'ordre : « F1:L2 F1:L1 F2:L3 ».
CREATE FUNCTION pg_temp.lieux() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(
    'F' || right(fl.festival_id::text, 1) || ':L' || right(fl.location_id::text, 1), ' '
    ORDER BY fl.festival_id, fl.sort_index), '')
  FROM public.festival_locations AS fl
$$;

-- Les lignes d'app_festival_events, dans l'ordre rendu : pour chaque festival, ses événements par date, puis
-- son nombre : « F1: 01 02 05 (3) | F3: 07 (1) » ; « ! » si les lignes d'un festival ne se suivent pas.
CREATE FUNCTION pg_temp.festivals(maintenant timestamp DEFAULT '2026-11-19 18:00') RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(g.texte, ' | ' ORDER BY g.rang), '')
  FROM (
    SELECT
      min(f.n) AS rang,
      'F' || right(f.festival_id::text, 1) || ': '
        || string_agg(right(f.event_id::text, 2), ' ' ORDER BY f.n)
        || ' (' || min(f.events_count) || ')'
        || CASE WHEN max(f.n) - min(f.n) + 1 = count(*) THEN '' ELSE '!' END AS texte
    FROM public.app_festival_events(maintenant) WITH ORDINALITY AS f(event_id, festival_id, date, events_count, n)
    GROUP BY f.festival_id
  ) AS g
$$;

-- Les événements d'app_events_in_zone (la liste de l'accueil, toutes dates), par leur id.
CREATE FUNCTION pg_temp.zone(ville text, km numeric) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(e.id::text, 2), ' ' ORDER BY e.id), '')
  FROM public.app_events_in_zone(ville, km) AS e
$$;

-- Les événements à venir de la zone selon app_events_in_range (les comptes, les catégories, la recherche).
CREATE FUNCTION pg_temp.a_venir(ville text, km numeric) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(e.id::text, 2), ' ' ORDER BY e.id), '')
  FROM public.app_events_in_range(
    '2026-11-19 00:00', NULL, NULL, NULL, '2026-11-19 18:00', zone_city => ville, zone_km => km
  ) AS e
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO anon, authenticated;

-- Jeu d'essai --------------------------------------------------------------------------------------

-- u01 admin ; u02 compte ordinaire ; u03 masque l'événement 05 et le festival F3, bloque u04 ; u04 auteur
-- du festival F4.
INSERT INTO auth.users (id, email, is_anonymous, raw_user_meta_data) VALUES
  ('e9a00000-0000-4000-8000-000000000001', 'u01@test.local', false, '{"role":"admin"}'),
  ('e9a00000-0000-4000-8000-000000000002', 'u02@test.local', false, '{}'),
  ('e9a00000-0000-4000-8000-000000000003', 'u03@test.local', false, '{}'),
  ('e9a00000-0000-4000-8000-000000000004', 'u04@test.local', false, '{}');

-- L1 au centre de Centreville ; L2 et L3 à Lointaine, à 30 km.
INSERT INTO public.cities (id, label, label_normalized, slug, is_active) VALUES
  ('0c000000-0000-4000-8000-000000000001', 'Centreville', 'centreville', 'centreville', true),
  ('0c000000-0000-4000-8000-000000000002', 'Lointaine', 'lointaine', 'lointaine', true);
INSERT INTO public.locations (id, name, address, latitude, longitude) VALUES
  ('1c000000-0000-4000-8000-000000000001', 'Zz Dropkick', '1 rue A', 47.9, 1.9),
  ('1c000000-0000-4000-8000-000000000002', 'Zz Le 108', '1 rue B', 47.9, 2.3),
  ('1c000000-0000-4000-8000-000000000003', 'Zz Astrolabe', '1 rue C', 47.9, 2.3);
-- Les déclencheurs lisent la ville dans l'adresse : les villes et leurs centres sont posés ensuite.
UPDATE public.locations SET city_id = '0c000000-0000-4000-8000-000000000001'
WHERE id = '1c000000-0000-4000-8000-000000000001';
UPDATE public.locations SET city_id = '0c000000-0000-4000-8000-000000000002'
WHERE id IN ('1c000000-0000-4000-8000-000000000002', '1c000000-0000-4000-8000-000000000003');
UPDATE public.cities SET center_lat = 47.9, center_lng = 1.9 WHERE id = '0c000000-0000-4000-8000-000000000001';
UPDATE public.cities SET center_lat = 47.9, center_lng = 2.3 WHERE id = '0c000000-0000-4000-8000-000000000002';

INSERT INTO public.events (id, title, date, end_date, category, location_id, status, created_by)
SELECT
  ('e9000000-0000-4000-8000-0000000000' || code)::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  categorie,
  ('1c000000-0000-4000-8000-00000000000' || lieu)::uuid,
  coalesce(statut, 'approved'),
  auteur::uuid
FROM (VALUES
  -- F1, « Fulgurances » : du jeudi 19 au dimanche 22, 04:45, au 108 (sa fiche) ; ses lieux : le 108 puis le
  -- Dropkick (à Centreville).
  ('f1', 'Zz Fulgurances #2',   '2026-11-19 21:00', '2026-11-22 04:45', 'Festival', 2, NULL, NULL),
  -- F2 en attente, F3 masqué par u03, F4 d'un auteur bloqué par u03, F5 au 108 seulement, F6 sans rien.
  ('f2', 'Zz Festival attente', '2026-11-20 10:00', '2026-11-21 23:00', 'Festival', 3, 'pending', NULL),
  ('f3', 'Zz Festival masqué',  '2026-11-21 10:00', '2026-11-22 23:00', 'Festival', 2, NULL, NULL),
  ('f4', 'Zz Festival bloqué',  '2026-11-21 10:00', '2026-11-22 23:00', 'Festival', 2, NULL,
   'e9a00000-0000-4000-8000-000000000004'),
  ('f5', 'Zz Festival loin',    '2026-11-25 10:00', '2026-11-26 23:00', 'Festival', 2, NULL, NULL),
  ('f6', 'Zz Festival vide',    '2026-11-25 10:00', '2026-11-26 23:00', 'Festival', 3, NULL, NULL),
  -- De F1 : 01 Micro ce soir au Dropkick, 02 Infra demain au 108, 03 hier (passé), 04 en attente, 05 masqué
  -- par u03 ; 06 de F2 ; 07 de F3 ; 08 de F4 ; 09 seul ; 10 de F5 au 108 ; 11 et 12 seuls, pour les règles.
  ('01', 'Zz Micro',            '2026-11-19 21:00', '2026-11-20 00:45', 'DJ Set', 1, NULL, NULL),
  ('02', 'Zz Infra',            '2026-11-20 18:00', '2026-11-21 00:00', 'Concert', 2, NULL, NULL),
  ('03', 'Zz Avant-première',   '2026-11-18 20:00', '2026-11-18 23:00', 'Concert', 1, NULL, NULL),
  ('04', 'Zz Ultra',            '2026-11-21 20:00', NULL, 'Concert', 3, 'pending', NULL),
  ('05', 'Zz Gamma',            '2026-11-21 22:00', NULL, 'DJ Set', 3, NULL, NULL),
  ('06', 'Zz Soirée attente',   '2026-11-20 20:00', NULL, 'Concert', 3, NULL, NULL),
  ('07', 'Zz Soirée masquée',   '2026-11-21 20:00', NULL, 'Concert', 2, NULL, NULL),
  ('08', 'Zz Soirée bloquée',   '2026-11-21 20:00', NULL, 'Concert', 2, NULL, NULL),
  ('09', 'Zz Seul',             '2026-11-20 20:00', NULL, 'Concert', 1, NULL, NULL),
  ('10', 'Zz Soirée loin',      '2026-11-25 20:00', NULL, 'Concert', 2, NULL, NULL),
  ('11', 'Zz Autre',            '2026-11-20 20:00', NULL, 'Concert', 1, NULL, NULL),
  ('12', 'Zz Encore',           '2026-11-20 20:00', NULL, 'Concert', 1, NULL, NULL)
) AS v(code, titre, debut, fin, categorie, lieu, statut, auteur);

UPDATE public.events AS e SET festival_id = ('e9000000-0000-4000-8000-0000000000' || v.festival)::uuid
FROM (VALUES
  ('01', 'f1'), ('02', 'f1'), ('03', 'f1'), ('04', 'f1'), ('05', 'f1'),
  ('06', 'f2'), ('07', 'f3'), ('08', 'f4'), ('10', 'f5')
) AS v(code, festival)
WHERE e.id = ('e9000000-0000-4000-8000-0000000000' || v.code)::uuid;

INSERT INTO public.festival_locations (festival_id, location_id, sort_index) VALUES
  ('e9000000-0000-4000-8000-0000000000f1', '1c000000-0000-4000-8000-000000000002', 0),
  ('e9000000-0000-4000-8000-0000000000f1', '1c000000-0000-4000-8000-000000000001', 1),
  ('e9000000-0000-4000-8000-0000000000f2', '1c000000-0000-4000-8000-000000000003', 0),
  ('e9000000-0000-4000-8000-0000000000f5', '1c000000-0000-4000-8000-000000000002', 0);

INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e9000000-0000-4000-8000-000000000005', 'e9a00000-0000-4000-8000-000000000003'),
  ('e9000000-0000-4000-8000-0000000000f3', 'e9a00000-0000-4000-8000-000000000003');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('e9a00000-0000-4000-8000-000000000003', 'e9a00000-0000-4000-8000-000000000004');

-- events.festival_id : ses règles --------------------------------------------------------------------

-- Rattacher, changer de festival, détacher : en tant qu'admin, sous la RLS d'events.
SELECT pg_temp.session('01');
SELECT pg_temp.verifie('rattacher, changer, détacher (admin)',
  pg_temp.rattache('09', 'f1') || ' ' || pg_temp.rattache('01', 'f5') || ' ' || pg_temp.rattache('02', NULL),
  'ok ok ok');
-- Pas lui-même ; pas dans un événement qui fait partie d'un festival (01 est dans F1) ; un festival qui a des
-- événements n'entre dans aucun (F1 dans F5) ; un festival sans événement, oui (F6 dans F5).
SELECT pg_temp.verifie('pas lui-même, pas de festival dans un festival',
  pg_temp.rattache('09', '09') || ' ' || pg_temp.rattache('09', '01') || ' ' || pg_temp.rattache('f1', 'f5')
    || ' ' || pg_temp.rattache('f6', 'f5'),
  '23514 23514 23514 ok');
RESET ROLE;
-- Un festival qui n'existe pas : la clé étrangère.
SELECT pg_temp.verifie('festival inconnu',
  pg_temp.essai($q$UPDATE public.events SET festival_id = 'e9000000-0000-4000-8000-0000000000ff'
    WHERE id = 'e9000000-0000-4000-8000-000000000009'$q$),
  '23503');
-- La règle vaut aussi à l'insertion, et dans une même requête (01 dans F6 pendant que F6 entre dans F5).
SELECT pg_temp.verifie('à l''insertion, et dans une même requête',
  pg_temp.essai($q$INSERT INTO public.events (title, date, category, status, festival_id)
    VALUES ('Zz Nouveau', '2026-11-20 20:00', 'Concert', 'approved', 'e9000000-0000-4000-8000-000000000001')$q$)
  || ' ' || pg_temp.essai($q$INSERT INTO public.events (title, date, category, status, festival_id)
    VALUES ('Zz Nouveau', '2026-11-20 20:00', 'Concert', 'approved', 'e9000000-0000-4000-8000-0000000000f1')$q$)
  || ' ' || pg_temp.essai($q$UPDATE public.events
    SET festival_id = CASE right(id::text, 2) WHEN '11' THEN 'e9000000-0000-4000-8000-000000000012'::uuid
      ELSE 'e9000000-0000-4000-8000-0000000000f5'::uuid END
    WHERE id IN ('e9000000-0000-4000-8000-000000000011', 'e9000000-0000-4000-8000-000000000012')$q$),
  '23514 ok 23514');

-- festival_locations : contraintes, RLS, droits -----------------------------------------------------

SELECT pg_temp.verifie('un lieu une fois par festival ; festival et lieu existants',
  pg_temp.essai($q$INSERT INTO public.festival_locations (festival_id, location_id)
    VALUES ('e9000000-0000-4000-8000-0000000000f1', '1c000000-0000-4000-8000-000000000001')$q$)
  || ' ' || pg_temp.essai($q$INSERT INTO public.festival_locations (festival_id, location_id)
    VALUES ('e9000000-0000-4000-8000-0000000000ff', '1c000000-0000-4000-8000-000000000001')$q$)
  || ' ' || pg_temp.essai($q$INSERT INTO public.festival_locations (festival_id, location_id)
    VALUES ('e9000000-0000-4000-8000-0000000000f1', '1c000000-0000-4000-8000-0000000000ff')$q$),
  '23505 23503 23503');

-- Lisibles avec leur festival : le public ne lit pas les lieux de F2, en attente ; l'admin, tous.
SELECT pg_temp.session();
SELECT pg_temp.verifie('anon : les lieux des festivals approuvés', pg_temp.lieux(), 'F1:L2 F1:L1 F5:L2');
RESET ROLE;
SELECT pg_temp.session('02');
SELECT pg_temp.verifie('compte ordinaire : les mêmes', pg_temp.lieux(), 'F1:L2 F1:L1 F5:L2');
RESET ROLE;
SELECT pg_temp.session('01');
SELECT pg_temp.verifie('admin : tous', pg_temp.lieux(), 'F1:L2 F1:L1 F2:L3 F5:L2');
RESET ROLE;

-- Écrits par l'admin seulement : anon n'a aucun droit d'écriture (42501), un compte ordinaire non plus (la
-- RLS : 42501 à l'insertion, rien de touché sinon).
SELECT pg_temp.session();
SELECT pg_temp.verifie('anon n''écrit pas',
  pg_temp.essai($q$INSERT INTO public.festival_locations (festival_id, location_id)
    VALUES ('e9000000-0000-4000-8000-0000000000f5', '1c000000-0000-4000-8000-000000000001')$q$)
  || ' ' || pg_temp.essai($q$DELETE FROM public.festival_locations$q$),
  '42501 42501');
RESET ROLE;
SELECT pg_temp.session('02');
SELECT pg_temp.verifie('compte ordinaire : n''écrit pas',
  pg_temp.essai($q$INSERT INTO public.festival_locations (festival_id, location_id)
    VALUES ('e9000000-0000-4000-8000-0000000000f5', '1c000000-0000-4000-8000-000000000001')$q$)
  || ' ' || pg_temp.essai($q$UPDATE public.festival_locations SET sort_index = 5$q$)
  || ' ' || pg_temp.essai($q$DELETE FROM public.festival_locations$q$),
  '42501 0 ligne 0 ligne');
RESET ROLE;
SELECT pg_temp.session('01');
SELECT pg_temp.verifie('admin : ajoute, range, retire',
  pg_temp.essai($q$INSERT INTO public.festival_locations (festival_id, location_id)
    VALUES ('e9000000-0000-4000-8000-0000000000f5', '1c000000-0000-4000-8000-000000000001')$q$)
  || ' ' || pg_temp.essai($q$UPDATE public.festival_locations SET sort_index = 5
    WHERE festival_id = 'e9000000-0000-4000-8000-0000000000f1'$q$)
  || ' ' || pg_temp.essai($q$DELETE FROM public.festival_locations
    WHERE festival_id = 'e9000000-0000-4000-8000-0000000000f2'$q$),
  'ok ok ok');
RESET ROLE;

-- La zone : par la fiche, comme tout événement ----------------------------------------------------------

-- Un festival entre dans la zone par son location_id (le premier de ses lieux, mis par le back-office), ses
-- événements chacun par le leur. Centreville · 5 km : ce qui se tient au Dropkick (01 Micro, 03 passé, 09, 11,
-- 12), pas F1, dont la fiche est au 108, à 30 km, même si le Dropkick est l'un de ses lieux ; la liste de
-- l'accueil (app_events_in_zone) et les comptes (app_events_in_range, à venir : sans 03) disent la même chose.
-- Lointaine · 5 km : F1 par sa fiche. Sans zone : tous les événements visibles.
SELECT pg_temp.session();
SELECT pg_temp.verifie('zone : un festival par sa fiche, pas par ses autres lieux',
  pg_temp.zone('centreville', 5) || ' / ' || pg_temp.a_venir('centreville', 5), '01 03 09 11 12 / 01 09 11 12');
SELECT pg_temp.verifie('zone : Lointaine, par la fiche',
  pg_temp.zone('lointaine', 5), '02 05 06 07 08 10 f1 f3 f4 f5 f6');
SELECT pg_temp.verifie('zone : sans zone, tout',
  pg_temp.zone(NULL, NULL), '01 02 03 05 06 07 08 09 10 11 12 f1 f3 f4 f5 f6');
RESET ROLE;

-- app_festival_events ------------------------------------------------------------------------------

-- Anon, jeudi 19 à 18:00 : F1 avec 01 (ce soir), 02 et 05, sans 03 (passé) ni 04 (en attente) ; F3 et F4 ;
-- rien pour 06 (son festival F2 en attente), 09 (seul) ni 10 (F5, plus tard : le 25). Par festival (sa
-- première date), puis par date. Le festival lui-même n'a pas de ligne.
SELECT pg_temp.session();
SELECT pg_temp.verifie('festivals : les événements à venir de festivals visibles',
  pg_temp.festivals(), 'F1: 01 02 05 (3) | F3: 07 (1) | F4: 08 (1) | F5: 10 (1)');
SELECT pg_temp.verifie('festivals : une ligne par événement, sa date',
  (SELECT count(*) || ' ' || to_char(min(f.date) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
   FROM public.app_festival_events('2026-11-19 18:00') AS f),
  '6 2026-11-19 21:00');
-- Vendredi 20 à midi : 01 est fini (00:45).
SELECT pg_temp.verifie('festivals : les événements finis n''y sont plus',
  pg_temp.festivals('2026-11-20 12:00'), 'F1: 02 05 (2) | F3: 07 (1) | F4: 08 (1) | F5: 10 (1)');
-- Vendredi 20 à 00:30 : 01 joue encore, mais il a commencé hier et dure moins de 12 h : à partir d'aujourd'hui
-- 0 h, comme app_events_in_range et app_event_series, il n'est plus à venir.
SELECT pg_temp.verifie('festivals : à partir d''aujourd''hui 0 h',
  pg_temp.festivals('2026-11-20 00:30'), 'F1: 02 05 (2) | F3: 07 (1) | F4: 08 (1) | F5: 10 (1)');
RESET ROLE;
-- u03 : sans 05, qu'il a masqué, ni F3 (masqué) ni F4 (son auteur est bloqué) : 07 et 08 restent seuls.
SELECT pg_temp.session('03');
SELECT pg_temp.verifie('festivals : masqués et bloqués',
  pg_temp.festivals(), 'F1: 01 02 (2) | F5: 10 (1)');
RESET ROLE;
-- L'admin voit tout dans events, mais l'app ne montre que les festivals publiés : pas F2.
SELECT pg_temp.session('01');
SELECT pg_temp.verifie('festivals : admin, pas de festival en attente',
  pg_temp.festivals(), 'F1: 01 02 05 (3) | F3: 07 (1) | F4: 08 (1) | F5: 10 (1)');
RESET ROLE;

-- Suppressions ------------------------------------------------------------------------------------

-- Le festival supprimé : ses événements restent, détachés ; ses lieux partent avec lui. Un lieu supprimé
-- quitte ses festivals.
DELETE FROM public.events WHERE id = 'e9000000-0000-4000-8000-0000000000f1';
DELETE FROM public.locations WHERE id = '1c000000-0000-4000-8000-000000000003';
SELECT pg_temp.verifie('suppressions : festival et lieu',
  (SELECT count(*) FILTER (WHERE festival_id IS NULL) || '/' || count(*) FROM public.events
   WHERE right(id::text, 2) IN ('01', '02', '03', '04', '05'))
  || ' ' || pg_temp.lieux(),
  '5/5 F5:L2');

ROLLBACK;
