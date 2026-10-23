-- Tests de la RLS d'events et de user_organizers (migration 20261021190000_speed_up_events_rls.sql).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- Deux parties :
-- - les droits (qui voit, modifie, supprime quoi) : ces cas passent aussi sans la migration, ils
--   prouvent qu'elle ne change les droits de personne ;
-- - la forme des politiques : aucune vérification qui ne dépend pas de la ligne n'est refaite à chaque
--   ligne (seulement avec la migration).
--
-- Les événements sont désignés par les deux derniers chiffres de leur id (« 01 » = l'événement 01),
-- les comptes par « u » et les deux derniers chiffres du leur.

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

-- La session qui lit : anon, ou un compte (« 03 »), invité ou non. Toujours suivie de RESET ROLE.
CREATE FUNCTION pg_temp.session(compte text DEFAULT NULL, invite boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF compte IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object(
      'role', 'authenticated',
      'sub', 'e7a00000-0000-4000-8000-0000000000' || compte,
      'is_anonymous', invite,
      'app_metadata', json_build_object('provider', CASE WHEN invite THEN 'anonymous' ELSE 'email' END)
    )::text, true);
    SET LOCAL ROLE authenticated;
  END IF;
END $$;

-- Les événements visibles : « 01 04 05 ».
CREATE FUNCTION pg_temp.voit() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(id::text, 2), ' ' ORDER BY id), '') FROM public.events
$$;

-- Les événements que la session peut modifier (titre inchangé) ou supprimer, chacun essayé puis annulé.
CREATE FUNCTION pg_temp.peut(action text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  evenement uuid;
  lignes integer;
  resultat text := '';
BEGIN
  FOR evenement IN
    SELECT ('e7e00000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid FROM generate_series(1, 22) i
  LOOP
    BEGIN
      IF action = 'modifier' THEN
        UPDATE public.events SET title = title WHERE id = evenement;
      ELSE
        DELETE FROM public.events WHERE id = evenement;
      END IF;
      GET DIAGNOSTICS lignes = ROW_COUNT;
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = lignes::text;
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM = '1' THEN resultat := resultat || ' ' || right(evenement::text, 2); END IF;
      WHEN OTHERS THEN
        resultat := resultat || ' ' || right(evenement::text, 2) || '!' || SQLSTATE;
    END;
  END LOOP;
  RETURN ltrim(resultat);
END $$;

-- Passer un événement à un statut : « ok », « 0 ligne » ou le code de l'erreur ; annulé.
CREATE FUNCTION pg_temp.statut(evenement text, nouveau text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  lignes integer;
BEGIN
  BEGIN
    UPDATE public.events SET status = nouveau WHERE id = ('e7e00000-0000-4000-8000-0000000000' || evenement)::uuid;
    GET DIAGNOSTICS lignes = ROW_COUNT;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = lignes::text;
  EXCEPTION
    WHEN raise_exception THEN
      RETURN CASE SQLERRM WHEN '1' THEN 'ok' ELSE '0 ligne' END;
    WHEN OTHERS THEN
      RETURN 'erreur ' || SQLSTATE;
  END;
END $$;

-- Les liens user_organizers visibles : « 03:O1 ».
CREATE FUNCTION pg_temp.liens() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(user_id::text, 2) || ':' || right(organizer_id::text, 2), ' '
    ORDER BY user_id, organizer_id), '')
  FROM public.user_organizers
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO anon, authenticated;

-- Jeu d'essai --------------------------------------------------------------------------------------

-- u01 admin ; u02 sans organisateur ; u03 propriétaire (owner) de l'organisateur 31 ; u04 éditeur de 32 ;
-- u05 lecteur (viewer) de 33 ; u06 propriétaire du lieu-organisateur 41 ; u07 lecteur du lieu-organisateur
-- 42 et propriétaire de 34 ; u08 auteur ; u09 auteur suspendu ; u10 invité (session anonyme),
-- propriétaire de 35.
INSERT INTO auth.users (id, email, is_anonymous, raw_user_meta_data) VALUES
  ('e7a00000-0000-4000-8000-000000000001', 'u01@test.local', false, '{"role":"admin"}'),
  ('e7a00000-0000-4000-8000-000000000002', 'u02@test.local', false, '{}'),
  ('e7a00000-0000-4000-8000-000000000003', 'u03@test.local', false, '{}'),
  ('e7a00000-0000-4000-8000-000000000004', 'u04@test.local', false, '{}'),
  ('e7a00000-0000-4000-8000-000000000005', 'u05@test.local', false, '{}'),
  ('e7a00000-0000-4000-8000-000000000006', 'u06@test.local', false, '{}'),
  ('e7a00000-0000-4000-8000-000000000007', 'u07@test.local', false, '{}'),
  ('e7a00000-0000-4000-8000-000000000008', 'u08@test.local', false, '{}'),
  ('e7a00000-0000-4000-8000-000000000009', 'u09@test.local', false, '{}'),
  ('e7a00000-0000-4000-8000-000000000010', NULL, true, '{}');

-- La suspension UGC vit dans app_metadata (migration 20261023160000), pas dans user_metadata (que
-- l'utilisateur modifie ; le trigger y retire ugc_suspended). u09 est donc suspendu via app_meta.
UPDATE auth.users SET raw_app_meta_data = '{"ugc_suspended":"true"}'::jsonb
WHERE id = 'e7a00000-0000-4000-8000-000000000009';

INSERT INTO public.organizers (id, name) VALUES
  ('e7b00000-0000-4000-8000-000000000031', 'Zz Orga 31'),
  ('e7b00000-0000-4000-8000-000000000032', 'Zz Orga 32'),
  ('e7b00000-0000-4000-8000-000000000033', 'Zz Orga 33'),
  ('e7b00000-0000-4000-8000-000000000034', 'Zz Orga 34'),
  ('e7b00000-0000-4000-8000-000000000035', 'Zz Orga 35');

-- 41 et 42 organisent ; 43 non ; 44 organisait quand u06 y a été lié (voir plus bas).
INSERT INTO public.locations (id, name, address, is_organizer) VALUES
  ('e7c00000-0000-4000-8000-000000000041', 'Zz Lieu 41', '1 rue A', true),
  ('e7c00000-0000-4000-8000-000000000042', 'Zz Lieu 42', '2 rue A', true),
  ('e7c00000-0000-4000-8000-000000000043', 'Zz Lieu 43', '3 rue A', false),
  ('e7c00000-0000-4000-8000-000000000044', 'Zz Lieu 44', '4 rue A', true);

INSERT INTO public.user_organizers (user_id, organizer_id, role) VALUES
  ('e7a00000-0000-4000-8000-000000000003', 'e7b00000-0000-4000-8000-000000000031', 'owner'),
  ('e7a00000-0000-4000-8000-000000000004', 'e7b00000-0000-4000-8000-000000000032', 'editor'),
  ('e7a00000-0000-4000-8000-000000000005', 'e7b00000-0000-4000-8000-000000000033', 'viewer'),
  ('e7a00000-0000-4000-8000-000000000006', 'e7c00000-0000-4000-8000-000000000041', 'owner'),
  ('e7a00000-0000-4000-8000-000000000006', 'e7c00000-0000-4000-8000-000000000044', 'owner'),
  ('e7a00000-0000-4000-8000-000000000007', 'e7c00000-0000-4000-8000-000000000042', 'viewer'),
  ('e7a00000-0000-4000-8000-000000000007', 'e7b00000-0000-4000-8000-000000000034', 'owner'),
  ('e7a00000-0000-4000-8000-000000000010', 'e7b00000-0000-4000-8000-000000000035', 'owner');

-- Le lieu 44 n'organise plus : son lien ne donne plus rien.
UPDATE public.locations SET is_organizer = false WHERE id = 'e7c00000-0000-4000-8000-000000000044';

-- 01 publié ; 02 publié mais masqué (sécurité) ; 03 publié hors de l'app ; 04 en attente, 05 brouillon,
-- 06 refusé : organisateur 31 ; 07 en attente, 08 publié : 32 ; 09 en attente : 33 ; 10 en attente,
-- 11 brouillon : lieu-organisateur 41 ; 12 en attente : lieu-organisateur 42 ; 13 en attente : 34 ;
-- 14 en attente, auteur u08 ; 15 publié, auteur u08 ; 16 en attente, auteur u09 (suspendu) ;
-- 17 en attente : 35 ; 18 en attente, au lieu 43 (pas organisateur), sans organisateur ; 19 en attente,
-- sans rien ; 20 publié : 35 ; 21 en attente, auteur u10 (invité) ; 22 en attente : lieu 44.
INSERT INTO public.events (id, title, date, category, status, is_safety_hidden, show_on_app, created_by) VALUES
  ('e7e00000-0000-4000-8000-000000000001', 'Zz 01', '2026-11-06 20:00', 'Concert', 'approved', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000002', 'Zz 02', '2026-11-06 20:00', 'Concert', 'approved', true, true, NULL),
  ('e7e00000-0000-4000-8000-000000000003', 'Zz 03', '2026-11-06 20:00', 'Concert', 'approved', false, false, NULL),
  ('e7e00000-0000-4000-8000-000000000004', 'Zz 04', '2026-11-06 20:00', 'Concert', 'pending', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000005', 'Zz 05', '2026-11-06 20:00', 'Concert', 'draft', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000006', 'Zz 06', '2026-11-06 20:00', 'Concert', 'rejected', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000007', 'Zz 07', '2026-11-06 20:00', 'Concert', 'pending', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000008', 'Zz 08', '2026-11-06 20:00', 'Concert', 'approved', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000009', 'Zz 09', '2026-11-06 20:00', 'Concert', 'pending', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000010', 'Zz 10', '2026-11-06 20:00', 'Concert', 'pending', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000011', 'Zz 11', '2026-11-06 20:00', 'Concert', 'draft', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000012', 'Zz 12', '2026-11-06 20:00', 'Concert', 'pending', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000013', 'Zz 13', '2026-11-06 20:00', 'Concert', 'pending', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000014', 'Zz 14', '2026-11-06 20:00', 'Concert', 'pending', false, true,
    'e7a00000-0000-4000-8000-000000000008'),
  ('e7e00000-0000-4000-8000-000000000015', 'Zz 15', '2026-11-06 20:00', 'Concert', 'approved', false, true,
    'e7a00000-0000-4000-8000-000000000008'),
  ('e7e00000-0000-4000-8000-000000000016', 'Zz 16', '2026-11-06 20:00', 'Concert', 'pending', false, true,
    'e7a00000-0000-4000-8000-000000000009'),
  ('e7e00000-0000-4000-8000-000000000017', 'Zz 17', '2026-11-06 20:00', 'Concert', 'pending', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000018', 'Zz 18', '2026-11-06 20:00', 'Concert', 'pending', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000019', 'Zz 19', '2026-11-06 20:00', 'Concert', 'pending', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000020', 'Zz 20', '2026-11-06 20:00', 'Concert', 'approved', false, true, NULL),
  ('e7e00000-0000-4000-8000-000000000021', 'Zz 21', '2026-11-06 20:00', 'Concert', 'pending', false, true,
    'e7a00000-0000-4000-8000-000000000010'),
  ('e7e00000-0000-4000-8000-000000000022', 'Zz 22', '2026-11-06 20:00', 'Concert', 'pending', false, true, NULL);

INSERT INTO public.event_organizers (event_id, organizer_id, location_id) VALUES
  ('e7e00000-0000-4000-8000-000000000001', 'e7b00000-0000-4000-8000-000000000031', NULL),
  ('e7e00000-0000-4000-8000-000000000002', 'e7b00000-0000-4000-8000-000000000031', NULL),
  ('e7e00000-0000-4000-8000-000000000004', 'e7b00000-0000-4000-8000-000000000031', NULL),
  ('e7e00000-0000-4000-8000-000000000005', 'e7b00000-0000-4000-8000-000000000031', NULL),
  ('e7e00000-0000-4000-8000-000000000006', 'e7b00000-0000-4000-8000-000000000031', NULL),
  ('e7e00000-0000-4000-8000-000000000007', 'e7b00000-0000-4000-8000-000000000032', NULL),
  ('e7e00000-0000-4000-8000-000000000008', 'e7b00000-0000-4000-8000-000000000032', NULL),
  ('e7e00000-0000-4000-8000-000000000009', 'e7b00000-0000-4000-8000-000000000033', NULL),
  ('e7e00000-0000-4000-8000-000000000010', NULL, 'e7c00000-0000-4000-8000-000000000041'),
  ('e7e00000-0000-4000-8000-000000000011', NULL, 'e7c00000-0000-4000-8000-000000000041'),
  ('e7e00000-0000-4000-8000-000000000012', NULL, 'e7c00000-0000-4000-8000-000000000042'),
  ('e7e00000-0000-4000-8000-000000000013', 'e7b00000-0000-4000-8000-000000000034', NULL),
  ('e7e00000-0000-4000-8000-000000000017', 'e7b00000-0000-4000-8000-000000000035', NULL),
  ('e7e00000-0000-4000-8000-000000000018', NULL, 'e7c00000-0000-4000-8000-000000000043'),
  ('e7e00000-0000-4000-8000-000000000020', 'e7b00000-0000-4000-8000-000000000035', NULL),
  ('e7e00000-0000-4000-8000-000000000022', NULL, 'e7c00000-0000-4000-8000-000000000044');

-- Droits ---------------------------------------------------------------------------------------------
-- Publics (anon, tout le monde) : 01 08 15 20 (publiés, ni masqués ni hors de l'app).

SELECT pg_temp.session();
SELECT pg_temp.verifie('anon : voit les publiés seulement', pg_temp.voit(), '01 08 15 20');
SELECT pg_temp.verifie('anon : ne modifie rien', pg_temp.peut('modifier'), '');
SELECT pg_temp.verifie('anon : ne supprime rien', pg_temp.peut('supprimer'), '');
SELECT pg_temp.verifie('anon : aucun lien d''organisateur', pg_temp.liens(), '');
RESET ROLE;

-- L'invité est lié à 35 (cas impossible dans l'admin) : la RLS d'event_organizers ne lui montre que les
-- liens des événements publiés, il ne voit donc pas 17 ; 20 était déjà public. Auteur de 21, il ne le voit
-- pas non plus : « Users can view their own events » demande un vrai compte.
SELECT pg_temp.session('10', invite => true);
SELECT pg_temp.verifie('invité : voit les publiés seulement', pg_temp.voit(), '01 08 15 20');
SELECT pg_temp.verifie('invité : modifie 20 (publié, son organisateur, propriétaire)', pg_temp.peut('modifier'), '20');
SELECT pg_temp.verifie('invité : ne supprime rien', pg_temp.peut('supprimer'), '');
SELECT pg_temp.verifie('invité : son lien', pg_temp.liens(), '10:35');
RESET ROLE;

SELECT pg_temp.session('02');
SELECT pg_temp.verifie('sans organisateur : voit les publiés', pg_temp.voit(), '01 08 15 20');
SELECT pg_temp.verifie('sans organisateur : ne modifie rien', pg_temp.peut('modifier'), '');
SELECT pg_temp.verifie('sans organisateur : ne supprime rien', pg_temp.peut('supprimer'), '');
SELECT pg_temp.verifie('sans organisateur : aucun lien', pg_temp.liens(), '');
RESET ROLE;

SELECT pg_temp.session('03');
SELECT pg_temp.verifie('propriétaire de 31 : voit ses événements, même masqués, refusés ou en brouillon',
  pg_temp.voit(), '01 02 04 05 06 08 15 20');
SELECT pg_temp.verifie('propriétaire de 31 : modifie ses brouillons, attentes et publiés', pg_temp.peut('modifier'),
  '01 02 04 05');
SELECT pg_temp.verifie('propriétaire de 31 : supprime ses brouillons et attentes', pg_temp.peut('supprimer'), '04 05');
SELECT pg_temp.verifie('propriétaire de 31 : ne peut pas refuser', pg_temp.statut('04', 'rejected'), 'erreur 42501');
SELECT pg_temp.verifie('propriétaire de 31 : peut publier', pg_temp.statut('04', 'approved'), 'ok');
SELECT pg_temp.verifie('propriétaire de 31 : son lien', pg_temp.liens(), '03:31');
RESET ROLE;

SELECT pg_temp.session('04');
SELECT pg_temp.verifie('éditeur de 32 : voit 07', pg_temp.voit(), '01 07 08 15 20');
SELECT pg_temp.verifie('éditeur de 32 : modifie 07 et 08', pg_temp.peut('modifier'), '07 08');
SELECT pg_temp.verifie('éditeur de 32 : ne supprime rien', pg_temp.peut('supprimer'), '');
SELECT pg_temp.verifie('éditeur de 32 : remet 08 en brouillon', pg_temp.statut('08', 'draft'), 'ok');
RESET ROLE;

SELECT pg_temp.session('05');
SELECT pg_temp.verifie('lecteur de 33 : voit 09', pg_temp.voit(), '01 08 09 15 20');
SELECT pg_temp.verifie('lecteur de 33 : ne modifie rien', pg_temp.peut('modifier'), '');
SELECT pg_temp.verifie('lecteur de 33 : ne supprime rien', pg_temp.peut('supprimer'), '');
RESET ROLE;

SELECT pg_temp.session('06');
-- u06 est aussi lié au lieu 44, qui n'organise plus : pas 22.
SELECT pg_temp.verifie('propriétaire du lieu 41 : voit 10 et 11', pg_temp.voit(), '01 08 10 11 15 20');
SELECT pg_temp.verifie('propriétaire du lieu 41 : modifie 10 et 11', pg_temp.peut('modifier'), '10 11');
SELECT pg_temp.verifie('propriétaire du lieu 41 : supprime 10 et 11', pg_temp.peut('supprimer'), '10 11');
RESET ROLE;

-- u07 n'est que lecteur du lieu 42, mais propriétaire de 34 : la jointure d'origine accepte n'importe
-- lequel de ses liens pour un lieu, il garde donc la main sur 12.
SELECT pg_temp.session('07');
SELECT pg_temp.verifie('lecteur du lieu 42 et propriétaire de 34 : voit 12 et 13', pg_temp.voit(), '01 08 12 13 15 20');
SELECT pg_temp.verifie('lecteur du lieu 42 et propriétaire de 34 : modifie 12 et 13', pg_temp.peut('modifier'), '12 13');
SELECT pg_temp.verifie('lecteur du lieu 42 et propriétaire de 34 : supprime 12 et 13', pg_temp.peut('supprimer'), '12 13');
SELECT pg_temp.verifie('lecteur du lieu 42 et propriétaire de 34 : ses liens', pg_temp.liens(), '07:34 07:42');
RESET ROLE;

SELECT pg_temp.session('08');
SELECT pg_temp.verifie('auteur : voit 14', pg_temp.voit(), '01 08 14 15 20');
SELECT pg_temp.verifie('auteur : modifie 14 (en attente), pas 15 (publié)', pg_temp.peut('modifier'), '14');
SELECT pg_temp.verifie('auteur : supprime 14', pg_temp.peut('supprimer'), '14');
SELECT pg_temp.verifie('auteur : ne publie pas 14', pg_temp.statut('14', 'approved'), 'erreur 42501');
RESET ROLE;

SELECT pg_temp.session('09');
SELECT pg_temp.verifie('auteur suspendu : voit 16', pg_temp.voit(), '01 08 15 16 20');
SELECT pg_temp.verifie('auteur suspendu : ne modifie rien', pg_temp.peut('modifier'), '');
SELECT pg_temp.verifie('auteur suspendu : ne supprime rien', pg_temp.peut('supprimer'), '');
RESET ROLE;

SELECT pg_temp.session('01');
SELECT pg_temp.verifie('admin : voit tout', pg_temp.voit(),
  '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22');
SELECT pg_temp.verifie('admin : modifie tout', pg_temp.peut('modifier'),
  '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22');
SELECT pg_temp.verifie('admin : supprime tout', pg_temp.peut('supprimer'),
  '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22');
SELECT pg_temp.verifie('admin : refuse 04', pg_temp.statut('04', 'rejected'), 'ok');
SELECT pg_temp.verifie('admin : tous les liens', pg_temp.liens(), '03:31 04:32 05:33 06:41 06:44 07:34 07:42 10:35');
RESET ROLE;

-- Forme des politiques -------------------------------------------------------------------------------
-- Dans les politiques de lecture, modification et suppression d'events et de user_organizers, chaque appel
-- qui ne dépend pas de la ligne est une sous-requête « ( SELECT f() AS f) » (calculée une fois par requête),
-- et aucun EXISTS corrélé (rejouable à chaque ligne) ne reste.

SELECT pg_temp.verifie('politiques : aucun appel par ligne',
  (SELECT coalesce(string_agg(tablename || ' « ' || policyname || ' »', ', ' ORDER BY tablename, policyname), '')
   FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('events', 'user_organizers')
     AND cmd <> 'INSERT'
     AND regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
           '\( SELECT [a-z_.]+\(\) AS [a-z_]+\)', '', 'g')
         ~ '(is_user_admin|auth\.uid|is_real_authenticated_user|can_use_ugc_features)\(\)|EXISTS'),
  '');

-- Et dans le plan, aucun sous-plan n'est rejoué à chaque ligne (en prod, avant la migration, l'EXISTS
-- tournait une fois par événement : loops=364) : en anon comme pour un organisateur, chaque SubPlan et
-- chaque InitPlan tourne une fois au plus.
CREATE FUNCTION pg_temp.boucles_max() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  plan jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM public.events' INTO plan;
  RETURN (SELECT max(v::text::numeric)::text FROM jsonb_path_query(plan, 'strict $.** ? (@."Parent Relationship" == "SubPlan" || @."Parent Relationship" == "InitPlan")."Actual Loops"') v);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.boucles_max() TO anon, authenticated;

SELECT pg_temp.session();
SELECT pg_temp.verifie('anon : chaque sous-plan tourne une fois au plus', pg_temp.boucles_max(), '1');
RESET ROLE;
SELECT pg_temp.session('07');
SELECT pg_temp.verifie('organisateur : chaque sous-plan tourne une fois au plus', pg_temp.boucles_max(), '1');
RESET ROLE;

ROLLBACK;
