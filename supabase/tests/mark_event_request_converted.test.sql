-- Tests de mark_event_request_converted() (migration 20261024170000_mark_event_request_converted).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : npm run db:test. Jamais en prod :
-- tout se passe dans une transaction annulée, mais le script s'arrête si la base contient des événements.
--
-- Ce qu'on prouve, pour une demande complétée dans le formulaire d'événement du back-office (l'événement est
-- déjà créé par l'admin) :
-- - l'événement devient communautaire, garde l'accord et, avec l'accord seulement, le nom public : « Proposé
--   par Camille Martin », sinon « Suggestion communautaire » ; jamais l'adresse e-mail qu'envoyaient les
--   versions précédentes de l'app ;
-- - il passe au demandeur (created_by), qui le retrouve dans « Mes suggestions » ;
-- - la demande passe en converted, liée à l'événement, relue par l'admin ;
-- - rejouer l'appel ne change rien ; une demande déjà traitée, un événement inconnu ou créé par quelqu'un d'autre
--   que l'admin qui appelle, un appel hors admin sont refusés et rien n'est écrit ; anon ne peut pas l'appeler.

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events) THEN
    RAISE EXCEPTION 'Base non vide : ces tests se lancent sur une base jetable (npm run db:test), jamais en prod.';
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

-- Ids lisibles : demande n → cb10…0n, événement n → cb20…0n.
CREATE FUNCTION pg_temp.demande(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('cb100000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.evenement(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('cb200000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

-- L'appel, avec le rôle et le jeton courants : « ok », ou le code et le message de l'erreur (ce qu'il avait
-- écrit est alors annulé).
CREATE FUNCTION pg_temp.marque(demande_n int, evenement_n int) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.mark_event_request_converted(pg_temp.demande(demande_n), pg_temp.evenement(evenement_n));
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE || ' : ' || SQLERRM;
END $$;

-- Ce que la fiche de l'app en montre : « communautaire | accord | nom public ».
CREATE FUNCTION pg_temp.attribution(n int) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(' | ', community_submission::text, community_attribution_opt_in::text,
    coalesce(community_contributor_label, '∅'))
  FROM public.events WHERE id = pg_temp.evenement(n)
$$;

-- La demande : « statut | événement lié | relue par ».
CREATE FUNCTION pg_temp.etat_demande(n int) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(' | ', status, coalesce(converted_event_id::text, '∅'), coalesce(reviewed_by::text, '∅'))
  FROM public.user_requests WHERE id = pg_temp.demande(n)
$$;

-- Deux admins (rôle dans app_metadata), un membre sans nom (connexion Apple) et un membre nommé.
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('cb000000-0000-4000-8000-000000000001', 'admin@test.local', '{"role":"admin"}'::jsonb, '{}'::jsonb),
  ('cb000000-0000-4000-8000-000000000004', 'admin2@test.local', '{"role":"admin"}'::jsonb, '{}'::jsonb),
  ('cb000000-0000-4000-8000-000000000002', 'membre@example.org', '{"provider":"apple"}'::jsonb, '{}'::jsonb),
  ('cb000000-0000-4000-8000-000000000003', 'camille@example.org', '{"provider":"google"}'::jsonb,
    '{"full_name":"Camille Martin"}'::jsonb);

-- Les demandes : (n, type, statut, auteur, nom envoyé, accord). « Depuis un lien » (event_from_url), que
-- convert_event_request_to_event refuse, et des affiches seules (event_creation, poster_only).
INSERT INTO public.user_requests (id, request_type, status, requested_by, contributor_display_name,
  community_attribution_opt_in, event_data, location_name, source_url)
SELECT
  pg_temp.demande(n), type, statut,
  ('cb000000-0000-4000-8000-0000000000' || auteur)::uuid,
  nom, accord,
  CASE WHEN type = 'event_creation'
    THEN jsonb_build_object('request_type', 'poster_only', 'image_url', 'https://example.org/affiche.jpg')
  END,
  CASE WHEN type = 'event_from_url' THEN 'Le 108' END,
  CASE WHEN type = 'event_from_url' THEN 'https://example.org/concert' END
FROM (VALUES
  (1, 'event_from_url', 'pending',  '03', 'Camille Martin',     true),
  (2, 'event_from_url', 'pending',  '02', 'membre@example.org', true),
  (3, 'event_creation', 'pending',  '03', 'Camille Martin',     false),
  (4, 'event_creation', 'pending',  '02', NULL,                 true),
  (5, 'event_from_url', 'pending',  '03', '  Camille Martin ',  true),
  (6, 'event_from_url', 'rejected', '03', 'Camille Martin',     true),
  (8, 'event_from_url', 'pending',  '03', 'Camille Martin',     true)
) AS demandes (n, type, statut, auteur, nom, accord);

-- Les événements tels que le formulaire les crée : par l'admin, sans attribution. Le 10 vient de la collecte
-- (sans créateur).
INSERT INTO public.events (id, title, date, category, status, created_by)
SELECT pg_temp.evenement(n), 'Événement ' || n, '2026-11-10 20:00+00', 'Concert',
  CASE WHEN n = 1 THEN 'approved' ELSE 'pending' END,
  CASE WHEN n <= 9 THEN 'cb000000-0000-4000-8000-000000000001'::uuid END
FROM generate_series(1, 10) AS n;

-- 1. Les droits : authenticated seulement.
SELECT pg_temp.verifie('anon ne peut pas l''appeler, authenticated si',
  has_function_privilege('anon', 'public.mark_event_request_converted(uuid, uuid)', 'execute')::text || ' '
  || has_function_privilege('authenticated', 'public.mark_event_request_converted(uuid, uuid)', 'execute')::text,
  'false true');

-- 2. Hors admin : le membre nommé, sur sa propre demande. Refusé, rien d'écrit.
SELECT set_config('request.jwt.claims', json_build_object(
  'role', 'authenticated', 'sub', 'cb000000-0000-4000-8000-000000000003')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.verifie('hors admin : refusé',
  pg_temp.marque(1, 1), 'erreur 42501 : Seuls les administrateurs peuvent marquer une demande convertie');
RESET ROLE;
SELECT pg_temp.verifie('hors admin : ni l''événement ni la demande ne changent',
  pg_temp.attribution(1) || ' / ' || pg_temp.etat_demande(1), 'false | false | ∅ / pending | ∅ | ∅');

-- 3. L'admin complète les demandes 1 à 5 dans le formulaire.
SELECT set_config('request.jwt.claims', json_build_object(
  'role', 'authenticated', 'sub', 'cb000000-0000-4000-8000-000000000001')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.verifie('admin : les cinq demandes marquées',
  (SELECT string_agg(pg_temp.marque(n, n), ', ' ORDER BY n) FROM generate_series(1, 5) AS n),
  'ok, ok, ok, ok, ok');
RESET ROLE;

SELECT pg_temp.verifie('depuis un lien, nommé, avec l''accord : « Proposé par Camille Martin »',
  pg_temp.attribution(1), 'true | true | Camille Martin');
SELECT pg_temp.verifie('sans nom (ancienne app : l''e-mail envoyé), avec l''accord : « Suggestion communautaire »',
  pg_temp.attribution(2), 'true | true | ∅');
SELECT pg_temp.verifie('affiche seule, nommé, sans l''accord : « Suggestion communautaire »',
  pg_temp.attribution(3), 'true | false | ∅');
SELECT pg_temp.verifie('affiche seule, sans nom envoyé : « Suggestion communautaire »',
  pg_temp.attribution(4), 'true | true | ∅');
SELECT pg_temp.verifie('le nom sans les espaces autour',
  pg_temp.attribution(5), 'true | true | Camille Martin');
SELECT pg_temp.verifie('aucune adresse e-mail comme nom public',
  (SELECT count(*)::text FROM public.events WHERE strpos(community_contributor_label, '@') > 0), '0');

SELECT pg_temp.verifie('la demande : convertie, liée à son événement, relue par l''admin',
  pg_temp.etat_demande(1),
  'converted | ' || pg_temp.evenement(1) || ' | cb000000-0000-4000-8000-000000000001');
SELECT pg_temp.verifie('les dates de conversion et de relecture posées',
  (SELECT (converted_at IS NOT NULL AND reviewed_at IS NOT NULL)::text
   FROM public.user_requests WHERE id = pg_temp.demande(3)),
  'true');
SELECT pg_temp.verifie('l''événement passe au demandeur, garde son statut et le reste de sa fiche',
  (SELECT concat_ws(' | ', status, title, created_by) FROM public.events WHERE id = pg_temp.evenement(1)),
  'approved | Événement 1 | cb000000-0000-4000-8000-000000000003');
SELECT pg_temp.verifie('le membre sans nom aussi : l''événement est à lui (« Bloquer aussi l''auteur » le vise, pas l''admin)',
  (SELECT created_by::text FROM public.events WHERE id = pg_temp.evenement(2)),
  'cb000000-0000-4000-8000-000000000002');

-- 4. Rejouer : un autre admin rappelle la même paire (l'événement est déjà au demandeur). Rien ne change, la
--    demande reste relue par le premier.
SELECT set_config('request.jwt.claims', json_build_object(
  'role', 'authenticated', 'sub', 'cb000000-0000-4000-8000-000000000004')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.verifie('rejouer : accepté', pg_temp.marque(1, 1), 'ok');
RESET ROLE;
SELECT pg_temp.verifie('rejouer : rien ne change',
  pg_temp.attribution(1) || ' / ' || pg_temp.etat_demande(1),
  'true | true | Camille Martin / converted | ' || pg_temp.evenement(1)
    || ' | cb000000-0000-4000-8000-000000000001');

-- 5. Les refus, par le second admin : rien n'est écrit.
SET LOCAL ROLE authenticated;
SELECT pg_temp.verifie('demande déjà convertie en un autre événement : refusé',
  pg_temp.marque(1, 9), 'erreur P0001 : Demande d''événement non trouvée ou déjà traitée');
SELECT pg_temp.verifie('demande renvoyée au contributeur (rejected) : refusé',
  pg_temp.marque(6, 6), 'erreur P0001 : Demande d''événement non trouvée ou déjà traitée');
SELECT pg_temp.verifie('demande inconnue : refusé',
  pg_temp.marque(99, 7), 'erreur P0001 : Demande d''événement non trouvée ou déjà traitée');
SELECT pg_temp.verifie('événement inconnu : refusé',
  pg_temp.marque(8, 99), 'erreur P0001 : Événement non trouvé, ou créé par quelqu''un d''autre');
SELECT pg_temp.verifie('événement créé par un autre admin : refusé (il ne passe pas au demandeur)',
  pg_temp.marque(8, 7), 'erreur P0001 : Événement non trouvé, ou créé par quelqu''un d''autre');
SELECT pg_temp.verifie('événement de la collecte, sans créateur : refusé',
  pg_temp.marque(8, 10), 'erreur P0001 : Événement non trouvé, ou créé par quelqu''un d''autre');
RESET ROLE;
SELECT pg_temp.verifie('refus : les événements 6, 7, 9 et 10 restent sans attribution',
  pg_temp.attribution(6) || ' / ' || pg_temp.attribution(7) || ' / ' || pg_temp.attribution(9)
    || ' / ' || pg_temp.attribution(10),
  'false | false | ∅ / false | false | ∅ / false | false | ∅ / false | false | ∅');
SELECT pg_temp.verifie('refus : les événements 7 et 10 gardent leur créateur',
  (SELECT string_agg(coalesce(created_by::text, '∅'), ' / ' ORDER BY title) FROM public.events
   WHERE id IN (pg_temp.evenement(7), pg_temp.evenement(10))),
  '∅ / cb000000-0000-4000-8000-000000000001');
SELECT pg_temp.verifie('refus : la demande 1 reste liée à son événement, 6 et 8 inchangées',
  pg_temp.etat_demande(1) || ' / ' || pg_temp.etat_demande(6) || ' / ' || pg_temp.etat_demande(8),
  'converted | ' || pg_temp.evenement(1) || ' | cb000000-0000-4000-8000-000000000001'
    || ' / rejected | ∅ | ∅ / pending | ∅ | ∅');

-- 6. « Mes suggestions » (ContributionsRepository.userEvents : events où created_by = soi), sous la RLS : chaque
--    membre y retrouve les événements de ses demandes, publiés ou en attente.
SELECT set_config('request.jwt.claims', json_build_object(
  'role', 'authenticated', 'sub', 'cb000000-0000-4000-8000-000000000003')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.verifie('Mes suggestions de Camille : ses trois demandes complétées',
  (SELECT string_agg(title, ', ' ORDER BY title) FROM public.events WHERE created_by = (SELECT auth.uid())),
  'Événement 1, Événement 3, Événement 5');
SELECT set_config('request.jwt.claims', json_build_object(
  'role', 'authenticated', 'sub', 'cb000000-0000-4000-8000-000000000002')::text, true);
SELECT pg_temp.verifie('Mes suggestions du membre sans nom : ses deux demandes complétées',
  (SELECT string_agg(title, ', ' ORDER BY title) FROM public.events WHERE created_by = (SELECT auth.uid())),
  'Événement 2, Événement 4');
RESET ROLE;

ROLLBACK;
