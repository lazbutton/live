-- Tests de la migration 20261023160000_add_festival_follows_and_see_also.sql : events.festival_added_at (tenue
-- par la base), les festivals en favori dans follows_digest() (le programme qui s'étoffe) et app_see_also() sans
-- les événements du même festival.
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- Les événements sont désignés par les deux derniers caractères de leur id (« 01 », « f1 » pour un festival).

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

-- festival_added_at d'un événement : « maintenant » (l'heure de la transaction), « - » (null) ou la date.
CREATE FUNCTION pg_temp.entree(evenement text) RETURNS text
LANGUAGE sql AS $$
  SELECT CASE
    WHEN e.festival_added_at IS NULL THEN '-'
    WHEN e.festival_added_at = now() THEN 'maintenant'
    ELSE to_char(e.festival_added_at AT TIME ZONE 'UTC', 'DD/MM HH24:MI')
  END
  FROM public.events AS e
  WHERE e.id = ('e8000000-0000-4000-8000-0000000000' || evenement)::uuid;
$$;

-- Le message de chaque utilisateur à `a` : « U1 E01/Ff1 E02/L1 | U2 … » (lignes de follows_digest).
CREATE FUNCTION pg_temp.digest(a timestamptz) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(u.ligne, ' | ' ORDER BY u.user_id), '-')
  FROM (
    SELECT d.user_id, 'U' || right(d.user_id::text, 1) || ' ' || string_agg(
      'E' || right(d.event_id::text, 2) || '/' || CASE d.target_type
        WHEN 'location' THEN 'L' || right(d.target_id::text, 1)
        WHEN 'festival' THEN 'F' || right(d.target_id::text, 2)
        ELSE '?' END,
      ' ' ORDER BY d.ordre) AS ligne
    FROM public.follows_digest(a) WITH ORDINALITY AS d(user_id, event_id, event_title, event_date,
      target_type, target_id, target_name, ordre)
    GROUP BY d.user_id
  ) AS u;
$$;

-- « À voir aussi » d'un événement à `maintenant` : « place : 05 07 (Zz Dropkick=4) / genre : 09 ».
CREATE FUNCTION pg_temp.aussi(evenement text, maintenant timestamp DEFAULT '2026-11-18 10:00') RETURNS text
LANGUAGE sql AS $$
  SELECT 'place : ' || coalesce(
      string_agg(right(s.event_id::text, 2), ' ' ORDER BY s.rank) FILTER (WHERE s.section = 'place')
        || ' (' || min(s.source_name || '=' || s.source_events_count) FILTER (WHERE s.section = 'place') || ')',
      '-')
    || ' / genre : '
    || coalesce(string_agg(right(s.event_id::text, 2), ' ' ORDER BY s.rank) FILTER (WHERE s.section = 'genre'), '-')
  FROM public.app_see_also(('e8000000-0000-4000-8000-0000000000' || evenement)::uuid, NULL, maintenant, 20) AS s
$$;

-- events.festival_added_at ----------------------------------------------------------------------------

INSERT INTO public.events (id, title, date, category, status) VALUES
  ('e8000000-0000-4000-8000-0000000000a1', 'Zz Festival A', '2026-11-19 21:00+00', 'Festival', 'approved'),
  ('e8000000-0000-4000-8000-0000000000a2', 'Zz Festival B', '2026-11-19 21:00+00', 'Festival', 'approved');
INSERT INTO public.events (id, title, date, category, status, festival_id, festival_added_at) VALUES
  ('e8000000-0000-4000-8000-000000000091', 'Zz Rattaché à la création', '2026-11-20 21:00+00', 'Concert', 'approved',
   'e8000000-0000-4000-8000-0000000000a1', '2020-01-01 00:00+00'),
  ('e8000000-0000-4000-8000-000000000092', 'Zz Seul', '2026-11-20 21:00+00', 'Concert', 'approved', NULL,
   '2020-01-01 00:00+00');
SELECT pg_temp.verifie('à l''insertion : maintenant si rattaché, sinon rien ; la valeur envoyée est ignorée',
  pg_temp.entree('91') || ' ' || pg_temp.entree('92'), 'maintenant -');

UPDATE public.events SET festival_added_at = '2020-01-01 00:00+00' WHERE id = 'e8000000-0000-4000-8000-000000000091';
UPDATE public.events SET title = 'Zz Rattaché, retouché' WHERE id = 'e8000000-0000-4000-8000-000000000091';
SELECT pg_temp.verifie('une valeur envoyée est ignorée', pg_temp.entree('91'), 'maintenant');
ALTER TABLE public.events DISABLE TRIGGER trg_events_set_festival_added_at;
UPDATE public.events SET festival_added_at = '2026-10-01 08:00+00' WHERE id = 'e8000000-0000-4000-8000-000000000091';
ALTER TABLE public.events ENABLE TRIGGER trg_events_set_festival_added_at;
UPDATE public.events SET title = 'Zz Rattaché, retouché encore', festival_id = 'e8000000-0000-4000-8000-0000000000a1'
WHERE id = 'e8000000-0000-4000-8000-000000000091';
SELECT pg_temp.verifie('écrite par un client, retouché, même festival : la date reste',
  pg_temp.entree('91'), '01/10 08:00');

UPDATE public.events SET festival_id = 'e8000000-0000-4000-8000-0000000000a2' WHERE id = 'e8000000-0000-4000-8000-000000000091';
UPDATE public.events SET festival_id = 'e8000000-0000-4000-8000-0000000000a1' WHERE id = 'e8000000-0000-4000-8000-000000000092';
SELECT pg_temp.verifie('passé à un autre festival, rattaché : maintenant',
  pg_temp.entree('91') || ' ' || pg_temp.entree('92'), 'maintenant maintenant');

UPDATE public.events SET festival_id = NULL WHERE id = 'e8000000-0000-4000-8000-000000000092';
DELETE FROM public.events WHERE id = 'e8000000-0000-4000-8000-0000000000a2';
SELECT pg_temp.verifie('détaché, ou son festival supprimé : rien',
  pg_temp.entree('92') || ' ' || pg_temp.entree('91'), '- -');

DELETE FROM public.events;

-- Jeu d'essai des suivis -----------------------------------------------------------------------------
-- F1 « Zz Fulgurances » (publié) et F2 (en attente). U1 a F1 en favori depuis le 1er octobre ; U2 depuis le
-- 21 octobre à 11:00 ; U3 aussi, a masqué 03 et bloqué X, l'auteur de 07 ; U4 a F2 en favori ; U5 suit L1 et a
-- F1 en favori.
-- Premier passage : mercredi 21 octobre 2026, 10:00 UTC.

INSERT INTO auth.users (id, email, is_anonymous) VALUES
  ('3e000000-0000-4000-8000-000000000001', 'u1@test.local', false),
  ('3e000000-0000-4000-8000-000000000002', 'u2@test.local', false),
  ('3e000000-0000-4000-8000-000000000003', 'u3@test.local', false),
  ('3e000000-0000-4000-8000-000000000004', 'u4@test.local', false),
  ('3e000000-0000-4000-8000-000000000005', 'u5@test.local', false),
  ('3e000000-0000-4000-8000-00000000000f', 'x@test.local', false);

INSERT INTO public.locations (id, name, address) VALUES
  ('1e000000-0000-4000-8000-000000000001', 'Zz Dropkick', '37 place du Châtelet, 45000 Orléans'),
  ('1e000000-0000-4000-8000-000000000002', 'Zz Le 108', '108 rue de Bourgogne, 45000 Orléans');

INSERT INTO public.events (id, title, date, end_date, category, status, location_id, created_by, is_full) VALUES
  ('e8000000-0000-4000-8000-0000000000f1', 'Zz Fulgurances', '2026-11-19 21:00+00', '2026-11-22 04:45+00', 'Festival', 'approved', '1e000000-0000-4000-8000-000000000001', NULL, false),
  ('e8000000-0000-4000-8000-0000000000f2', 'Zz Festival en attente', '2026-11-25 21:00+00', NULL, 'Festival', 'pending', '1e000000-0000-4000-8000-000000000002', NULL, false),
  -- De F1 : 01 rattaché le 21 à 09:00 (publié il y a longtemps) ; 02 rattaché en attente le 10 (plus de 7 jours),
  -- publié le 21 à 08:00 : il entre au programme à sa publication ; 03 masqué par U3 ; 04 rattaché le 10 (plus de 7 jours) ; 05 complet ; 06 fini ; 07 d'un auteur
  -- bloqué par U3 ; 08 rattaché le 21 à 12:00, après le passage ; 09, au Dropkick que suit U5, publié le 21 à 12:30 et
  -- rattaché le 22 à 09:00.
  ('e8000000-0000-4000-8000-000000000001', 'Zz Micro', '2026-11-19 21:00+00', NULL, 'DJ Set', 'approved', '1e000000-0000-4000-8000-000000000001', NULL, false),
  ('e8000000-0000-4000-8000-000000000002', 'Zz Infra', '2026-11-20 18:00+00', NULL, 'Concert', 'approved', '1e000000-0000-4000-8000-000000000002', NULL, false),
  ('e8000000-0000-4000-8000-000000000003', 'Zz Masqué', '2026-11-20 20:00+00', NULL, 'Concert', 'approved', '1e000000-0000-4000-8000-000000000002', NULL, false),
  ('e8000000-0000-4000-8000-000000000004', 'Zz Ancien', '2026-11-20 21:00+00', NULL, 'Concert', 'approved', '1e000000-0000-4000-8000-000000000002', NULL, false),
  ('e8000000-0000-4000-8000-000000000005', 'Zz Complet', '2026-11-20 22:00+00', NULL, 'Concert', 'approved', '1e000000-0000-4000-8000-000000000002', NULL, true),
  ('e8000000-0000-4000-8000-000000000006', 'Zz Fini', '2026-10-20 20:00+00', NULL, 'Concert', 'approved', '1e000000-0000-4000-8000-000000000002', NULL, false),
  ('e8000000-0000-4000-8000-000000000007', 'Zz Bloqué', '2026-11-21 18:00+00', NULL, 'Concert', 'approved', '1e000000-0000-4000-8000-000000000002', '3e000000-0000-4000-8000-00000000000f', false),
  ('e8000000-0000-4000-8000-000000000008', 'Zz Ultra', '2026-11-21 20:00+00', NULL, 'Concert', 'approved', '1e000000-0000-4000-8000-000000000002', NULL, false),
  ('e8000000-0000-4000-8000-000000000009', 'Zz Gamma', '2026-11-21 22:00+00', NULL, 'DJ Set', 'approved', '1e000000-0000-4000-8000-000000000001', NULL, false),
  -- 10 de F2, en attente : rien pour U4.
  ('e8000000-0000-4000-8000-000000000010', 'Zz Soirée F2', '2026-11-25 21:00+00', NULL, 'Concert', 'approved', '1e000000-0000-4000-8000-000000000002', NULL, false);

UPDATE public.events SET festival_id = 'e8000000-0000-4000-8000-0000000000f1'
WHERE right(id::text, 2) IN ('01', '02', '03', '04', '05', '06', '07', '08', '09');
UPDATE public.events SET festival_id = 'e8000000-0000-4000-8000-0000000000f2' WHERE right(id::text, 2) = '10';

ALTER TABLE public.events DISABLE TRIGGER trg_events_set_published_at;
ALTER TABLE public.events DISABLE TRIGGER trg_events_set_festival_added_at;
UPDATE public.events AS e SET published_at = v.publie, festival_added_at = v.rattache
FROM (VALUES
  ('01', '2026-09-01 08:00+00'::timestamptz, '2026-10-21 09:00+00'::timestamptz),
  ('02', '2026-10-21 08:00+00', '2026-10-10 09:00+00'),
  ('03', '2026-09-01 08:00+00', '2026-10-21 09:00+00'),
  ('04', '2026-09-01 08:00+00', '2026-10-10 09:00+00'),
  ('05', '2026-09-01 08:00+00', '2026-10-21 09:00+00'),
  ('06', '2026-09-01 08:00+00', '2026-10-21 09:00+00'),
  ('07', '2026-09-01 08:00+00', '2026-10-21 09:00+00'),
  ('08', '2026-09-01 08:00+00', '2026-10-21 12:00+00'),
  ('09', '2026-10-21 12:30+00', '2026-10-22 09:00+00'),
  ('10', '2026-09-01 08:00+00', '2026-10-21 09:00+00'),
  ('f1', '2026-09-01 08:00+00', NULL),
  ('f2', NULL, NULL)
) AS v(code, publie, rattache)
WHERE right(e.id::text, 2) = v.code;
ALTER TABLE public.events ENABLE TRIGGER trg_events_set_published_at;
ALTER TABLE public.events ENABLE TRIGGER trg_events_set_festival_added_at;

INSERT INTO public.event_likes (event_id, user_id, created_at) VALUES
  ('e8000000-0000-4000-8000-0000000000f1', '3e000000-0000-4000-8000-000000000001', '2026-10-01 08:00+00'),
  ('e8000000-0000-4000-8000-0000000000f1', '3e000000-0000-4000-8000-000000000002', '2026-10-21 11:00+00'),
  ('e8000000-0000-4000-8000-0000000000f1', '3e000000-0000-4000-8000-000000000003', '2026-10-01 08:00+00'),
  ('e8000000-0000-4000-8000-0000000000f2', '3e000000-0000-4000-8000-000000000004', '2026-10-01 08:00+00'),
  ('e8000000-0000-4000-8000-0000000000f1', '3e000000-0000-4000-8000-000000000005', '2026-10-01 08:00+00'),
  -- Un cœur sur un événement qui n'est pas un festival : rien.
  ('e8000000-0000-4000-8000-000000000002', '3e000000-0000-4000-8000-000000000004', '2026-10-01 08:00+00');
INSERT INTO public.user_follows (user_id, target_type, target_id, created_at) VALUES
  ('3e000000-0000-4000-8000-000000000005', 'location', '1e000000-0000-4000-8000-000000000001', '2026-10-01 08:00+00');
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e8000000-0000-4000-8000-000000000003', '3e000000-0000-4000-8000-000000000003');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('3e000000-0000-4000-8000-000000000003', '3e000000-0000-4000-8000-00000000000f');

-- Suivis : les festivals en favori ---------------------------------------------------------------------

-- U1 : 02 (publié le 21 à 08:00, rattaché bien avant), 01 et 03 (rattachés le 21 à 09:00), 07 ; ni 04 (rattaché il y a
-- plus de 7 jours), ni 05 (complet), ni 06 (fini), ni 08 et 09 (après le passage). Par date d'événement.
-- U2 : rien (son cœur date d'après). U3 : sans 03 (masqué) ni 07 (auteur bloqué). U4 : rien (F2 en attente ;
-- son autre cœur n'est pas un festival). U5 : les mêmes que U1 par F1 ; rien du Dropkick qu'il suit (01 y a été
-- publié le 1er septembre, 09 l'est après le passage).
SELECT pg_temp.verifie('premier passage : ce qui est entré au programme',
  pg_temp.digest('2026-10-21 10:00+00'),
  'U1 E01/Ff1 E02/Ff1 E03/Ff1 E07/Ff1 | U3 E01/Ff1 E02/Ff1 | U5 E01/Ff1 E02/Ff1 E03/Ff1 E07/Ff1');

SELECT pg_temp.verifie('une ligne de festival : son titre, sa cible, le titre de l''événement',
  (SELECT string_agg(d.event_title || ' ' || d.target_type || ' ' || d.target_name, ', ' ORDER BY d.event_date)
   FROM public.follows_digest('2026-10-21 10:00+00') AS d
   WHERE d.user_id = '3e000000-0000-4000-8000-000000000003'),
  'Zz Micro festival Zz Fulgurances, Zz Infra festival Zz Fulgurances');

-- U1 a reçu son message (couvert jusqu'au passage).
INSERT INTO public.notification_logs (user_id, title, body, sent_at, delivery_date, delivery_key, flow_type, covered_until)
VALUES
  ('3e000000-0000-4000-8000-000000000001', 't', 'b', '2026-10-21 10:00:05+00', '2026-10-21',
   'follows_digest:2026-10-21:3e000000-0000-4000-8000-000000000001', 'follows_digest', '2026-10-21 10:00+00');

-- Lendemain : U1, seulement ce qui est entré depuis (08 le 21 à 12:00, 09 le 22 à 09:00) ; U2, ce qui est entré
-- depuis son cœur (08, 09) ; U3, tout sauf ses masqués et bloqués ; U5, 09 deux fois, par F1 et par le Dropkick
-- (le message le compte une fois : follows-digest.test.mjs).
SELECT pg_temp.verifie('lendemain : depuis le dernier message, depuis le cœur',
  pg_temp.digest('2026-10-22 10:00+00'),
  'U1 E08/Ff1 E09/Ff1 | U2 E08/Ff1 E09/Ff1 | U3 E01/Ff1 E02/Ff1 E08/Ff1 E09/Ff1'
  || ' | U5 E01/Ff1 E02/Ff1 E03/Ff1 E07/Ff1 E08/Ff1 E09/Ff1 E09/L1');

-- Le festival retiré de l'app : plus rien en son nom ; le lieu suivi reste.
UPDATE public.events SET status = 'pending' WHERE id = 'e8000000-0000-4000-8000-0000000000f1';
SELECT pg_temp.verifie('festival retiré de l''app : plus rien en son nom', pg_temp.digest('2026-10-22 10:00+00'),
  'U5 E09/L1');
UPDATE public.events SET status = 'approved' WHERE id = 'e8000000-0000-4000-8000-0000000000f1';

-- « À voir aussi » ----------------------------------------------------------------------------------------
-- Au Dropkick : F1 (le festival), 01 Micro et 09 Gamma (de F1), A1 (une autre soirée, hors festival) ; au 108 :
-- 02 Infra (F1), C1 (un DJ set hors festival) et 12 (une expo hors festival) ; à L'Astrolabe : 11 Ultra et 13 Final,
-- tous deux de F1. Le collectif O1 organise 11 et 12. « Maintenant » : mercredi 18 novembre, 10:00.

DELETE FROM public.events WHERE right(id::text, 2) IN ('03', '04', '05', '06', '07', '08', '10', 'f2');
INSERT INTO public.locations (id, name, address) VALUES
  ('1e000000-0000-4000-8000-000000000003', 'Zz Astrolabe', '1 rue Alexandre-Avisse, 45000 Orléans');
INSERT INTO public.organizers (id, name) VALUES ('0e000000-0000-4000-8000-000000000001', 'Zz Collectif');
INSERT INTO public.events (id, title, date, category, status, location_id, festival_id) VALUES
  ('e8000000-0000-4000-8000-0000000000a1', 'Zz Autre soirée', '2026-11-20 22:00+00', 'DJ Set', 'approved', '1e000000-0000-4000-8000-000000000001', NULL),
  ('e8000000-0000-4000-8000-0000000000c1', 'Zz Club', '2026-11-19 23:00+00', 'DJ Set', 'approved', '1e000000-0000-4000-8000-000000000002', NULL),
  ('e8000000-0000-4000-8000-000000000011', 'Zz Ultra', '2026-11-21 20:00+00', 'Concert', 'approved', '1e000000-0000-4000-8000-000000000003', 'e8000000-0000-4000-8000-0000000000f1'),
  ('e8000000-0000-4000-8000-000000000012', 'Zz Expo', '2026-11-20 12:00+00', 'Expo', 'approved', '1e000000-0000-4000-8000-000000000002', NULL),
  ('e8000000-0000-4000-8000-000000000013', 'Zz Final', '2026-11-21 23:30+00', 'Concert', 'approved', '1e000000-0000-4000-8000-000000000003', 'e8000000-0000-4000-8000-0000000000f1');
INSERT INTO public.event_organizers (event_id, organizer_id) VALUES
  ('e8000000-0000-4000-8000-000000000011', '0e000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000012', '0e000000-0000-4000-8000-000000000001');

-- Micro : au Dropkick, l'autre soirée seulement (ni le festival, ni Gamma) ; le compte reste celui de la page du
-- lieu (4) ; dans le même genre, le club du 108, pas Gamma.
SELECT pg_temp.verifie('voir aussi : un événement du festival, sans le festival ni les siens',
  pg_temp.aussi('01'), 'place : a1 (Zz Dropkick=4) / genre : c1');
-- Le festival : sans son programme.
SELECT pg_temp.verifie('voir aussi : le festival, sans son programme',
  pg_temp.aussi('f1'), 'place : a1 (Zz Dropkick=4) / genre : -');
-- Hors festival, rien ne change : le festival et ses événements sont proposés.
SELECT pg_temp.verifie('voir aussi : hors festival, rien ne change',
  pg_temp.aussi('a1'), 'place : 01 f1 09 (Zz Dropkick=4) / genre : c1');
-- Ultra : L'Astrolabe n'a que des événements du festival ; la source suivante, le collectif, est retenue.
SELECT pg_temp.verifie('voir aussi : une source qui n''a que le festival est passée',
  pg_temp.aussi('11'), 'place : 12 (Zz Collectif=2) / genre : -');

ROLLBACK;
