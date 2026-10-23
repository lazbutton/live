-- Ce que la base fait d'un lieu, d'un organisateur et d'une salle créés par l'agent de collecte
-- (lib/agent/locations.ts, lib/agent/organizers.ts), sur les cas de la relecture du 2026-10-23 :
--   - nom mis en forme par format_entity_label (20261020223000) ;
--   - ville tirée de l'adresse par sync_location_city, reprise par les événements (sync_event_city) : l'agent
--     enregistre le libellé de la Base Adresse Nationale, avec son code postal ;
--   - source de collecte créée avec un organisateur ou un lieu-organisateur qui a un lien (20260429105500,
--     20260429114500), que l'agent met en pause (settleCreatedOwnerSource) ;
--   - salle d'un lieu rattachée à une séance (events.room_id).
--
-- Sur une base jetable avec toutes les migrations : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des lieux.

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.locations) THEN
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

-- Lieu et sa ville, sa source de collecte (« statut | type | adresse | à revoir »).
CREATE FUNCTION pg_temp.lieu(lieu uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT l.name || ' | ' || coalesce(c.label, '(sans ville)')
  FROM public.locations l LEFT JOIN public.cities c ON c.id = l.city_id
  WHERE l.id = lieu
$$;

CREATE FUNCTION pg_temp.source(organisateur uuid, lieu uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(
    (SELECT s.status || ' | ' || s.type || ' | ' || s.url || ' | ' || (s.next_scan_at <= now())::text
     FROM public.intake_sources_view s
     WHERE s.organizer_id IS NOT DISTINCT FROM organisateur AND s.organizer_location_id IS NOT DISTINCT FROM lieu),
    '(pas de source)')
$$;

-- 1. Lieux créés par l'agent : nom mis en forme, ville d'après le code postal de l'adresse de la BAN.
INSERT INTO public.locations (id, name, address, latitude, longitude) VALUES
  ('1a000000-0000-4000-8000-0000000000a1', 'l''improviste bar', '119 Rue de Bourgogne 45000 Orléans', 47.900413, 1.913223),
  ('1a000000-0000-4000-8000-0000000000a2', 'théâtre gérard-philipe', 'Place Sainte-Beuve 45100 Orléans', 47.837612, 1.936918),
  ('1a000000-0000-4000-8000-0000000000a3', 'La Cave Végétale', 'Rue Jean Hupeau 45000 Orléans', 47.898333, 1.904766),
  ('1a000000-0000-4000-8000-0000000000a4', 'Salle des fêtes', 'Place de la Liberté 45770 Saran', 47.9517, 1.8745);
SELECT pg_temp.verifie('lieu : 119 rue de Bourgogne', pg_temp.lieu('1a000000-0000-4000-8000-0000000000a1'), 'L''Improviste Bar | Orléans');
SELECT pg_temp.verifie('lieu : place Sainte-Beuve, 45100', pg_temp.lieu('1a000000-0000-4000-8000-0000000000a2'), 'Théâtre Gérard-Philipe | Orléans');
SELECT pg_temp.verifie('lieu : voie sans numéro', pg_temp.lieu('1a000000-0000-4000-8000-0000000000a3'), 'La Cave Végétale | Orléans');
SELECT pg_temp.verifie('lieu : une autre commune', pg_temp.lieu('1a000000-0000-4000-8000-0000000000a4'), 'Salle des Fêtes | Saran');
SELECT pg_temp.verifie('villes : une seule Orléans', (SELECT count(*)::text FROM public.cities WHERE slug = 'orleans'), '1');

-- Témoins : pourquoi l'agent enregistre l'adresse de la BAN, jamais celle lue sur la page.
SAVEPOINT temoins;
-- Sans code postal, l'adresse entière devient une ville (« place sainte beuve orleans », 20261021230000).
INSERT INTO public.locations (id, name, address) VALUES ('1a000000-0000-4000-8000-0000000000b1', 'Témoin', 'place Sainte-Beuve Orléans');
SELECT pg_temp.verifie('témoin : adresse sans code postal → ville fausse',
  pg_temp.lieu('1a000000-0000-4000-8000-0000000000b1'), 'Témoin | place Sainte-Beuve Orléans');
-- En capitales, la commune existante est renommée (upsert_city, comme « SAINT DENIS EN VAL »).
INSERT INTO public.locations (id, name, address) VALUES ('1a000000-0000-4000-8000-0000000000b2', 'Témoin 2', '1 rue Alexandre Avisse, 45000 ORLEANS');
SELECT pg_temp.verifie('témoin : adresse en capitales → Orléans renommée', (SELECT label FROM public.cities WHERE slug = 'orleans'), 'ORLEANS');
ROLLBACK TO SAVEPOINT temoins;
SELECT pg_temp.verifie('villes : Orléans intacte', (SELECT label FROM public.cities WHERE slug = 'orleans'), 'Orléans');

-- 2. Casse des noms : celle de format_entity_label, que l'outil renvoie telle qu'enregistrée.
INSERT INTO public.organizers (id, name, website_url) VALUES
  ('5b000000-0000-4000-8000-0000000000a1', 'FabriCode', 'https://fabricode.art/');
INSERT INTO public.organizers (id, name, instagram_url) VALUES
  ('5b000000-0000-4000-8000-0000000000a2', 'orlin''s comedy', 'https://www.instagram.com/orlins_exemple/');
INSERT INTO public.organizers (id, name) VALUES
  ('5b000000-0000-4000-8000-0000000000a3', 'ART-THÉRAPIE');
SELECT pg_temp.verifie('organisateurs : noms enregistrés',
  (SELECT string_agg(name, '|' ORDER BY id) FROM public.organizers
   WHERE id IN ('5b000000-0000-4000-8000-0000000000a1', '5b000000-0000-4000-8000-0000000000a2', '5b000000-0000-4000-8000-0000000000a3')),
  -- « FabriCode » perd sa capitale intérieure : la règle ne garde que les sigles de 4 lettres au plus.
  'Fabricode|Orlin''s Comedy|Art-Thérapie');

-- 3. Sources de collecte : un organisateur avec un lien en reçoit une, active et à revoir tout de suite.
SELECT pg_temp.verifie('source : organisateur avec un site',
  pg_temp.source('5b000000-0000-4000-8000-0000000000a1', NULL), 'active | website | https://fabricode.art/ | true');
SELECT pg_temp.verifie('source : organisateur avec un compte Instagram',
  pg_temp.source('5b000000-0000-4000-8000-0000000000a2', NULL), 'active | instagram | https://www.instagram.com/orlins_exemple/ | true');
SELECT pg_temp.verifie('source : organisateur sans lien', pg_temp.source('5b000000-0000-4000-8000-0000000000a3', NULL), '(pas de source)');

-- L'agent la met en pause (settleCreatedOwnerSource) : elle ne revient plus dans « À revoir ».
UPDATE public.event_sources
SET status = 'paused', notes = '[agent] Fiche créée par la collecte : source en pause, à réactiver pour la suivre.'
WHERE organizer_id = '5b000000-0000-4000-8000-0000000000a1';
SELECT pg_temp.verifie('source : en pause par l''agent',
  pg_temp.source('5b000000-0000-4000-8000-0000000000a1', NULL), 'paused | website | https://fabricode.art/ | true');
-- Changer un lien de la fiche la réactive (trigger), comme dans l'admin.
UPDATE public.organizers SET instagram_url = 'https://www.instagram.com/fabricode_exemple/' WHERE id = '5b000000-0000-4000-8000-0000000000a1';
SELECT pg_temp.verifie('source : réactivée quand un lien change',
  pg_temp.source('5b000000-0000-4000-8000-0000000000a1', NULL), 'active | website | https://fabricode.art/ | true');

-- Un lieu n'en reçoit une que s'il est lieu-organisateur et qu'il a un lien.
UPDATE public.locations SET instagram_url = 'https://www.instagram.com/improviste_exemple/' WHERE id = '1a000000-0000-4000-8000-0000000000a1';
SELECT pg_temp.verifie('source : lieu avec un lien, pas lieu-organisateur',
  pg_temp.source(NULL, '1a000000-0000-4000-8000-0000000000a1'), '(pas de source)');
INSERT INTO public.locations (id, name, address, is_organizer, instagram_url) VALUES
  ('1a000000-0000-4000-8000-0000000000a5', 'Les Frangins', '14 Rue du Grenier à Sel 45000 Orléans', true, 'https://www.instagram.com/frangins_exemple/');
SELECT pg_temp.verifie('source : lieu-organisateur avec un lien',
  pg_temp.source(NULL, '1a000000-0000-4000-8000-0000000000a5'), 'active | instagram | https://www.instagram.com/frangins_exemple/ | true');

-- 4. Salle d'un lieu et séance qui y est rattachée : la ville de la séance est celle du lieu.
INSERT INTO public.locations (id, name, address) VALUES
  ('1a000000-0000-4000-8000-0000000000a6', 'Théâtre d''Orléans', 'Boulevard Pierre Ségelle 45000 Orléans');
INSERT INTO public.rooms (id, location_id, name) VALUES
  ('2c000000-0000-4000-8000-0000000000a1', '1a000000-0000-4000-8000-0000000000a6', 'Plateau Barrault');
INSERT INTO public.events (id, title, date, category, location_id, room_id, address, status) VALUES
  ('e1000000-0000-4000-8000-0000000000a1', 'Loto3000', '2027-02-23 19:30:00+00', 'spectacle',
   '1a000000-0000-4000-8000-0000000000a6', '2c000000-0000-4000-8000-0000000000a1', 'Boulevard Pierre Ségelle 45000 Orléans', 'pending');
SELECT pg_temp.verifie('séance : salle et ville du lieu',
  (SELECT r.name || ' | ' || c.label FROM public.events e
   JOIN public.rooms r ON r.id = e.room_id JOIN public.cities c ON c.id = e.city_id
   WHERE e.id = 'e1000000-0000-4000-8000-0000000000a1'),
  'Plateau Barrault | Orléans');

ROLLBACK;
