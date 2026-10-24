-- Tests de inactive_guest_sessions() et purge_inactive_guest_sessions()
-- (migration 20261024180000_purge_inactive_guest_sessions.sql).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events) THEN
    RAISE EXCEPTION 'Base non vide : ces tests se lancent sur une base jetable (scripts/db-test.sh), jamais en prod.';
  END IF;
END $$;

-- Un fuseau loin d'UTC (UTC+14), pour toute la séance : auth.sessions.refreshed_at, heure UTC sans
-- fuseau, doit être lue comme telle (cas 22).
SET LOCAL TimeZone = 'Pacific/Kiritimati';

CREATE FUNCTION pg_temp.verifie(nom text, obtenu text, attendu text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF obtenu IS DISTINCT FROM attendu THEN
    RAISE EXCEPTION 'ÉCHEC % : obtenu « % », attendu « % »', nom, obtenu, attendu;
  END IF;
  RAISE NOTICE 'ok  %', nom;
END $$;

-- L'invité numéro [n] (01 à 99).
CREATE FUNCTION pg_temp.invite(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('9a000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

-- Un invité dont toutes les traces de session datent d'il y a [il_y_a] : création, connexion, mise à
-- jour, et, avec [avec_session], une session et son jeton de rafraîchissement.
CREATE FUNCTION pg_temp.cree_invite(n integer, il_y_a interval, avec_session boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  quand timestamptz := now() - il_y_a;
BEGIN
  INSERT INTO auth.users (id, is_anonymous, created_at, last_sign_in_at, updated_at)
  VALUES (pg_temp.invite(n), true, quand, quand, quand);
  IF avec_session THEN
    INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
    VALUES (pg_temp.invite(n), pg_temp.invite(n), quand, quand);
    INSERT INTO auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at)
    VALUES ('jeton-' || n, pg_temp.invite(n)::text, pg_temp.invite(n), false, quand, quand);
  END IF;
END $$;

-- Les invités 01-99 encore en base : « 02,03,… ».
CREATE FUNCTION pg_temp.restants() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(u.id::text, 2), ',' ORDER BY u.id), '-')
  FROM auth.users AS u
  WHERE u.id::text LIKE '9a000000-%'
$$;

-- Ce que rend inactive_guest_sessions() pour les invités 01-99, dans l'ordre de la purge.
CREATE FUNCTION pg_temp.inactifs() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(i.user_id::text, 2), ',' ORDER BY i.last_activity, i.user_id), '-')
  FROM public.inactive_guest_sessions() AS i
  WHERE i.user_id::text LIKE '9a000000-%'
$$;

-- Un appel avec un autre rôle : « appelée », ou le code de l'erreur.
CREATE FUNCTION pg_temp.appelle_en(role text, fonction text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', role);
  EXECUTE format('SELECT count(*) FROM public.%I()', fonction);
  RESET ROLE;
  RETURN 'appelée';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'erreur ' || SQLSTATE;
END $$;

-- La purge avec le rôle du cron (service_role) : ce qu'elle rend.
CREATE FUNCTION pg_temp.purge_en_service_role() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  rendu jsonb;
BEGIN
  SET LOCAL ROLE service_role;
  rendu := public.purge_inactive_guest_sessions();
  RESET ROLE;
  RETURN rendu::text;
END $$;

-- Jeu d'essai --------------------------------------------------------------------------------------
-- Un compte (C, jamais touché), un événement, un artiste, une catégorie, un objet de feedback.

INSERT INTO auth.users (id, email, is_anonymous, created_at, last_sign_in_at, updated_at) VALUES
  ('9c000000-0000-4000-8000-000000000001', 'c@test.local', false,
   now() - interval '3 years', now() - interval '3 years', now() - interval '3 years');

INSERT INTO public.events (id, title, date, category, status) VALUES
  ('9e000000-0000-4000-8000-000000000001', 'Concert', now() + interval '3 days', 'Concert', 'approved');
INSERT INTO public.artists (id, name, slug) VALUES
  ('9d000000-0000-4000-8000-000000000001', 'Artiste suivi', 'artiste-suivi');
INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('9f000000-0000-4000-8000-000000000001', 'Catégorie essai', true, 1);
INSERT INTO public.feedback_objects (id, name) VALUES
  ('9f000000-0000-4000-8000-0000000000f1', 'Objet essai');

-- 01 : tout date de 14 mois. Puis chaque invité de 02 à 14 a les mêmes traces anciennes et une seule
-- récente (il y a 2 mois).
SELECT pg_temp.cree_invite(n, interval '14 months') FROM generate_series(1, 22) AS n
WHERE n NOT IN (17, 18, 19);

UPDATE auth.sessions SET refreshed_at = (now() - interval '2 months') AT TIME ZONE 'UTC'
WHERE user_id = pg_temp.invite(2);
UPDATE auth.sessions SET updated_at = now() - interval '2 months' WHERE user_id = pg_temp.invite(3);
UPDATE auth.users SET updated_at = now() - interval '2 months' WHERE id = pg_temp.invite(4);
UPDATE auth.users SET last_sign_in_at = now() - interval '2 months' WHERE id = pg_temp.invite(5);
INSERT INTO auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at)
VALUES ('jeton-6b', pg_temp.invite(6)::text, pg_temp.invite(6), false,
        now() - interval '2 months', now() - interval '2 months');
INSERT INTO public.user_push_tokens (user_id, token, platform, created_at, updated_at)
VALUES (pg_temp.invite(7), 'push-7', 'ios', now() - interval '14 months', now() - interval '2 months');
INSERT INTO public.event_likes (event_id, user_id, created_at)
VALUES ('9e000000-0000-4000-8000-000000000001', pg_temp.invite(8), now() - interval '2 months');
INSERT INTO public.user_hidden_events (event_id, user_id, created_at)
VALUES ('9e000000-0000-4000-8000-000000000001', pg_temp.invite(9), now() - interval '2 months');
INSERT INTO public.user_follows (user_id, target_type, target_id, created_at)
VALUES (pg_temp.invite(10), 'artist', '9d000000-0000-4000-8000-000000000001', now() - interval '2 months');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id, created_at)
VALUES (pg_temp.invite(11), '9c000000-0000-4000-8000-000000000001', now() - interval '2 months');
INSERT INTO public.content_reports (reporter_user_id, target_event_id, reason_code, created_at)
VALUES (pg_temp.invite(12), '9e000000-0000-4000-8000-000000000001', 'spam', now() - interval '2 months');
INSERT INTO public.feedbacks (user_id, feedback_object_id, description, created_at)
VALUES (pg_temp.invite(13), '9f000000-0000-4000-8000-0000000000f1', 'Bravo', now() - interval '2 months');
INSERT INTO public.user_requests (requested_by, request_type, status, created_at, requested_at)
VALUES (pg_temp.invite(14), 'event_creation', 'pending', now() - interval '2 months', now() - interval '2 months');

-- 15 et 16 : seulement ce que le serveur écrit sans l'invité, récent.
INSERT INTO public.user_notification_preferences (user_id, created_at, updated_at)
VALUES (pg_temp.invite(15), now(), now());
INSERT INTO public.user_notification_categories (user_id, category_id, created_at)
VALUES (pg_temp.invite(15), '9f000000-0000-4000-8000-000000000001', now());
INSERT INTO public.notification_logs (user_id, title, body, sent_at, created_at)
VALUES (pg_temp.invite(16), 'Ce soir', 'Trois concerts', now(), now());

-- 17 : sans session (déconnectée, ou jamais ouverte). 18 et 19 : de part et d'autre des 13 mois.
SELECT pg_temp.cree_invite(17, interval '14 months', avec_session => false);
SELECT pg_temp.cree_invite(18, interval '13 months' - interval '1 day');
SELECT pg_temp.cree_invite(19, interval '13 months' + interval '1 day');

-- 20 : ancien, avec une ligne dans chaque table (tout ancien), auteur d'un événement, bloqué par le compte.
INSERT INTO public.events (id, title, date, category, status, created_by) VALUES
  ('9e000000-0000-4000-8000-000000000020', 'Proposé par 20', now() + interval '4 days', 'Concert', 'approved',
   pg_temp.invite(20));
INSERT INTO public.event_likes (event_id, user_id, created_at)
VALUES ('9e000000-0000-4000-8000-000000000001', pg_temp.invite(20), now() - interval '14 months');
INSERT INTO public.user_hidden_events (event_id, user_id, created_at)
VALUES ('9e000000-0000-4000-8000-000000000020', pg_temp.invite(20), now() - interval '14 months');
INSERT INTO public.user_follows (user_id, target_type, target_id, created_at)
VALUES (pg_temp.invite(20), 'artist', '9d000000-0000-4000-8000-000000000001', now() - interval '14 months');
INSERT INTO public.user_push_tokens (user_id, token, platform, created_at, updated_at)
VALUES (pg_temp.invite(20), 'push-20', 'android', now() - interval '14 months', now() - interval '14 months');
INSERT INTO public.user_notification_preferences (user_id, created_at, updated_at)
VALUES (pg_temp.invite(20), now() - interval '14 months', now() - interval '14 months');
INSERT INTO public.user_notification_categories (user_id, category_id, created_at)
VALUES (pg_temp.invite(20), '9f000000-0000-4000-8000-000000000001', now() - interval '14 months');
INSERT INTO public.notification_logs (user_id, title, body, sent_at, created_at)
VALUES (pg_temp.invite(20), 'Ce soir', 'Un concert', now() - interval '14 months', now() - interval '14 months');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id, created_at) VALUES
  (pg_temp.invite(20), '9c000000-0000-4000-8000-000000000001', now() - interval '14 months'),
  ('9c000000-0000-4000-8000-000000000001', pg_temp.invite(20), now() - interval '14 months');
INSERT INTO public.content_reports (reporter_user_id, target_event_id, reason_code, created_at)
VALUES (pg_temp.invite(20), '9e000000-0000-4000-8000-000000000001', 'spam', now() - interval '14 months');
INSERT INTO public.feedbacks (user_id, feedback_object_id, description, created_at)
VALUES (pg_temp.invite(20), '9f000000-0000-4000-8000-0000000000f1', 'Merci', now() - interval '14 months');
INSERT INTO public.user_requests (requested_by, request_type, status, created_at, requested_at)
VALUES (pg_temp.invite(20), 'event_creation', 'pending', now() - interval '14 months', now() - interval '14 months');

-- 21 : ancien, mais une clé étrangère (sans cascade) empêche sa suppression.
CREATE TABLE public.essai_purge_bloque (user_id uuid NOT NULL REFERENCES auth.users (id));
INSERT INTO public.essai_purge_bloque (user_id) VALUES (pg_temp.invite(21));

-- 22 : rafraîchie juste après la limite des 13 mois. refreshed_at est l'heure UTC sans fuseau : lue
-- dans le fuseau de la séance (UTC+14), elle reculerait de 14 heures et passerait la limite.
UPDATE auth.sessions
SET refreshed_at = (now() - interval '13 months' + interval '3 hours') AT TIME ZONE 'UTC'
WHERE user_id = pg_temp.invite(22);

-- La règle ---------------------------------------------------------------------------------------

SELECT pg_temp.verifie('sans trace depuis 13 mois : la plus ancienne d''abord',
  pg_temp.inactifs(), '01,15,16,17,20,21,19');
SELECT pg_temp.verifie('la dernière trace rendue est la plus récente',
  (SELECT to_char(i.last_activity AT TIME ZONE 'UTC', 'YYYY-MM-DD')
   FROM public.inactive_guest_sessions() AS i WHERE i.user_id = pg_temp.invite(19)),
  to_char((now() - interval '13 months' - interval '1 day') AT TIME ZONE 'UTC', 'YYYY-MM-DD'));

-- La purge ---------------------------------------------------------------------------------------

SELECT pg_temp.verifie('anon ne lit pas la règle', pg_temp.appelle_en('anon', 'inactive_guest_sessions'),
  'erreur 42501');
SELECT pg_temp.verifie('authenticated ne lit pas la règle',
  pg_temp.appelle_en('authenticated', 'inactive_guest_sessions'), 'erreur 42501');
SELECT pg_temp.verifie('anon ne purge pas', pg_temp.appelle_en('anon', 'purge_inactive_guest_sessions'),
  'erreur 42501');
SELECT pg_temp.verifie('authenticated (un invité) ne purge pas',
  pg_temp.appelle_en('authenticated', 'purge_inactive_guest_sessions'), 'erreur 42501');
SELECT pg_temp.verifie('service_role lit la règle',
  pg_temp.appelle_en('service_role', 'inactive_guest_sessions'), 'appelée');
SELECT pg_temp.verifie('rien n''est parti avant la purge', pg_temp.restants(),
  '01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16,17,18,19,20,21,22');

SELECT pg_temp.verifie('la purge, par service_role : 6 supprimées, 1 refusée',
  pg_temp.purge_en_service_role(), '{"failed": 1, "deleted": 6, "has_more": false}');

SELECT pg_temp.verifie('restent les sessions qui servent, la refusée et le compte',
  pg_temp.restants(), '02,03,04,05,06,07,08,09,10,11,12,13,14,18,21,22');
SELECT pg_temp.verifie('le compte inactif reste',
  (SELECT count(*)::text FROM auth.users WHERE id = '9c000000-0000-4000-8000-000000000001'), '1');

SELECT pg_temp.verifie('20 : sa session et ses jetons partis',
  (SELECT count(*) FROM auth.sessions WHERE user_id = pg_temp.invite(20))::text || ' '
    || (SELECT count(*) FROM auth.refresh_tokens WHERE user_id = pg_temp.invite(20)::text)::text, '0 0');
SELECT pg_temp.verifie('20 : tout ce qui lui était rattaché parti',
  concat_ws(' ',
    (SELECT count(*) FROM public.event_likes WHERE user_id = pg_temp.invite(20)),
    (SELECT count(*) FROM public.user_hidden_events WHERE user_id = pg_temp.invite(20)),
    (SELECT count(*) FROM public.user_follows WHERE user_id = pg_temp.invite(20)),
    (SELECT count(*) FROM public.user_push_tokens WHERE user_id = pg_temp.invite(20)),
    (SELECT count(*) FROM public.user_notification_preferences WHERE user_id = pg_temp.invite(20)),
    (SELECT count(*) FROM public.user_notification_categories WHERE user_id = pg_temp.invite(20)),
    (SELECT count(*) FROM public.notification_logs WHERE user_id = pg_temp.invite(20)),
    (SELECT count(*) FROM public.blocked_users
     WHERE pg_temp.invite(20) IN (blocker_user_id, blocked_user_id)),
    (SELECT count(*) FROM public.content_reports WHERE reporter_user_id = pg_temp.invite(20)),
    (SELECT count(*) FROM public.feedbacks WHERE user_id = pg_temp.invite(20)),
    (SELECT count(*) FROM public.user_requests WHERE requested_by = pg_temp.invite(20))),
  '0 0 0 0 0 0 0 0 0 0 0');
SELECT pg_temp.verifie('20 : son événement reste, sans auteur',
  (SELECT coalesce(created_by::text, 'sans auteur') FROM public.events
   WHERE id = '9e000000-0000-4000-8000-000000000020'), 'sans auteur');
SELECT pg_temp.verifie('les lignes des sessions gardées restent',
  concat_ws(' ',
    (SELECT count(*) FROM public.user_push_tokens WHERE user_id = pg_temp.invite(7)),
    (SELECT count(*) FROM public.event_likes WHERE user_id = pg_temp.invite(8)),
    (SELECT count(*) FROM public.blocked_users WHERE blocker_user_id = pg_temp.invite(11)),
    (SELECT count(*) FROM public.user_requests WHERE requested_by = pg_temp.invite(14))),
  '1 1 1 1');

SELECT pg_temp.verifie('rejouée : rien de plus, la refusée l''est encore',
  pg_temp.purge_en_service_role(), '{"failed": 1, "deleted": 0, "has_more": false}');

-- Par lots de 500 : 501 invités anciens de plus, et 21 qui ne bloque plus.
DROP TABLE public.essai_purge_bloque;
INSERT INTO auth.users (id, is_anonymous, created_at, last_sign_in_at, updated_at)
SELECT ('9b000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, true,
       now() - interval '2 years', now() - interval '2 years', now() - interval '2 years'
FROM generate_series(1, 501) AS n;

SELECT pg_temp.verifie('500 au plus par appel, les plus anciennes d''abord',
  public.purge_inactive_guest_sessions()::text, '{"failed": 0, "deleted": 500, "has_more": true}');
SELECT pg_temp.verifie('la plus récente des anciennes attend l''appel suivant', pg_temp.restants(),
  '02,03,04,05,06,07,08,09,10,11,12,13,14,18,21,22');
SELECT pg_temp.verifie('l''appel suivant finit',
  public.purge_inactive_guest_sessions()::text, '{"failed": 0, "deleted": 2, "has_more": false}');
SELECT pg_temp.verifie('plus aucune session invitée sans trace depuis 13 mois',
  (SELECT count(*)::text FROM public.inactive_guest_sessions()), '0');
SELECT pg_temp.verifie('restent les sessions qui servent',
  pg_temp.restants(), '02,03,04,05,06,07,08,09,10,11,12,13,14,18,22');

ROLLBACK;
