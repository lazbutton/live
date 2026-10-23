-- Tests de la radio (Radio Campus dans OutLive) : tables, RLS, app_radio_day(), app_radio_shows(),
-- radio_live_grid(), l'import horaire par pg_cron, les visuels gardés (migrations
-- 20261023140000_create_radio_tables.sql, 20261023141000_create_app_radio_functions.sql,
-- 20261023143000_schedule_radio_import.sql et 20261023235000_add_radio_show_images.sql ; les
-- compteurs d'audience de 20261023142000 sont dans app_audience.test.sql).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- Scénario : vendredi 23 octobre 2026 à 19:12:04, heure de Paris (l'exemple du contrat : Kawaï Campus
-- Club en direct jusqu'à 20:00, Blockchain ensuite). Station A activée, station B désactivée.

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

-- Rôle de l'appelant : anon (clé publique), sinon un compte.
CREATE FUNCTION pg_temp.session(utilisateur uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF utilisateur IS NULL THEN
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  ELSE
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('role', 'authenticated', 'sub', utilisateur)::text, true);
  END IF;
END $$;

-- Une journée de app_radio_day, dans l'ordre rendu : « JJ HH:MM-HH:MM nom état [▶] » (▶ : un épisode).
CREATE FUNCTION pg_temp.journee(station uuid, jour date, a timestamp) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(
    to_char(d.starts_at AT TIME ZONE 'UTC', 'DD HH24:MI') || '-' || to_char(d.ends_at AT TIME ZONE 'UTC', 'HH24:MI')
      || ' ' || d.name || ' ' || d.state || CASE WHEN d.episode_id IS NULL THEN '' ELSE ' ▶' END,
    ' | ' ORDER BY d.n), '')
  FROM public.app_radio_day(station, jour, a) WITH ORDINALITY
    AS d(show_id, slug, name, style, family, starts_at, ends_at, episode_id, audio_url, duration_s, state, n)
$$;

-- La grille du direct : « kind nom HH:MM », live puis next puis on_air (par nom).
CREATE FUNCTION pg_temp.grille(station uuid, a timestamp) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(g.kind || ' ' || g.name || ' ' || to_char(g.starts_at AT TIME ZONE 'UTC', 'DD HH24:MI'),
    ' | ' ORDER BY CASE g.kind WHEN 'live' THEN 1 WHEN 'next' THEN 2 ELSE 3 END, g.name), '')
  FROM public.radio_live_grid(station, a) AS g
$$;

-- Les émissions de A à Z : « lettre nom ».
CREATE FUNCTION pg_temp.emissions(station uuid, a timestamp) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(s.letter || ' ' || s.name, ' | ' ORDER BY s.n), '')
  FROM public.app_radio_shows(station, a) WITH ORDINALITY
    AS s(id, slug, name, style, family, slots, last_episode_at, organizer_id, description, page_url, letter, n)
$$;

-- Une écriture sous le rôle courant, ou l'erreur.
CREATE FUNCTION pg_temp.ecrit(requete text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE requete;
  RETURN 'écrit';
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 'refusé';
END $$;

-- Un insert d'émission avec ces créneaux, ou le code de l'erreur.
CREATE FUNCTION pg_temp.creneaux_acceptes(creneaux jsonb) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.radio_shows (station_id, source_id, slug, name, page_url, slots)
  VALUES ('ad000000-0000-4000-8000-0000000000a1', 900000 + (random() * 99999)::int,
          'essai-' || md5(random()::text), 'Essai', 'https://radio.test/essai/', creneaux);
  RETURN 'oui';
EXCEPTION WHEN check_violation THEN
  RETURN 'non';
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.journee(uuid, date, timestamp), pg_temp.grille(uuid, timestamp),
  pg_temp.emissions(uuid, timestamp), pg_temp.ecrit(text) TO anon, authenticated;

-- La migration n'insère Radio Campus Orléans que si son organisateur existe : rien ici, sans erreur.
SELECT pg_temp.verifie('migration : pas de station sans son organisateur',
  (SELECT count(*)::text FROM public.radio_stations), '0');

-- Données -------------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ad000000-0000-4000-8000-000000000001', 'auditeur@test.local', '{}'::jsonb);

INSERT INTO public.organizers (id, name) VALUES
  ('ad000000-0000-4000-8000-0000000000b1', 'Radio A'),
  ('ad000000-0000-4000-8000-0000000000b2', 'Radio B'),
  ('ad000000-0000-4000-8000-0000000000b3', 'Jungle Assault');

INSERT INTO public.radio_stations (id, organizer_id, name, frequency, stream_url, status_url, site_url, enabled) VALUES
  ('ad000000-0000-4000-8000-0000000000a1', 'ad000000-0000-4000-8000-0000000000b1', 'Radio A', '88.3',
   'https://flux.test/a', 'https://flux.test/status-json.xsl', 'https://radio-a.test/', true),
  ('ad000000-0000-4000-8000-0000000000a2', 'ad000000-0000-4000-8000-0000000000b2', 'Radio B', '91.1',
   'https://flux.test/b', 'https://flux.test/status-json.xsl', 'https://radio-b.test/', false);

-- Émissions de A (jour ISO : 1 = lundi … 5 = vendredi, 6 = samedi, 7 = dimanche).
CREATE FUNCTION pg_temp.emission(id_court text, nom text, creneaux jsonb, famille text DEFAULT 'musique',
  station uuid DEFAULT 'ad000000-0000-4000-8000-0000000000a1') RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.radio_shows (id, station_id, source_id, slug, name, style, family, page_url, slots)
  VALUES (('ad000000-0000-4000-8000-0000000001' || id_court)::uuid, station, ('x' || id_court)::bit(8)::int,
          'emission-' || id_court, nom, 'Style de ' || nom, famille, 'https://radio.test/' || id_court || '/', creneaux)
$$;

SELECT pg_temp.emission('01', 'Nation Groove', '[{"weekday": 4, "start": "22:00", "end": "24:00"}]');
SELECT pg_temp.emission('02', 'Kawaï Campus Club', '[{"weekday": 5, "start": "19:00", "end": "20:00"}]', 'parole');
SELECT pg_temp.emission('03', 'Blockchain', '[{"weekday": 5, "start": "20:00", "end": "21:00"}]');
SELECT pg_temp.emission('04', 'Le Mag Culturel', '[{"weekday": 4, "start": "17:00", "end": "18:00"}]', 'parole');
SELECT pg_temp.emission('05', 'L''Enfer du Dimanche', '[{"weekday": 7, "start": "20:00", "end": "21:00"}]');
SELECT pg_temp.emission('06', 'À Bâtons Rompus', '[{"weekday": 2, "start": "19:00", "end": "20:00"}]', 'parole');
SELECT pg_temp.emission('07', 'La Méridienne', '[{"weekday": 5, "start": "12:00", "end": "13:00"}]', 'parole');
SELECT pg_temp.emission('08', 'Vieille émission', '[{"weekday": 5, "start": "16:00", "end": "17:00"}]');
SELECT pg_temp.emission('09', 'Spéciale', '[]', 'parole');
SELECT pg_temp.emission('10', 'Waky Waky',
  '[{"weekday": 2, "start": "07:00", "end": "09:00"}, {"weekday": 3, "start": "07:00", "end": "08:00"}]');
SELECT pg_temp.emission('11', 'Nuit Blanche', '[{"weekday": 6, "start": "23:00", "end": "02:00"}]');
SELECT pg_temp.emission('12', 'Pause Poésie', '[{"weekday": 5, "start": "14:00", "end": "15:00"}]', 'parole');
SELECT pg_temp.emission('13', 'Double Saut', '[{"weekday": 5, "start": "18:00", "end": "19:00"}]', 'parole');
SELECT pg_temp.emission('14', 'Le Projet SETI', '[{"weekday": 5, "start": "23:00", "end": "00:00"}]');
SELECT pg_temp.emission('15', 'Total Mix', '[{"weekday": 6, "start": "17:00", "end": "20:00"}]');
SELECT pg_temp.emission('16', 'Socalizer', '[{"weekday": 6, "start": "22:00", "end": "23:00"}]');
SELECT pg_temp.emission('17', '100% Live', '[{"weekday": 1, "start": "21:00", "end": "22:00"}]');
-- Station B, désactivée : une émission active en ce moment.
SELECT pg_temp.emission('21', 'Émission de B', '[{"weekday": 5, "start": "19:00", "end": "20:00"}]', 'musique',
  'ad000000-0000-4000-8000-0000000000a2');

CREATE FUNCTION pg_temp.episode(id_court text, emission text, diffuse text, duree integer DEFAULT 3600) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.radio_episodes (id, show_id, guid, title, aired_at, duration_s, audio_url, page_url)
  VALUES (('ad000000-0000-4000-8000-0000000002' || id_court)::uuid,
          ('ad000000-0000-4000-8000-0000000001' || emission)::uuid,
          'https://radio.test/podcast/' || id_court || '/', 'Épisode ' || id_court,
          (diffuse || '+00')::timestamptz, duree,
          'https://radio.test/' || id_court || '.mp3', 'https://radio.test/podcast/' || id_court || '/')
$$;

-- aired_at : l'heure de Paris étiquetée UTC (« Thu, 22 Oct 2026 20:00:01 +0000 » du flux = 22:00:01).
SELECT pg_temp.episode('01', '01', '2026-10-22 22:00:01', 7187);   -- Nation Groove, hier
SELECT pg_temp.episode('02', '01', '2026-10-15 22:00:01', 7187);   -- Nation Groove, il y a 8 jours
SELECT pg_temp.episode('03', '02', '2026-10-16 19:00:00');         -- Kawaï, il y a 7 jours
SELECT pg_temp.episode('04', '03', '2026-10-16 20:00:00');         -- Blockchain
SELECT pg_temp.episode('05', '04', '2026-10-22 17:00:00');         -- Mag Culturel, hier
SELECT pg_temp.episode('06', '04', '2026-10-22 17:05:00');         -- même créneau, envoyé deux fois
SELECT pg_temp.episode('07', '05', '2026-10-18 20:00:00');         -- L'Enfer du Dimanche
SELECT pg_temp.episode('08', '06', '2026-10-20 19:00:00');         -- À Bâtons Rompus
SELECT pg_temp.episode('09', '08', '2026-09-04 16:00:00');         -- Vieille émission : 49 jours
SELECT pg_temp.episode('10', '09', '2026-10-21 15:30:20', 5400);   -- Spéciale, sans créneau
SELECT pg_temp.episode('11', '10', '2026-10-20 07:00:00', 7200);   -- Waky Waky, mardi
SELECT pg_temp.episode('12', '11', '2026-10-17 23:00:00', 10800);  -- Nuit Blanche, samedi → dimanche
SELECT pg_temp.episode('13', '12', '2026-10-23 14:00:00');         -- Pause Poésie, aujourd'hui
SELECT pg_temp.episode('14', '13', '2026-10-16 18:00:00');         -- Double Saut
SELECT pg_temp.episode('15', '14', '2026-10-16 23:00:00');         -- Le Projet SETI
SELECT pg_temp.episode('16', '15', '2026-10-17 16:50:00', 10800);  -- Total Mix, 10 minutes avant
SELECT pg_temp.episode('17', '16', '2026-10-17 21:40:00');         -- Socalizer, 20 minutes avant
SELECT pg_temp.episode('18', '17', '2026-10-19 21:00:00');         -- 100% Live
SELECT pg_temp.episode('21', '21', '2026-10-16 19:00:00');         -- station B

-- last_episode_at : le plus récent épisode, tenu par le trigger --------------------------------------

SELECT pg_temp.verifie('last_episode_at : le plus récent des épisodes de l''émission',
  (SELECT string_agg(s.slug || '=' || coalesce(to_char(s.last_episode_at AT TIME ZONE 'UTC', 'MM-DD HH24:MI:SS'), '-'),
     ' ' ORDER BY s.slug)
   FROM public.radio_shows AS s WHERE s.slug IN ('emission-01', 'emission-04', 'emission-07')),
  'emission-01=10-22 22:00:01 emission-04=10-22 17:05:00 emission-07=-');

UPDATE public.radio_episodes SET aired_at = '2026-10-29 22:00:00+00' WHERE guid = 'https://radio.test/podcast/02/';
SELECT pg_temp.verifie('last_episode_at : suit un aired_at modifié',
  (SELECT to_char(last_episode_at AT TIME ZONE 'UTC', 'MM-DD HH24:MI') FROM public.radio_shows WHERE slug = 'emission-01'),
  '10-29 22:00');
UPDATE public.radio_episodes SET aired_at = '2026-10-15 22:00:01+00' WHERE guid = 'https://radio.test/podcast/02/';
DELETE FROM public.radio_episodes WHERE guid = 'https://radio.test/podcast/01/';
SELECT pg_temp.verifie('last_episode_at : recalculé après la suppression du plus récent',
  (SELECT to_char(last_episode_at AT TIME ZONE 'UTC', 'MM-DD HH24:MI') FROM public.radio_shows WHERE slug = 'emission-01'),
  '10-15 22:00');
SELECT pg_temp.episode('01', '01', '2026-10-22 22:00:01', 7187);
SELECT pg_temp.verifie('last_episode_at : et après un nouvel épisode',
  (SELECT to_char(last_episode_at AT TIME ZONE 'UTC', 'MM-DD HH24:MI') FROM public.radio_shows WHERE slug = 'emission-01'),
  '10-22 22:00');

-- Créneaux bien formés ------------------------------------------------------------------------------

SELECT pg_temp.verifie('créneaux : formes acceptées (24:00, fin le lendemain, vide, plusieurs)',
  pg_temp.creneaux_acceptes('[{"weekday": 4, "start": "22:00", "end": "24:00"}]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 7, "start": "23:30", "end": "01:00"}]') || ' '
  || pg_temp.creneaux_acceptes('[]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 1, "start": "07:00", "end": "08:00"}, {"weekday": 2, "start": "07:00", "end": "08:00"}]'),
  'oui oui oui oui');
SELECT pg_temp.verifie('créneaux : formes refusées',
  pg_temp.creneaux_acceptes('{"weekday": 4}') || ' '
  || pg_temp.creneaux_acceptes('[1]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 0, "start": "22:00", "end": "23:00"}]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 8, "start": "22:00", "end": "23:00"}]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": "4", "start": "22:00", "end": "23:00"}]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 4.5, "start": "22:00", "end": "23:00"}]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 4, "start": "25:00", "end": "23:00"}]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 4, "start": "22h00", "end": "23:00"}]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 4, "start": "22:00", "end": "24:01"}]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 4, "start": "22:00"}]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 4, "start": "22:00", "end": "22:00"}]') || ' '
  || pg_temp.creneaux_acceptes('[{"weekday": 4, "start": 22, "end": "23:00"}]'),
  'non non non non non non non non non non non non');
DELETE FROM public.radio_shows WHERE slug LIKE 'essai-%';

-- RLS : ce que lit la clé publique -----------------------------------------------------------------

SELECT pg_temp.session();
SELECT pg_temp.verifie('anon : seule la station activée',
  (SELECT string_agg(name, ' ') FROM public.radio_stations), 'Radio A');
SELECT pg_temp.verifie('anon : les émissions de la station activée seulement',
  (SELECT count(*)::text || ' ' || count(*) FILTER (WHERE station_id = 'ad000000-0000-4000-8000-0000000000a2')::text
   FROM public.radio_shows), '17 0');
SELECT pg_temp.verifie('anon : les épisodes de la station activée seulement',
  (SELECT count(*)::text || ' ' || count(*) FILTER (WHERE guid = 'https://radio.test/podcast/21/')::text
   FROM public.radio_episodes), '18 0');
SELECT pg_temp.verifie('anon : aucune écriture (insertion, modification, suppression, vidage)',
  pg_temp.ecrit($q$INSERT INTO public.radio_stations (organizer_id, name, frequency, stream_url, status_url, site_url)
                   VALUES ('ad000000-0000-4000-8000-0000000000b3', 'X', '1', 'https://x.test', 'https://x.test', 'https://x.test')$q$)
  || ' ' || pg_temp.ecrit($q$UPDATE public.radio_stations SET enabled = true$q$)
  || ' ' || pg_temp.ecrit($q$UPDATE public.radio_shows SET family = 'parole'$q$)
  || ' ' || pg_temp.ecrit($q$DELETE FROM public.radio_episodes$q$)
  || ' ' || pg_temp.ecrit($q$TRUNCATE public.radio_episodes$q$),
  'refusé refusé refusé refusé refusé');
SELECT pg_temp.verifie('anon : le suivi de l''import (radio_show_sync) ne se lit ni ne s''écrit',
  pg_temp.ecrit($q$SELECT count(*) FROM public.radio_show_sync$q$) || ' '
  || pg_temp.ecrit($q$INSERT INTO public.radio_show_sync (show_id) VALUES ('ad000000-0000-4000-8000-000000000101')$q$),
  'refusé refusé');
SELECT pg_temp.verifie('anon : la station désactivée ne rend rien',
  pg_temp.journee('ad000000-0000-4000-8000-0000000000a2', '2026-10-23', '2026-10-23 19:12:04') || '|'
  || pg_temp.emissions('ad000000-0000-4000-8000-0000000000a2', '2026-10-23 19:12:04') || '|'
  || pg_temp.grille('ad000000-0000-4000-8000-0000000000a2', '2026-10-23 19:12:04'),
  '||');
RESET ROLE;

SELECT pg_temp.session('ad000000-0000-4000-8000-000000000001');
SELECT pg_temp.verifie('compte : comme anon, et pas d''écriture',
  (SELECT string_agg(name, ' ') FROM public.radio_stations)
  || ' ' || pg_temp.ecrit($q$UPDATE public.radio_shows SET organizer_id = 'ad000000-0000-4000-8000-0000000000b3'$q$),
  'Radio A refusé');
RESET ROLE;

-- Coût de la RLS : la sous-requête des stations activées tourne une fois par requête, pas par ligne.
CREATE FUNCTION pg_temp.boucles_max(requete text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  plan jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) ' || requete INTO plan;
  RETURN coalesce((SELECT max(v::text::numeric)::text FROM jsonb_path_query(plan,
    'strict $.** ? (@."Parent Relationship" == "SubPlan" || @."Parent Relationship" == "InitPlan")."Actual Loops"') v), '0');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.boucles_max(text) TO anon;

SELECT pg_temp.session();
SELECT pg_temp.verifie('anon : chaque sous-plan des politiques tourne une fois au plus',
  pg_temp.boucles_max('SELECT id FROM public.radio_episodes') || ' '
  || pg_temp.boucles_max('SELECT id FROM public.radio_shows'),
  '1 1');
RESET ROLE;

-- app_radio_day : aujourd'hui ----------------------------------------------------------------------
-- Vendredi 23 octobre à 19:12:04. Passées : Pause Poésie (épisode) ; Double Saut (18:00, pas encore
-- d'épisode) est retiré ; La Méridienne (12:00) et Vieille émission (16:00) ne sont pas actives.
-- En cours : Kawaï Campus Club. À venir : Blockchain, Le Projet SETI (jusqu'à minuit).

SELECT pg_temp.session();
SELECT pg_temp.verifie('aujourd''hui : passées avec un épisode, en cours, à venir',
  pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', '2026-10-23', '2026-10-23 19:12:04'),
  '23 14:00-15:00 Pause Poésie past ▶ | 23 19:00-20:00 Kawaï Campus Club live | 23 20:00-21:00 Blockchain next | 23 23:00-00:00 Le Projet SETI next');

SELECT pg_temp.verifie('aujourd''hui à 20:00 pile : Kawaï fini (sans épisode, retiré), Blockchain en cours',
  pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', '2026-10-23', '2026-10-23 20:00:00'),
  '23 14:00-15:00 Pause Poésie past ▶ | 23 20:00-21:00 Blockchain live | 23 23:00-00:00 Le Projet SETI next');

SELECT pg_temp.verifie('aujourd''hui, le matin : la liste n''est pas vide, tout est à venir',
  pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', '2026-10-23', '2026-10-23 08:00:00'),
  '23 14:00-15:00 Pause Poésie next ▶ | 23 18:00-19:00 Double Saut next | 23 19:00-20:00 Kawaï Campus Club next | 23 20:00-21:00 Blockchain next | 23 23:00-00:00 Le Projet SETI next');

-- Les colonnes de la ligne en cours, telles que l'app les lit.
SELECT pg_temp.verifie('aujourd''hui : colonnes d''une ligne (dates à l''heure de Paris étiquetée UTC)',
  (SELECT d.slug || ' ' || d.name || ' ' || d.style || ' ' || d.family || ' '
     || (d.starts_at AT TIME ZONE 'UTC')::text || ' ' || (d.ends_at AT TIME ZONE 'UTC')::text || ' '
     || coalesce(d.episode_id::text, '-') || ' ' || coalesce(d.audio_url, '-') || ' ' || coalesce(d.duration_s::text, '-')
     || ' ' || d.state
   FROM public.app_radio_day('ad000000-0000-4000-8000-0000000000a1', '2026-10-23', '2026-10-23 19:12:04') AS d
   WHERE d.state = 'live'),
  'emission-02 Kawaï Campus Club Style de Kawaï Campus Club parole 2026-10-23 19:00:00 2026-10-23 20:00:00 - - - live');
SELECT pg_temp.verifie('aujourd''hui : l''épisode d''une ligne passée',
  (SELECT d.episode_id::text || ' ' || d.audio_url || ' ' || d.duration_s
   FROM public.app_radio_day('ad000000-0000-4000-8000-0000000000a1', '2026-10-23', '2026-10-23 19:12:04') AS d
   WHERE d.state = 'past'),
  'ad000000-0000-4000-8000-000000000213 https://radio.test/13.mp3 3600');

-- app_radio_day : les jours passés --------------------------------------------------------------------

SELECT pg_temp.verifie('hier : les émissions qui ont un épisode, rattaché à son créneau ; un envoi en double ne compte qu''une fois',
  pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', '2026-10-22', '2026-10-23 19:12:04'),
  '22 17:00-18:00 Le Mag Culturel past ▶ | 22 22:00-00:00 Nation Groove past ▶');
SELECT pg_temp.verifie('hier : le créneau prend son premier épisode (17:00, pas 17:05)',
  (SELECT d.episode_id::text FROM public.app_radio_day('ad000000-0000-4000-8000-0000000000a1', '2026-10-22', '2026-10-23 19:12:04') AS d
   WHERE d.slug = 'emission-04'),
  'ad000000-0000-4000-8000-000000000205');

SELECT pg_temp.verifie('mercredi : un épisode hors créneau garde son heure et sa durée',
  pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', '2026-10-21', '2026-10-23 19:12:04'),
  '21 15:30-17:00 Spéciale past ▶');

SELECT pg_temp.verifie('mardi : plusieurs créneaux dans la semaine, celui du jour',
  pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', '2026-10-20', '2026-10-23 19:12:04'),
  '20 07:00-09:00 Waky Waky past ▶ | 20 19:00-20:00 À Bâtons Rompus past ▶');

SELECT pg_temp.verifie('samedi (aujourd''hui − 6) : 10 minutes avant, rattaché ; 20 minutes avant, à son heure ; à cheval sur minuit',
  pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', '2026-10-17', '2026-10-23 19:12:04'),
  '17 17:00-20:00 Total Mix past ▶ | 17 21:40-22:40 Socalizer past ▶ | 17 23:00-02:00 Nuit Blanche past ▶');

SELECT pg_temp.verifie('au-delà de 7 jours, et demain : rien',
  pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', '2026-10-16', '2026-10-23 19:12:04') || '|'
  || pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', '2026-10-24', '2026-10-23 19:12:04') || '|'
  || pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', NULL, '2026-10-23 19:12:04'),
  '||');

SELECT pg_temp.verifie('la nuit de samedi à dimanche, à 01:00 : l''émission commencée la veille est en cours',
  pg_temp.journee('ad000000-0000-4000-8000-0000000000a1', '2026-10-24', '2026-10-25 01:00:00'),
  '24 23:00-02:00 Nuit Blanche live');

-- Sans p_at : maintenant, à l'heure de Paris (aujourd'hui rend quelque chose ou rien, sans erreur).
SELECT pg_temp.verifie('sans p_at : aujourd''hui se lit sans erreur, demain ne rend rien',
  (SELECT (count(*) >= 0)::text FROM public.app_radio_day('ad000000-0000-4000-8000-0000000000a1',
     (now() AT TIME ZONE 'Europe/Paris')::date)) || ' '
  || (SELECT count(*)::text FROM public.app_radio_day('ad000000-0000-4000-8000-0000000000a1',
     (now() AT TIME ZONE 'Europe/Paris')::date + 1)),
  'true 0');

-- app_radio_shows ------------------------------------------------------------------------------------

SELECT pg_temp.verifie('émissions : les actives de A à Z, sans articles ni accents ; chiffres sous #',
  pg_temp.emissions('ad000000-0000-4000-8000-0000000000a1', '2026-10-23 19:12:04'),
  '# 100% Live | A À Bâtons Rompus | B Blockchain | D Double Saut | E L''Enfer du Dimanche | K Kawaï Campus Club | '
  || 'M Le Mag Culturel | N Nation Groove | N Nuit Blanche | P Pause Poésie | P Le Projet SETI | S Socalizer | '
  || 'S Spéciale | T Total Mix | W Waky Waky');

SELECT pg_temp.verifie('émissions : active jusqu''à 45 jours après son dernier épisode',
  (SELECT string_agg(s.name, ' ') FROM public.app_radio_shows('ad000000-0000-4000-8000-0000000000a1', '2026-10-19 16:00:00') AS s
   WHERE s.name = 'Vieille émission') || ' / '
  || coalesce((SELECT string_agg(s.name, ' ') FROM public.app_radio_shows('ad000000-0000-4000-8000-0000000000a1', '2026-10-19 16:00:01') AS s
   WHERE s.name = 'Vieille émission'), 'plus active'),
  'Vieille émission / plus active');

SELECT pg_temp.verifie('émissions : colonnes d''une ligne',
  (SELECT s.slug || ' ' || s.family || ' ' || s.slots::text || ' ' || (s.last_episode_at AT TIME ZONE 'UTC')::text
     || ' ' || coalesce(s.organizer_id::text, '-') || ' ' || coalesce(s.description, '-') || ' ' || s.page_url
   FROM public.app_radio_shows('ad000000-0000-4000-8000-0000000000a1', '2026-10-23 19:12:04') AS s
   WHERE s.name = 'Nation Groove'),
  'emission-01 musique [{"end": "24:00", "start": "22:00", "weekday": 4}] 2026-10-22 22:00:01 - - https://radio.test/01/');
RESET ROLE;

-- radio_live_grid : la grille du direct ------------------------------------------------------------

SELECT pg_temp.session();
SELECT pg_temp.verifie('direct à 19:12 : Kawaï en cours, Blockchain ensuite ; à l''antenne : Kawaï, et Double Saut (fini depuis 12 minutes)',
  pg_temp.grille('ad000000-0000-4000-8000-0000000000a1', '2026-10-23 19:12:04'),
  'live Kawaï Campus Club 23 19:00 | next Blockchain 23 20:00 | on_air Double Saut 23 18:00 | on_air Kawaï Campus Club 23 19:00');

SELECT pg_temp.verifie('direct à 12:05 : pas d''émission active, mais La Méridienne (inactive) est prévue',
  pg_temp.grille('ad000000-0000-4000-8000-0000000000a1', '2026-10-23 12:05:00'),
  'next Pause Poésie 23 14:00 | on_air La Méridienne 23 12:00');

SELECT pg_temp.verifie('direct à 23:30 : Le Projet SETI, ensuite le lendemain',
  pg_temp.grille('ad000000-0000-4000-8000-0000000000a1', '2026-10-23 23:30:00'),
  'live Le Projet SETI 23 23:00 | next Total Mix 24 17:00 | on_air Le Projet SETI 23 23:00');

SELECT pg_temp.verifie('direct dimanche à 01:00 : l''émission de samedi soir, commencée la veille',
  pg_temp.grille('ad000000-0000-4000-8000-0000000000a1', '2026-10-25 01:00:00'),
  'live Nuit Blanche 24 23:00 | next L''Enfer du Dimanche 25 20:00 | on_air Nuit Blanche 24 23:00');

SELECT pg_temp.verifie('direct : colonnes (dates à l''heure de Paris étiquetée UTC)',
  (SELECT g.show_id::text || ' ' || g.style || ' ' || g.family || ' ' || (g.starts_at AT TIME ZONE 'UTC')::text
     || ' ' || (g.ends_at AT TIME ZONE 'UTC')::text
   FROM public.radio_live_grid('ad000000-0000-4000-8000-0000000000a1', '2026-10-23 19:12:04') AS g WHERE g.kind = 'live'),
  'ad000000-0000-4000-8000-000000000102 Style de Kawaï Campus Club parole 2026-10-23 19:00:00 2026-10-23 20:00:00');
RESET ROLE;

-- Les visuels gardés (20261023235000_add_radio_show_images.sql) ------------------------------------

UPDATE public.radio_shows SET image_url = 'https://stockage.test/radio-shows/kawai.webp' WHERE slug = 'emission-02';
SELECT pg_temp.session();
SELECT pg_temp.verifie('visuels : app_radio_shows, app_radio_day et radio_live_grid rendent image_url, null sans visuel',
  (SELECT s.image_url FROM public.app_radio_shows('ad000000-0000-4000-8000-0000000000a1', '2026-10-23 19:12:04') AS s
   WHERE s.name = 'Kawaï Campus Club')
  || ' ' || coalesce((SELECT s.image_url FROM public.app_radio_shows('ad000000-0000-4000-8000-0000000000a1', '2026-10-23 19:12:04') AS s
   WHERE s.name = 'Nation Groove'), 'null')
  || ' ' || (SELECT d.image_url FROM public.app_radio_day('ad000000-0000-4000-8000-0000000000a1', '2026-10-23', '2026-10-23 19:12:04') AS d
   WHERE d.name = 'Kawaï Campus Club')
  || ' ' || (SELECT g.image_url FROM public.radio_live_grid('ad000000-0000-4000-8000-0000000000a1', '2026-10-23 19:12:04') AS g
   WHERE g.kind = 'live')
  || ' ' || coalesce((SELECT g.image_url FROM public.radio_live_grid('ad000000-0000-4000-8000-0000000000a1', '2026-10-23 19:12:04') AS g
   WHERE g.kind = 'next'), 'null'),
  'https://stockage.test/radio-shows/kawai.webp null https://stockage.test/radio-shows/kawai.webp '
  || 'https://stockage.test/radio-shows/kawai.webp null');
RESET ROLE;
DO $$
BEGIN
  UPDATE public.radio_shows SET image_url = 'http://stockage.test/radio-shows/kawai.webp' WHERE slug = 'emission-02';
  RAISE EXCEPTION 'ÉCHEC visuels : une adresse http acceptée';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'ok  visuels : https seulement';
END $$;
UPDATE public.radio_shows SET image_url = NULL WHERE slug = 'emission-02';

-- Droits sur les fonctions ---------------------------------------------------------------------------

SELECT pg_temp.verifie('fonctions de l''app exécutables par anon et authenticated',
  (SELECT string_agg(f || '=' || has_function_privilege('anon', f, 'execute')::text || '/'
     || has_function_privilege('authenticated', f, 'execute')::text, ' ' ORDER BY f)
   FROM unnest(ARRAY['public.app_radio_day(uuid, date, timestamp)', 'public.app_radio_shows(uuid, timestamp)',
     'public.radio_live_grid(uuid, timestamp)']) AS f),
  'public.app_radio_day(uuid, date, timestamp)=true/true public.app_radio_shows(uuid, timestamp)=true/true public.radio_live_grid(uuid, timestamp)=true/true');
SELECT pg_temp.verifie('trigger de last_episode_at : pas appelable par anon',
  has_function_privilege('anon', 'public.radio_episodes_refresh_last_episode()', 'execute')::text, 'false');

-- Supprimer l'organisateur d'une station est refusé ; celui d'une émission la détache.
UPDATE public.radio_shows SET organizer_id = 'ad000000-0000-4000-8000-0000000000b3' WHERE slug = 'emission-01';
DELETE FROM public.organizers WHERE id = 'ad000000-0000-4000-8000-0000000000b3';
SELECT pg_temp.verifie('collectif supprimé : l''émission reste, sans collectif',
  (SELECT coalesce(organizer_id::text, 'aucun') FROM public.radio_shows WHERE slug = 'emission-01'), 'aucun');
DO $$
BEGIN
  BEGIN
    DELETE FROM public.organizers WHERE id = 'ad000000-0000-4000-8000-0000000000b1';
    RAISE EXCEPTION 'ÉCHEC l''organisateur d''une station a pu être supprimé';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok  organisateur d''une station : suppression refusée';
  END;
END $$;

-- Import horaire par pg_cron (20261023143000_schedule_radio_import.sql) ------------------------------
-- La requête de pg_net reste dans sa file (annulée avec la transaction) : rien ne part.

SELECT pg_temp.verifie('pg_cron : la tâche radio-import chaque heure à :07',
  (SELECT schedule || ' ' || command FROM cron.job WHERE jobname = 'radio-import'),
  '7 * * * * SELECT public.radio_request_import()');
SELECT pg_temp.verifie('radio_request_import : réservée au service',
  has_function_privilege('anon', 'public.radio_request_import()', 'execute')::text || ' '
  || has_function_privilege('authenticated', 'public.radio_request_import()', 'execute')::text,
  'false false');

CREATE FUNCTION pg_temp.file_radio() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(q.method || ' ' || q.url || ' ' || (q.headers ->> 'Authorization'), ' | '), '')
  FROM net.http_request_queue AS q
  WHERE q.url LIKE '%/api/cron/radio-import'
$$;

SELECT pg_temp.verifie('radio_request_import sans le secret dans Vault : rien n''est envoyé',
  coalesce(public.radio_request_import()::text, 'null') || ' | ' || pg_temp.file_radio(), 'null | ');
SELECT vault.create_secret('s3cret-du-cron', 'radio_import_cron_secret');
SELECT pg_temp.verifie('radio_request_import avec le secret : un GET de la route, avec le secret',
  (public.radio_request_import() IS NOT NULL)::text || ' | ' || pg_temp.file_radio(),
  'true | GET https://www.outlive.fr/api/cron/radio-import Bearer s3cret-du-cron');

ROLLBACK;
