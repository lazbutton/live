-- Tests de l'attribution publique d'une proposition (migration 20261024140000_community_attribution_without_email).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : npm run db:test. Jamais en prod :
-- tout se passe dans une transaction annulée, mais le script s'arrête si la base contient des événements.
--
-- Ce qu'on prouve :
-- - public_contributor_label : le nom sans les espaces autour ; rien s'il est vide ou contient « @ » ;
-- - convert_event_request_to_event marque l'événement communautaire, garde l'accord et, avec l'accord
--   seulement, le nom public : jamais l'adresse e-mail qu'envoyaient les versions précédentes de l'app ;
-- - le prix libre de 20260415213000 tient toujours ;
-- - la contrainte refuse une adresse e-mail comme nom public d'un événement, quel que soit le chemin.

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

-- 1. Le nom public.
SELECT pg_temp.verifie('nom : sans les espaces autour', public.public_contributor_label('  Camille Martin '), 'Camille Martin');
SELECT pg_temp.verifie('nom : une adresse e-mail n''en est pas un', public.public_contributor_label('membre@example.org'), NULL);
SELECT pg_temp.verifie('nom : « @ » ailleurs non plus', public.public_contributor_label('Camille @ Orléans'), NULL);
SELECT pg_temp.verifie('nom : vide', public.public_contributor_label('   '), NULL);
SELECT pg_temp.verifie('nom : absent', public.public_contributor_label(NULL), NULL);

-- 2. La conversion. Un admin (rôle dans app_metadata), un membre sans nom et un membre nommé.
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('ca000000-0000-4000-8000-000000000001', 'admin@test.local', '{"role":"admin"}'::jsonb, '{}'::jsonb),
  ('ca000000-0000-4000-8000-000000000002', 'membre@example.org', '{"provider":"apple"}'::jsonb, '{}'::jsonb),
  ('ca000000-0000-4000-8000-000000000003', 'camille@example.org', '{"provider":"google"}'::jsonb,
    '{"full_name":"Camille Martin"}'::jsonb);

-- Les demandes : (n, auteur, nom envoyé, accord, données).
INSERT INTO public.user_requests (id, request_type, status, requested_by, contributor_display_name,
  community_attribution_opt_in, event_data)
SELECT
  ('ca100000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  'event_creation', 'pending',
  ('ca000000-0000-4000-8000-0000000000' || auteur)::uuid,
  nom, accord,
  jsonb_build_object('title', 'Demande ' || n, 'description', '', 'date', '2026-11-10T20:00:00',
    'category', 'Concert', 'price', 12) || extra
FROM (VALUES
  (1, '03', 'Camille Martin',     true,  '{}'::jsonb),
  (2, '02', 'membre@example.org', true,  '{}'::jsonb),
  (3, '03', 'Camille Martin',     false, '{}'::jsonb),
  (4, '02', NULL,                 true,  '{}'::jsonb),
  (5, '03', '  Camille Martin ',  true,  '{"is_pay_what_you_want": true}'::jsonb)
) AS demandes (n, auteur, nom, accord, extra);

SELECT set_config('request.jwt.claims', json_build_object(
  'role', 'authenticated',
  'sub', 'ca000000-0000-4000-8000-000000000001'
)::text, true);

CREATE TEMP TABLE converti ON COMMIT DROP AS
SELECT n, public.convert_event_request_to_event(
  ('ca100000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid) AS event_id
FROM generate_series(1, 5) AS n;

CREATE FUNCTION pg_temp.evenement(numero int) RETURNS public.events
LANGUAGE sql AS $$
  SELECT e.* FROM public.events e JOIN converti c ON c.event_id = e.id WHERE c.n = numero
$$;

SELECT pg_temp.verifie('nommé, avec l''accord : « Proposé par Camille Martin »',
  (SELECT concat_ws(' | ', community_submission::text, community_attribution_opt_in::text,
     community_contributor_label)
   FROM pg_temp.evenement(1)),
  'true | true | Camille Martin');
SELECT pg_temp.verifie('sans nom (ancienne app : l''e-mail envoyé), avec l''accord : aucun nom public',
  (SELECT concat_ws(' | ', community_submission::text, community_attribution_opt_in::text,
     coalesce(community_contributor_label, '∅'))
   FROM pg_temp.evenement(2)),
  'true | true | ∅');
SELECT pg_temp.verifie('nommé, sans l''accord : aucun nom public',
  (SELECT concat_ws(' | ', community_submission::text, community_attribution_opt_in::text,
     coalesce(community_contributor_label, '∅'))
   FROM pg_temp.evenement(3)),
  'true | false | ∅');
SELECT pg_temp.verifie('sans nom envoyé : aucun nom public',
  (SELECT coalesce(community_contributor_label, '∅') FROM pg_temp.evenement(4)), '∅');
SELECT pg_temp.verifie('le nom sans les espaces autour',
  (SELECT community_contributor_label FROM pg_temp.evenement(5)), 'Camille Martin');
SELECT pg_temp.verifie('aucune adresse e-mail dans les événements convertis',
  (SELECT count(*)::text FROM public.events WHERE strpos(community_contributor_label, '@') > 0), '0');

SELECT pg_temp.verifie('l''événement : en attente, créé par l''auteur, au prix de la demande',
  (SELECT concat_ws(' | ', status, created_by, price_min, is_pay_what_you_want::text) FROM pg_temp.evenement(1)),
  'pending | ca000000-0000-4000-8000-000000000003 | 12.00 | false');
SELECT pg_temp.verifie('prix libre : pas de montant',
  (SELECT concat_ws(' | ', coalesce(price_min::text, '∅'), is_pay_what_you_want::text) FROM pg_temp.evenement(5)),
  '∅ | true');
SELECT pg_temp.verifie('la demande : convertie, liée à son événement',
  (SELECT concat_ws(' | ', r.status, (r.converted_event_id = c.event_id)::text, r.reviewed_by)
   FROM public.user_requests r JOIN converti c
     ON r.id = ('ca100000-0000-4000-8000-0000000000' || lpad(c.n::text, 2, '0'))::uuid
   WHERE c.n = 2),
  'converted | true | ca000000-0000-4000-8000-000000000001');

-- Hors admin : refusé, comme avant.
INSERT INTO public.user_requests (id, request_type, status, requested_by, contributor_display_name,
  community_attribution_opt_in, event_data)
VALUES ('ca100000-0000-4000-8000-000000000099', 'event_creation', 'pending',
  'ca000000-0000-4000-8000-000000000003', 'Camille Martin', true,
  '{"title":"Demande 99","date":"2026-11-10T20:00:00","category":"Concert"}'::jsonb);
SELECT set_config('request.jwt.claims', json_build_object(
  'role', 'authenticated',
  'sub', 'ca000000-0000-4000-8000-000000000003'
)::text, true);
DO $$
BEGIN
  PERFORM public.convert_event_request_to_event('ca100000-0000-4000-8000-000000000099');
  RAISE EXCEPTION 'ÉCHEC un membre convertit sa propre demande';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'ÉCHEC%' THEN RAISE; END IF;
  RAISE NOTICE 'ok  hors admin : conversion refusée';
END $$;

-- 3. La contrainte, quel que soit le chemin (formulaire, mise à jour directe).
DO $$
BEGIN
  BEGIN
    INSERT INTO public.events (title, date, category, status, community_submission,
      community_attribution_opt_in, community_contributor_label)
    VALUES ('Saisie', '2026-11-10 20:00+00', 'Concert', 'pending', true, true, 'membre@example.org');
    RAISE EXCEPTION 'ÉCHEC une adresse e-mail acceptée comme nom public';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  insertion d''une adresse e-mail comme nom public refusée';
  END;
  BEGIN
    UPDATE public.events SET community_contributor_label = 'membre@example.org'
    WHERE id = (SELECT event_id FROM converti WHERE n = 1);
    RAISE EXCEPTION 'ÉCHEC une adresse e-mail posée comme nom public';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  mise à jour vers une adresse e-mail refusée';
  END;
END $$;

ROLLBACK;
