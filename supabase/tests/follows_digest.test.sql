-- Tests de events.published_at (20261021140000_add_events_published_at.sql) et de follows_digest()
-- (20261021142000_create_follows_digest.sql) : ce que la notification des suivis envoie, à qui,
-- et qu'elle n'envoie rien deux fois.
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

CREATE FUNCTION pg_temp.verifie(nom text, obtenu text, attendu text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF obtenu IS DISTINCT FROM attendu THEN
    RAISE EXCEPTION 'ÉCHEC % : obtenu « % », attendu « % »', nom, obtenu, attendu;
  END IF;
  RAISE NOTICE 'ok  %', nom;
END $$;

-- published_at d'un événement : « maintenant » (l'heure de la transaction), « - » (null) ou la date.
CREATE FUNCTION pg_temp.publie(evenement uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT CASE
    WHEN e.published_at IS NULL THEN '-'
    WHEN e.published_at = now() THEN 'maintenant'
    ELSE to_char(e.published_at AT TIME ZONE 'UTC', 'DD/MM HH24:MI')
  END
  FROM public.events AS e
  WHERE e.id = evenement;
$$;

-- Le message de chaque utilisateur à `a` : « U1 E01/L1 E02/L1 | U2 … » (lignes de follows_digest).
CREATE FUNCTION pg_temp.digest(a timestamptz) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(u.ligne, ' | ' ORDER BY u.user_id), '-')
  FROM (
    SELECT d.user_id, 'U' || right(d.user_id::text, 1) || ' ' || string_agg(
      'E' || right(d.event_id::text, 2) || '/' || CASE d.target_type
        WHEN 'location' THEN 'L' WHEN 'organizer' THEN 'O' ELSE 'R' END || right(d.target_id::text, 1),
      ' ' ORDER BY d.ordre) AS ligne
    FROM public.follows_digest(a) WITH ORDINALITY AS d(user_id, event_id, event_title, event_date,
      target_type, target_id, target_name, ordre)
    GROUP BY d.user_id
  ) AS u;
$$;

-- events.published_at ------------------------------------------------------------------------------

INSERT INTO public.events (id, title, date, category, status) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'P1 en attente', '2026-11-07 20:30+00', 'Concert', 'pending');
SELECT pg_temp.verifie('en attente : pas publié', pg_temp.publie('e1000000-0000-4000-8000-000000000001'), '-');

UPDATE public.events SET status = 'approved' WHERE id = 'e1000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('approuvé : publié maintenant',
  pg_temp.publie('e1000000-0000-4000-8000-000000000001'), 'maintenant');

ALTER TABLE public.events DISABLE TRIGGER trg_events_set_published_at;
UPDATE public.events SET published_at = '2026-10-01 08:00+00'
WHERE id = 'e1000000-0000-4000-8000-000000000001';
ALTER TABLE public.events ENABLE TRIGGER trg_events_set_published_at;

UPDATE public.events SET archived = true WHERE id = 'e1000000-0000-4000-8000-000000000001';
UPDATE public.events SET archived = false WHERE id = 'e1000000-0000-4000-8000-000000000001';
UPDATE public.events SET status = 'rejected' WHERE id = 'e1000000-0000-4000-8000-000000000001';
UPDATE public.events SET status = 'approved' WHERE id = 'e1000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('archivé puis remis, refusé puis approuvé : sa première date reste',
  pg_temp.publie('e1000000-0000-4000-8000-000000000001'), '01/10 08:00');

UPDATE public.events SET published_at = NULL WHERE id = 'e1000000-0000-4000-8000-000000000001';
UPDATE public.events SET published_at = '2026-12-01 08:00+00' WHERE id = 'e1000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('une valeur écrite par un client est ignorée',
  pg_temp.publie('e1000000-0000-4000-8000-000000000001'), '01/10 08:00');

INSERT INTO public.events (id, title, date, category, status, show_on_app, is_safety_hidden, published_at) VALUES
  ('e1000000-0000-4000-8000-000000000002', 'P2 copie', '2026-11-08 20:30+00', 'Concert', 'approved', true, false, '2026-01-01 08:00+00'),
  ('e1000000-0000-4000-8000-000000000003', 'P3 hors de l''app', '2026-11-09 20:30+00', 'Concert', 'approved', false, false, NULL),
  ('e1000000-0000-4000-8000-000000000004', 'P4 masqué', '2026-11-09 20:30+00', 'Concert', 'approved', true, true, NULL);
SELECT pg_temp.verifie('inséré approuvé : publié maintenant, même avec une date envoyée ; hors de l''app, masqué : non',
  pg_temp.publie('e1000000-0000-4000-8000-000000000002') || ' ' || pg_temp.publie('e1000000-0000-4000-8000-000000000003')
  || ' ' || pg_temp.publie('e1000000-0000-4000-8000-000000000004'),
  'maintenant - -');

UPDATE public.events SET show_on_app = true WHERE id = 'e1000000-0000-4000-8000-000000000003';
UPDATE public.events SET title = 'P4 masqué, retouché' WHERE id = 'e1000000-0000-4000-8000-000000000004';
SELECT pg_temp.verifie('montré dans l''app : publié ; retouché, toujours masqué : non',
  pg_temp.publie('e1000000-0000-4000-8000-000000000003') || ' ' || pg_temp.publie('e1000000-0000-4000-8000-000000000004'),
  'maintenant -');

UPDATE public.events SET is_safety_hidden = false WHERE id = 'e1000000-0000-4000-8000-000000000004';
SELECT pg_temp.verifie('démasqué par la modération : publié',
  pg_temp.publie('e1000000-0000-4000-8000-000000000004'), 'maintenant');

DELETE FROM public.events WHERE id::text LIKE 'e1000000-%';

-- Droits -------------------------------------------------------------------------------------------

SELECT pg_temp.verifie('follows_digest : service_role seulement',
  has_function_privilege('service_role', 'public.follows_digest(timestamptz)', 'execute')::text || ' '
  || has_function_privilege('authenticated', 'public.follows_digest(timestamptz)', 'execute')::text || ' '
  || has_function_privilege('anon', 'public.follows_digest(timestamptz)', 'execute')::text || ' '
  || (SELECT coalesce(bool_or(a.grantee = 0), false)::text
      FROM pg_proc AS p, aclexplode(p.proacl) AS a
      WHERE p.oid = 'public.follows_digest(timestamptz)'::regprocedure),
  'true false false false');

-- Jeu d'essai --------------------------------------------------------------------------------------
-- U1 suit L1 ; U2 (invité) suit O1 et R1 ; U3 suit L1, a masqué E03 et bloqué X, l'auteur d'E04 ;
-- U4 suit L1 depuis le 20 octobre à 14:30 UTC. Tous depuis le 1er octobre sinon.
-- Premier passage : mercredi 21 octobre 2026, 08:00 UTC (10 h à Paris).

INSERT INTO auth.users (id, email, is_anonymous) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'u1@test.local', false),
  ('3d000000-0000-4000-8000-000000000002', NULL, true),
  ('3d000000-0000-4000-8000-000000000003', 'u3@test.local', false),
  ('3d000000-0000-4000-8000-000000000004', 'u4@test.local', false),
  ('3d000000-0000-4000-8000-00000000000f', 'x@test.local', false);

INSERT INTO public.locations (id, name, address, is_organizer) VALUES
  ('1c000000-0000-4000-8000-000000000001', 'Zz Astrolabe', '1 rue Alexandre-Avisse, 45000 Orléans', true),
  ('1c000000-0000-4000-8000-000000000002', 'Zz Le 108', '108 rue de Bourgogne, 45000 Orléans', false);
INSERT INTO public.organizers (id, name) VALUES
  ('0a000000-0000-4000-8000-000000000001', 'Zz Grossomodo');
INSERT INTO public.artists (id, name, slug) VALUES
  ('a7000000-0000-4000-8000-000000000001', 'Zz Chica', 'zz-chica');

INSERT INTO public.events (id, title, date, end_date, category, status, location_id, created_by, is_full) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'E01', '2026-11-07 20:30+00', NULL, 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001', NULL, false),
  ('e0000000-0000-4000-8000-000000000002', 'E02', '2026-11-10 20:00+00', NULL, 'Concert', 'approved', '1c000000-0000-4000-8000-000000000002', NULL, false),
  ('e0000000-0000-4000-8000-000000000003', 'E03', '2026-11-12 20:00+00', NULL, 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001', NULL, false),
  ('e0000000-0000-4000-8000-000000000004', 'E04', '2026-11-13 20:00+00', NULL, 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-00000000000f', false),
  ('e0000000-0000-4000-8000-000000000005', 'E05', '2026-11-14 20:00+00', NULL, 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001', NULL, false),
  ('e0000000-0000-4000-8000-000000000006', 'E06', '2026-11-15 20:00+00', NULL, 'Théâtre', 'approved', NULL, NULL, false),
  ('e0000000-0000-4000-8000-000000000007', 'E07', '2026-11-16 21:00+00', NULL, 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001', NULL, false),
  ('e0000000-0000-4000-8000-000000000008', 'E08', '2026-10-20 20:00+00', NULL, 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001', NULL, false),
  ('e0000000-0000-4000-8000-000000000009', 'E09', '2026-11-18 20:00+00', NULL, 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001', NULL, true),
  ('e0000000-0000-4000-8000-000000000010', 'E10', '2026-11-19 20:00+00', NULL, 'Concert', 'pending', '1c000000-0000-4000-8000-000000000001', NULL, false),
  ('e0000000-0000-4000-8000-000000000011', 'E11', '2026-11-20 20:00+00', NULL, 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001', NULL, false),
  ('e0000000-0000-4000-8000-000000000012', 'E12', '2026-11-21 20:00+00', NULL, 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001', NULL, false),
  ('e0000000-0000-4000-8000-000000000013', 'E13 expo', '2026-09-01 10:00+00', '2027-01-31 18:00+00', 'Expo', 'approved', '1c000000-0000-4000-8000-000000000001', NULL, false);
INSERT INTO public.event_organizers (event_id, location_id, organizer_id) VALUES
  ('e0000000-0000-4000-8000-000000000002', '1c000000-0000-4000-8000-000000000001', NULL),
  ('e0000000-0000-4000-8000-000000000006', NULL, '0a000000-0000-4000-8000-000000000001');
INSERT INTO public.event_artists (event_id, artist_id) VALUES
  ('e0000000-0000-4000-8000-000000000007', 'a7000000-0000-4000-8000-000000000001');

-- E01 à E09 et E13 publiés le 20 octobre (E05 le 10, plus de 7 jours avant) ; E11 et E12 le 21
-- après le premier passage.
ALTER TABLE public.events DISABLE TRIGGER trg_events_set_published_at;
UPDATE public.events AS e SET published_at = p.publie
FROM (VALUES
  ('e0000000-0000-4000-8000-000000000001'::uuid, '2026-10-20 12:00+00'::timestamptz),
  ('e0000000-0000-4000-8000-000000000002', '2026-10-20 13:00+00'),
  ('e0000000-0000-4000-8000-000000000003', '2026-10-20 14:00+00'),
  ('e0000000-0000-4000-8000-000000000004', '2026-10-20 15:00+00'),
  ('e0000000-0000-4000-8000-000000000005', '2026-10-10 15:00+00'),
  ('e0000000-0000-4000-8000-000000000006', '2026-10-20 16:00+00'),
  ('e0000000-0000-4000-8000-000000000007', '2026-10-20 17:00+00'),
  ('e0000000-0000-4000-8000-000000000008', '2026-10-20 10:00+00'),
  ('e0000000-0000-4000-8000-000000000009', '2026-10-20 18:00+00'),
  ('e0000000-0000-4000-8000-000000000011', '2026-10-21 09:00+00'),
  ('e0000000-0000-4000-8000-000000000012', '2026-10-21 09:30+00'),
  ('e0000000-0000-4000-8000-000000000013', '2026-10-20 19:00+00')
) AS p(id, publie)
WHERE e.id = p.id;
ALTER TABLE public.events ENABLE TRIGGER trg_events_set_published_at;

INSERT INTO public.user_follows (user_id, target_type, target_id, created_at) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'location', '1c000000-0000-4000-8000-000000000001', '2026-10-01 08:00+00'),
  ('3d000000-0000-4000-8000-000000000002', 'organizer', '0a000000-0000-4000-8000-000000000001', '2026-10-01 08:00+00'),
  ('3d000000-0000-4000-8000-000000000002', 'artist', 'a7000000-0000-4000-8000-000000000001', '2026-10-01 08:00+00'),
  ('3d000000-0000-4000-8000-000000000003', 'location', '1c000000-0000-4000-8000-000000000001', '2026-10-01 08:00+00'),
  ('3d000000-0000-4000-8000-000000000004', 'location', '1c000000-0000-4000-8000-000000000001', '2026-10-20 14:30+00');
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000003', '3d000000-0000-4000-8000-000000000003');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('3d000000-0000-4000-8000-000000000003', '3d000000-0000-4000-8000-00000000000f');

-- Premier passage ----------------------------------------------------------------------------------
-- U1 : l'expo E13 (en cours, en tête : tri par date), E01, E02 (que L1 organise au 108), E03, E04,
-- E07 ; ni E05 (publié il y a plus
-- de 7 jours), ni E08 (fini hier soir), ni E09 (complet), ni E10 (en attente), ni E11 et E12
-- (publiés après le passage). U2 : E06 par O1, E07 par R1. U3 : comme U1, sans E03 (masqué) ni E04
-- (auteur bloqué). U4 : ce qui est publié depuis le début de son suivi.
SELECT pg_temp.verifie('premier passage',
  pg_temp.digest('2026-10-21 08:00+00'),
  'U1 E13/L1 E01/L1 E02/L1 E03/L1 E04/L1 E07/L1 | U2 E06/O1 E07/R1'
  || ' | U3 E13/L1 E01/L1 E02/L1 E07/L1 | U4 E13/L1 E04/L1 E07/L1');

SELECT pg_temp.verifie('chaque ligne porte le titre, la date et le nom de la cible',
  (SELECT string_agg(d.event_title || ' ' || to_char(d.event_date AT TIME ZONE 'UTC', 'DD/MM HH24:MI')
     || ' ' || d.target_name, ', ' ORDER BY d.event_id)
   FROM public.follows_digest('2026-10-21 08:00+00') AS d
   WHERE d.user_id = '3d000000-0000-4000-8000-000000000002'),
  'E06 15/11 20:00 Zz Grossomodo, E07 16/11 21:00 Zz Chica');

-- U1 a reçu son message (couvert jusqu'au passage) ; celui d'U2 a échoué (log libéré : non envoyé).
INSERT INTO public.notification_logs (user_id, title, body, sent_at, delivery_date, delivery_key, flow_type, covered_until)
VALUES
  ('3d000000-0000-4000-8000-000000000001', 't', 'b', '2026-10-21 08:00:05+00', '2026-10-21',
   'follows_digest:2026-10-21:3d000000-0000-4000-8000-000000000001', 'follows_digest', '2026-10-21 08:00+00'),
  ('3d000000-0000-4000-8000-000000000002', 't', 'b', NULL, '2026-10-21',
   'follows_digest:2026-10-21:3d000000-0000-4000-8000-000000000002', 'follows_digest', '2026-10-21 08:00+00'),
  -- Un résumé des catégories ne compte pas.
  ('3d000000-0000-4000-8000-000000000003', 't', 'b', '2026-10-21 08:00:05+00', '2026-10-21',
   'daily_events:2026-10-21:3d000000-0000-4000-8000-000000000003', 'daily_events', NULL);

-- Lendemain ----------------------------------------------------------------------------------------
-- U1 : seulement ce qui est publié depuis son message, même pendant l'envoi (E11 à 09:00, E12 à
-- 09:30). U2 : son message n'est pas parti, tout revient. U3, U4 : pas de message des suivis encore.
SELECT pg_temp.verifie('lendemain',
  pg_temp.digest('2026-10-22 08:00+00'),
  'U1 E11/L1 E12/L1 | U2 E06/O1 E07/R1'
  || ' | U3 E13/L1 E01/L1 E02/L1 E07/L1 E11/L1 E12/L1 | U4 E13/L1 E04/L1 E07/L1 E11/L1 E12/L1');

-- Une semaine plus tard, sans message entre-temps : rien de plus de 7 jours.
SELECT pg_temp.verifie('au plus 7 jours de rattrapage',
  pg_temp.digest('2026-10-28 08:30+00'),
  'U1 E11/L1 E12/L1 | U3 E11/L1 E12/L1 | U4 E11/L1 E12/L1');

-- Plus de suivi, plus de message ; une cible supprimée non plus.
DELETE FROM public.user_follows WHERE user_id = '3d000000-0000-4000-8000-000000000004';
DELETE FROM public.organizers WHERE id = '0a000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('sans suivi ni cible',
  pg_temp.digest('2026-10-22 08:00+00'),
  'U1 E11/L1 E12/L1 | U2 E07/R1 | U3 E13/L1 E01/L1 E02/L1 E07/L1 E11/L1 E12/L1');

ROLLBACK;
