-- Tests des suivis (migration 20261021141000_create_user_follows.sql) : la table et sa RLS, les
-- triggers de cible, app_follows() et la recopie invité → compte.
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

-- Une commande avec le rôle et la session courants : le nombre de lignes touchées, ou le code
-- d'erreur.
CREATE FUNCTION pg_temp.essai(commande text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  EXECUTE commande;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n || ' ligne(s)';
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE;
END $$;

CREATE FUNCTION pg_temp.session_de(utilisateur text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"' || utilisateur || '"}', true);
$$;

-- Les suivis d'un utilisateur, lus sans RLS : « location L1, artist R1 ».
CREATE FUNCTION pg_temp.suivis(utilisateur uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(
    f.target_type || ' ' || CASE f.target_type
      WHEN 'location' THEN 'L' WHEN 'organizer' THEN 'O' ELSE 'R' END || right(f.target_id::text, 1),
    ', ' ORDER BY f.target_type, f.target_id), '-')
  FROM public.user_follows AS f
  WHERE f.user_id = utilisateur;
$$;

-- « Mes suivis » de la session courante, à at_time : « location L1 Nom 3/2 | … » (à venir / nouveaux).
CREATE FUNCTION pg_temp.mes_suivis(a timestamp) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  resultat text;
BEGIN
  SELECT coalesce(string_agg(
      s.target_type || ' ' || CASE s.target_type
        WHEN 'location' THEN 'L' WHEN 'organizer' THEN 'O' ELSE 'R' END || right(s.target_id::text, 1)
      || ' ' || s.name || ' ' || s.upcoming_count || '/' || s.new_count
      || coalesce(' ' || s.image_url, ''),
      ' | ' ORDER BY s.ordre), '-')
  INTO resultat
  FROM public.app_follows(a) WITH ORDINALITY AS s(target_type, target_id, name, image_url,
    upcoming_count, new_count, followed_at, ordre);
  RETURN resultat;
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE;
END $$;

-- Jeu d'essai --------------------------------------------------------------------------------------
-- G, H : invités (sessions anonymes). A : compte neuf. B : compte qui a déjà ses préférences.
-- L1, L2 : lieux ; O1 : organisateur ; R1 : artiste. « Maintenant » : mercredi 21 octobre 2026,
-- 12 h à Paris (10 h UTC).

INSERT INTO auth.users (id, email, is_anonymous) VALUES
  ('3d000000-0000-4000-8000-00000000000a', NULL, true),
  ('3d000000-0000-4000-8000-00000000000b', NULL, true),
  ('3d000000-0000-4000-8000-000000000001', 'a@test.local', false),
  ('3d000000-0000-4000-8000-000000000002', 'b@test.local', false);

INSERT INTO auth.sessions (id, user_id) VALUES
  ('5e000000-0000-4000-8000-00000000000a', '3d000000-0000-4000-8000-00000000000a'),
  ('5e000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000001');

INSERT INTO public.locations (id, name, address, is_organizer) VALUES
  ('1c000000-0000-4000-8000-000000000001', 'Zz Astrolabe', '1 rue Alexandre-Avisse, 45000 Orléans', true),
  ('1c000000-0000-4000-8000-000000000002', 'Zz Le 108', '108 rue de Bourgogne, 45000 Orléans', false);
INSERT INTO public.organizers (id, name, logo_url, icon_url) VALUES
  ('0a000000-0000-4000-8000-000000000001', 'Zz Grossomodo', ' ', 'https://img.test/gi.png');
INSERT INTO public.artists (id, name, slug, image_url) VALUES
  ('a7000000-0000-4000-8000-000000000001', 'Zz Chica', 'zz-chica', 'https://img.test/chica.jpg');

-- Événements (heure de Paris étiquetée UTC) ; E05 en attente, les autres approuvés.
INSERT INTO public.events (id, title, date, category, status, location_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'E01 à L1', '2026-11-07 20:30+00', 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'E02 à L2, organisé par L1', '2026-11-10 20:00+00', 'Concert', 'approved', '1c000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000003', 'E03 à L1, organisé par L1', '2026-11-12 20:00+00', 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000004', 'E04 à L1, passé', '2026-10-01 20:00+00', 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000005', 'E05 à L1, en attente', '2026-11-14 20:00+00', 'Concert', 'pending', '1c000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000006', 'E06 par O1', '2026-11-15 20:00+00', 'Théâtre', 'approved', NULL),
  ('e0000000-0000-4000-8000-000000000007', 'E07 avec R1', '2026-12-01 21:00+00', 'Concert', 'approved', NULL),
  ('e0000000-0000-4000-8000-000000000008', 'E08 à L1, masqué par G', '2026-11-20 20:00+00', 'Concert', 'approved', '1c000000-0000-4000-8000-000000000001');
INSERT INTO public.event_organizers (event_id, location_id, organizer_id) VALUES
  ('e0000000-0000-4000-8000-000000000002', '1c000000-0000-4000-8000-000000000001', NULL),
  ('e0000000-0000-4000-8000-000000000003', '1c000000-0000-4000-8000-000000000001', NULL),
  ('e0000000-0000-4000-8000-000000000006', NULL, '0a000000-0000-4000-8000-000000000001');
INSERT INTO public.event_artists (event_id, artist_id) VALUES
  ('e0000000-0000-4000-8000-000000000007', 'a7000000-0000-4000-8000-000000000001');
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000008', '3d000000-0000-4000-8000-00000000000a');

-- Dates de publication voulues (le trigger ne laisse écrire personne d'autre que lui).
ALTER TABLE public.events DISABLE TRIGGER trg_events_set_published_at;
UPDATE public.events AS e SET published_at = p.publie
FROM (VALUES
  ('e0000000-0000-4000-8000-000000000001'::uuid, '2026-10-20 08:00+00'::timestamptz),
  ('e0000000-0000-4000-8000-000000000002', '2026-10-10 08:00+00'),
  ('e0000000-0000-4000-8000-000000000003', '2026-10-16 08:00+00'),
  ('e0000000-0000-4000-8000-000000000004', '2026-09-20 08:00+00'),
  ('e0000000-0000-4000-8000-000000000006', '2026-09-01 08:00+00'),
  ('e0000000-0000-4000-8000-000000000007', '2026-10-20 08:00+00'),
  ('e0000000-0000-4000-8000-000000000008', '2026-10-20 08:00+00')
) AS p(id, publie)
WHERE e.id = p.id;
ALTER TABLE public.events ENABLE TRIGGER trg_events_set_published_at;

-- Droits -------------------------------------------------------------------------------------------

SELECT pg_temp.verifie('droits sur user_follows : authenticated lit, suit, ne plus suit ; anon rien',
  has_table_privilege('authenticated', 'public.user_follows', 'select')::text || ' '
  || has_table_privilege('authenticated', 'public.user_follows', 'insert')::text || ' '
  || has_table_privilege('authenticated', 'public.user_follows', 'delete')::text || ' '
  || has_table_privilege('authenticated', 'public.user_follows', 'update')::text || ' | '
  || has_table_privilege('anon', 'public.user_follows', 'select')::text || ' '
  || has_table_privilege('anon', 'public.user_follows', 'insert')::text,
  'true true true false | false false');

SELECT pg_temp.verifie('app_follows : authenticated, pas anon ni public',
  has_function_privilege('authenticated', 'public.app_follows(timestamp)', 'execute')::text || ' '
  || has_function_privilege('anon', 'public.app_follows(timestamp)', 'execute')::text || ' '
  || (SELECT coalesce(bool_or(a.grantee = 0), false)::text
      FROM pg_proc AS p, aclexplode(p.proacl) AS a
      WHERE p.oid = 'public.app_follows(timestamp)'::regprocedure),
  'true false false');

-- Suivre, ne plus suivre ---------------------------------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.session_de('3d000000-0000-4000-8000-00000000000a');

SELECT pg_temp.verifie('l''invité G suit L1, O1 et R1',
  pg_temp.essai($q$INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
    ('3d000000-0000-4000-8000-00000000000a', 'location', '1c000000-0000-4000-8000-000000000001'),
    ('3d000000-0000-4000-8000-00000000000a', 'organizer', '0a000000-0000-4000-8000-000000000001'),
    ('3d000000-0000-4000-8000-00000000000a', 'artist', 'a7000000-0000-4000-8000-000000000001')$q$),
  '3 ligne(s)');

SELECT pg_temp.verifie('suivre deux fois : refusé (23505), sans erreur avec ON CONFLICT DO NOTHING',
  pg_temp.essai($q$INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
    ('3d000000-0000-4000-8000-00000000000a', 'location', '1c000000-0000-4000-8000-000000000001')$q$)
  || ' | ' || pg_temp.essai($q$INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
    ('3d000000-0000-4000-8000-00000000000a', 'location', '1c000000-0000-4000-8000-000000000001')
    ON CONFLICT (user_id, target_type, target_id) DO NOTHING$q$),
  'erreur 23505 | 0 ligne(s)');

SELECT pg_temp.verifie('cible inconnue (23503), lieu suivi comme artiste (23503), type inconnu (23514)',
  pg_temp.essai($q$INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
    ('3d000000-0000-4000-8000-00000000000a', 'location', '1c000000-0000-4000-8000-0000000000ff')$q$)
  || ' | ' || pg_temp.essai($q$INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
    ('3d000000-0000-4000-8000-00000000000a', 'artist', '1c000000-0000-4000-8000-000000000002')$q$)
  || ' | ' || pg_temp.essai($q$INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
    ('3d000000-0000-4000-8000-00000000000a', 'event', 'e0000000-0000-4000-8000-000000000001')$q$),
  'erreur 23503 | erreur 23503 | erreur 23514');

SELECT pg_temp.verifie('suivre au nom d''un autre : refusé par la RLS (42501)',
  pg_temp.essai($q$INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
    ('3d000000-0000-4000-8000-000000000001', 'location', '1c000000-0000-4000-8000-000000000002')$q$),
  'erreur 42501');

SELECT pg_temp.verifie('pas de mise à jour (42501)',
  pg_temp.essai($q$UPDATE public.user_follows SET created_at = now()$q$),
  'erreur 42501');

-- A suit L1 et L2 ; G ne lit que ses lignes, et ne retire pas celles de A.
SELECT pg_temp.session_de('3d000000-0000-4000-8000-000000000001');
SELECT pg_temp.verifie('le compte A suit L1 et L2',
  pg_temp.essai($q$INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
    ('3d000000-0000-4000-8000-000000000001', 'location', '1c000000-0000-4000-8000-000000000001'),
    ('3d000000-0000-4000-8000-000000000001', 'location', '1c000000-0000-4000-8000-000000000002')$q$),
  '2 ligne(s)');

SELECT pg_temp.session_de('3d000000-0000-4000-8000-00000000000a');
SELECT pg_temp.verifie('G ne lit que ses suivis',
  (SELECT string_agg(target_type, ',' ORDER BY target_type) FROM public.user_follows),
  'artist,location,organizer');
SELECT pg_temp.verifie('G ne retire pas les suivis de A',
  pg_temp.essai($q$DELETE FROM public.user_follows
    WHERE user_id = '3d000000-0000-4000-8000-000000000001'$q$),
  '0 ligne(s)');

SELECT pg_temp.session_de('3d000000-0000-4000-8000-00000000000b');
SELECT pg_temp.verifie('l''invité H ne voit rien', (SELECT count(*)::text FROM public.user_follows), '0');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.verifie('anon : ni lecture, ni écriture, ni « Mes suivis »',
  pg_temp.essai('SELECT * FROM public.user_follows') || ' | '
  || pg_temp.essai($q$INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
    ('3d000000-0000-4000-8000-00000000000a', 'location', '1c000000-0000-4000-8000-000000000002')$q$)
  || ' | ' || pg_temp.mes_suivis('2026-10-21 12:00'),
  'erreur 42501 | erreur 42501 | erreur 42501');
RESET ROLE;

SELECT pg_temp.verifie('les suivis de G et de A, lus sans RLS',
  pg_temp.suivis('3d000000-0000-4000-8000-00000000000a') || ' || '
  || pg_temp.suivis('3d000000-0000-4000-8000-000000000001'),
  'artist R1, location L1, organizer O1 || location L1, location L2');

-- « Mes suivis » -----------------------------------------------------------------------------------
-- G suit depuis le 1er octobre ; R1 depuis ce matin (après la publication d'E07).

UPDATE public.user_follows SET created_at = '2026-10-01 08:00+00'
WHERE user_id = '3d000000-0000-4000-8000-00000000000a';
UPDATE public.user_follows SET created_at = '2026-10-21 09:00+00'
WHERE user_id = '3d000000-0000-4000-8000-00000000000a' AND target_type = 'artist';

SET LOCAL ROLE authenticated;
SELECT pg_temp.session_de('3d000000-0000-4000-8000-00000000000a');
-- L1 : E01, E02 (qu'il organise ailleurs) et E03 (une fois), pas E04 (passé), E05 (en attente) ni
-- E08 (masqué) ; nouveaux : E01 et E03 (E02 publié il y a plus de 7 jours). O1 : E06, publié en
-- septembre. R1 : E07, publié avant le début du suivi. Tri : du nouveau, puis à venir, puis le nom.
SELECT pg_temp.verifie('Mes suivis de G',
  pg_temp.mes_suivis('2026-10-21 12:00'),
  'location L1 Zz Astrolabe 3/2 | artist R1 Zz Chica 1/0 https://img.test/chica.jpg'
  || ' | organizer O1 Zz Grossomodo 1/0 https://img.test/gi.png');

SELECT pg_temp.verifie('dans un mois, seul E07 reste à venir',
  pg_temp.mes_suivis('2026-11-25 12:00'),
  'artist R1 Zz Chica 1/0 https://img.test/chica.jpg'
  || ' | location L1 Zz Astrolabe 0/0 | organizer O1 Zz Grossomodo 0/0 https://img.test/gi.png');

SELECT pg_temp.session_de('3d000000-0000-4000-8000-00000000000b');
SELECT pg_temp.verifie('Mes suivis de H : rien', pg_temp.mes_suivis('2026-10-21 12:00'), '-');
RESET ROLE;

-- Recopie invité → compte --------------------------------------------------------------------------
-- G n'a plus de notification des suivis ; A (compte neuf) n'a pas de préférences, B si.

INSERT INTO public.user_notification_preferences (user_id, frequency, is_enabled, category_ids, follows_enabled)
VALUES
  ('3d000000-0000-4000-8000-00000000000a', 'weekly', true, '{}', false),
  ('3d000000-0000-4000-8000-000000000002', 'daily', true, '{}', true);

SELECT pg_temp.verifie('follows_enabled : vrai par défaut',
  (SELECT column_default || ' ' || is_nullable FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'user_notification_preferences'
     AND column_name = 'follows_enabled'),
  'true NO');

SET LOCAL ROLE authenticated;
SELECT pg_temp.session_de('3d000000-0000-4000-8000-000000000001');
SELECT pg_temp.verifie('compte A : 2 suivis ajoutés (L1 déjà suivi), préférences recopiées',
  (SELECT format('suivis +%s, préférences +%s', c.follows, c.notification_preferences)
   FROM public.copy_guest_data('5e000000-0000-4000-8000-00000000000a') AS c),
  'suivis +2, préférences +1');
SELECT pg_temp.verifie('rejouer la recopie n''ajoute rien',
  (SELECT format('suivis +%s', c.follows)
   FROM public.copy_guest_data('5e000000-0000-4000-8000-00000000000a') AS c),
  'suivis +0');
SELECT pg_temp.session_de('3d000000-0000-4000-8000-000000000002');
SELECT pg_temp.verifie('compte B : 3 suivis, ses préférences gardées',
  (SELECT format('suivis +%s, préférences +%s', c.follows, c.notification_preferences)
   FROM public.copy_guest_data('5e000000-0000-4000-8000-00000000000a') AS c),
  'suivis +3, préférences +0');
RESET ROLE;

SELECT pg_temp.verifie('les suivis recopiés gardent leur date ; ceux du compte, la leur',
  (SELECT string_agg(f.target_type || ' ' || to_char(f.created_at AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
     ', ' ORDER BY f.target_type, f.target_id)
   FROM public.user_follows AS f WHERE f.user_id = '3d000000-0000-4000-8000-000000000001'
     AND f.target_type <> 'location'),
  'artist 21/10 09:00, organizer 01/10 08:00');
SELECT pg_temp.verifie('follows_enabled recopié pour A, gardé pour B, et G garde ses suivis',
  (SELECT string_agg(p.follows_enabled::text, ' ' ORDER BY p.user_id)
   FROM public.user_notification_preferences AS p
   WHERE p.user_id IN ('3d000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000002'))
  || ' | ' || pg_temp.suivis('3d000000-0000-4000-8000-00000000000a'),
  'false true | artist R1, location L1, organizer O1');

-- Cible supprimée ----------------------------------------------------------------------------------

DELETE FROM public.artists WHERE id = 'a7000000-0000-4000-8000-000000000001';
DELETE FROM public.locations WHERE id = '1c000000-0000-4000-8000-000000000002';
SELECT pg_temp.verifie('un artiste ou un lieu supprimé emporte ses suivis',
  pg_temp.suivis('3d000000-0000-4000-8000-00000000000a') || ' || '
  || pg_temp.suivis('3d000000-0000-4000-8000-000000000001'),
  'location L1, organizer O1 || location L1, organizer O1');

DELETE FROM auth.users WHERE id = '3d000000-0000-4000-8000-00000000000a';
SELECT pg_temp.verifie('un compte supprimé emporte ses suivis',
  pg_temp.suivis('3d000000-0000-4000-8000-00000000000a'), '-');

ROLLBACK;
