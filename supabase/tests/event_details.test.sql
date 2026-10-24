-- Tests des fiches plus riches : event_genres, events.genre_ids, audience, min_age, booking, et le jeune public
-- recalculé (migration 20261024170000_event_genres_audience_booking.sql).
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

-- Les noms des genres d'un événement, dans l'ordre de genre_ids.
CREATE FUNCTION pg_temp.genres(evenement uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(g.name, ', ' ORDER BY o.n), '∅')
  FROM public.events AS e
  CROSS JOIN LATERAL unnest(e.genre_ids) WITH ORDINALITY AS o(id, n)
  JOIN public.event_genres AS g ON g.id = o.id
  WHERE e.id = evenement
$$;

-- Une écriture refusée : le code d'erreur (23514 : contrainte CHECK ; 42501 : RLS), sans arrêter le fichier.
CREATE FUNCTION pg_temp.refus(requete text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE requete;
  RETURN 'accepté';
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE;
END $$;

CREATE FUNCTION pg_temp.session(compte text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'role', 'authenticated',
    'sub', 'ad000000-0000-4000-8000-0000000000' || compte
  )::text, true);
END $$;

-- Les listes de départ, pour les catégories qu'a une base neuve (la baseline n'a pas encore « Spectacle »).
SELECT pg_temp.verifie('listes de départ',
  (SELECT string_agg(c.name || ' ' || n, ', ' ORDER BY c.name)
   FROM (SELECT category_id, count(*) AS n FROM public.event_genres GROUP BY category_id) AS g
   JOIN public.categories AS c ON c.id = g.category_id),
  'Atelier 6, Cinéma 4, Concert 8, Danse 4');
SELECT pg_temp.verifie('les phrases, apostrophe droite',
  (SELECT string_agg(phrase, ', ' ORDER BY display_order) FROM public.event_genres
   WHERE category_id = public.resolve_event_category('Concert') AND display_order <= 4),
  'le rock, le jazz, le rap et le hip-hop, l''électro');

-- Jeu d'essai : Spectacle (Théâtre, Humour, Impro inactif), Concert (Rock, Jazz), Festival sans genre ; des noms à
-- part (categories.name est unique, la base neuve a déjà un Concert).
INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('ca000000-0000-4000-8000-000000000001', 'Spectacle (test)', true, 101),
  ('ca000000-0000-4000-8000-000000000002', 'Concert (test)', true, 102),
  ('ca000000-0000-4000-8000-000000000003', 'Festival (test)', true, 103);

INSERT INTO public.event_genres (id, category_id, name, phrase, display_order, is_active) VALUES
  ('0e000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'Théâtre', 'le théâtre', 1, true),
  ('0e000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000001', 'Humour', 'l''humour', 2, true),
  ('0e000000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-000000000001', 'Impro', 'l''impro', 3, false),
  ('0e000000-0000-4000-8000-000000000004', 'ca000000-0000-4000-8000-000000000002', 'Rock', 'le rock', 1, true),
  ('0e000000-0000-4000-8000-000000000005', 'ca000000-0000-4000-8000-000000000002', 'Jazz', 'le jazz', 2, true);

SELECT pg_temp.verifie('un nom par catégorie, casse et espaces ignorés',
  pg_temp.refus($q$INSERT INTO public.event_genres (category_id, name, phrase)
    VALUES ('ca000000-0000-4000-8000-000000000001', ' humour ', 'l''humour')$q$),
  'erreur 23505');
SELECT pg_temp.verifie('le même nom dans une autre catégorie',
  pg_temp.refus($q$INSERT INTO public.event_genres (category_id, name, phrase, display_order)
    VALUES ('ca000000-0000-4000-8000-000000000003', 'Humour', 'l''humour', 9)$q$),
  'accepté');
DELETE FROM public.event_genres WHERE category_id = 'ca000000-0000-4000-8000-000000000003';
SELECT pg_temp.verifie('une phrase est exigée',
  pg_temp.refus($q$INSERT INTO public.event_genres (category_id, name, phrase)
    VALUES ('ca000000-0000-4000-8000-000000000001', 'Magie', ' ')$q$),
  'erreur 23514');

-- 1. Un événement sans les nouveaux champs : ce qu'il avait avant la migration.
INSERT INTO public.events (id, title, date, category, status) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'Sans rien', '2026-11-07 20:30+00', 'ca000000-0000-4000-8000-000000000001', 'approved');
SELECT pg_temp.verifie('par défaut : aucun genre, rien de connu, pas à confirmer, pas jeune public',
  (SELECT cardinality(genre_ids) || ' ' || coalesce(audience, '∅') || ' ' || coalesce(min_age::text, '∅') || ' '
     || coalesce(booking, '∅') || ' ' || details_to_confirm || ' ' || is_young_audience
   FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000001'),
  '0 ∅ ∅ ∅ false false');

-- 2. Les genres : ceux de la catégorie, chacun une fois, dans l'ordre de la liste.
INSERT INTO public.events (id, title, date, category, status, genre_ids) VALUES
  ('e0000000-0000-4000-8000-000000000002', 'Plateau', '2026-11-07 20:30+00', 'ca000000-0000-4000-8000-000000000001', 'approved',
   ARRAY['0e000000-0000-4000-8000-000000000002', '0e000000-0000-4000-8000-000000000001',
         '0e000000-0000-4000-8000-000000000002', '0e000000-0000-4000-8000-000000000005',
         'ffffffff-0000-4000-8000-000000000000']::uuid[]);
SELECT pg_temp.verifie('genres : ceux de Spectacle, sans doublon ni inconnu, dans l''ordre de la liste',
  pg_temp.genres('e0000000-0000-4000-8000-000000000002'), 'Théâtre, Humour');

INSERT INTO public.events (id, title, date, category, status, genre_ids) VALUES
  ('e0000000-0000-4000-8000-000000000003', 'Null', '2026-11-07 20:30+00', 'ca000000-0000-4000-8000-000000000001', 'approved', NULL);
SELECT pg_temp.verifie('genre_ids null écrit : vide',
  (SELECT cardinality(genre_ids)::text FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000003'), '0');

UPDATE public.events SET genre_ids = ARRAY['0e000000-0000-4000-8000-000000000003']::uuid[]
WHERE id = 'e0000000-0000-4000-8000-000000000003';
SELECT pg_temp.verifie('un genre inactif de la catégorie reste',
  pg_temp.genres('e0000000-0000-4000-8000-000000000003'), 'Impro');

-- La catégorie écrite par son nom (une demande de l'app) : events_normalize_category passe avant, le genre reste.
INSERT INTO public.events (id, title, date, category, status, genre_ids) VALUES
  ('e0000000-0000-4000-8000-000000000004', 'Par son nom', '2026-11-07 20:30+00', 'SPECTACLE (TEST)', 'approved',
   ARRAY['0e000000-0000-4000-8000-000000000002']::uuid[]);
SELECT pg_temp.verifie('catégorie écrite par son nom : genre gardé',
  (SELECT category FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000004') || ' '
    || pg_temp.genres('e0000000-0000-4000-8000-000000000004'),
  'ca000000-0000-4000-8000-000000000001 Humour');

-- Changer de catégorie retire les genres de l'ancienne.
UPDATE public.events SET category = 'ca000000-0000-4000-8000-000000000002'
WHERE id = 'e0000000-0000-4000-8000-000000000002';
SELECT pg_temp.verifie('Spectacle → Concert : genres retirés',
  pg_temp.genres('e0000000-0000-4000-8000-000000000002'), '∅');
UPDATE public.events
SET genre_ids = ARRAY['0e000000-0000-4000-8000-000000000005', '0e000000-0000-4000-8000-000000000004']::uuid[]
WHERE id = 'e0000000-0000-4000-8000-000000000002';
SELECT pg_temp.verifie('genres de Concert, dans l''ordre de la liste',
  pg_temp.genres('e0000000-0000-4000-8000-000000000002'), 'Rock, Jazz');

INSERT INTO public.events (id, title, date, category, status, genre_ids) VALUES
  ('e0000000-0000-4000-8000-000000000005', 'Un festival', '2026-11-07 20:30+00', 'ca000000-0000-4000-8000-000000000003', 'approved',
   ARRAY['0e000000-0000-4000-8000-000000000004']::uuid[]);
SELECT pg_temp.verifie('une catégorie sans genres : aucun',
  pg_temp.genres('e0000000-0000-4000-8000-000000000005'), '∅');

-- 3. Le jeune public, recalculé depuis audience quand elle est connue.
INSERT INTO public.events (id, title, date, category, status, audience, is_young_audience) VALUES
  ('e0000000-0000-4000-8000-000000000011', 'J1 en famille', '2026-11-07 15:00+00', 'ca000000-0000-4000-8000-000000000001', 'approved', 'family', false),
  ('e0000000-0000-4000-8000-000000000012', 'J2 ados', '2026-11-07 15:00+00', 'ca000000-0000-4000-8000-000000000001', 'approved', 'teens', false),
  ('e0000000-0000-4000-8000-000000000013', 'J3 tout public', '2026-11-07 15:00+00', 'ca000000-0000-4000-8000-000000000001', 'approved', 'all', true),
  ('e0000000-0000-4000-8000-000000000014', 'J4 adultes', '2026-11-07 15:00+00', 'ca000000-0000-4000-8000-000000000001', 'approved', 'adults', true),
  ('e0000000-0000-4000-8000-000000000015', 'J5 inconnu, coché', '2026-11-07 15:00+00', 'ca000000-0000-4000-8000-000000000001', 'approved', NULL, true),
  ('e0000000-0000-4000-8000-000000000016', 'J6 inconnu, pas coché', '2026-11-07 15:00+00', 'ca000000-0000-4000-8000-000000000001', 'approved', NULL, false);
SELECT pg_temp.verifie('jeune public d''après audience ; sans audience, tel qu''écrit',
  (SELECT string_agg(split_part(title, ' ', 1) || '=' || is_young_audience, ' ' ORDER BY title)
   FROM public.events WHERE title LIKE 'J_ %'),
  'J1=true J2=true J3=false J4=false J5=true J6=false');

-- Une ancienne écriture de la case seule ne contredit pas audience.
UPDATE public.events SET is_young_audience = true WHERE id = 'e0000000-0000-4000-8000-000000000014';
SELECT pg_temp.verifie('adultes : la case écrite seule reste fausse',
  (SELECT is_young_audience::text FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000014'), 'false');
UPDATE public.events SET audience = 'family' WHERE id = 'e0000000-0000-4000-8000-000000000014';
SELECT pg_temp.verifie('adultes → en famille : jeune public',
  (SELECT is_young_audience::text FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000014'), 'true');
UPDATE public.events SET audience = NULL WHERE id = 'e0000000-0000-4000-8000-000000000014';
SELECT pg_temp.verifie('audience effacée : la case reste',
  (SELECT is_young_audience::text FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000014'), 'true');

-- La règle d'« En famille » (U5) suit : app_events_in_range(family) prend la case.
SELECT pg_temp.verifie('« En famille » : en famille, ados et la case cochée sans audience',
  (SELECT string_agg(split_part(title, ' ', 1), ' ' ORDER BY title)
   FROM public.app_events_in_range('2026-11-07 00:00', '2026-11-08 00:00', at_time => '2026-11-01 00:00',
     family => true) AS e
   WHERE title LIKE 'J_ %'),
  'J1 J2 J4 J5');

-- 4. Les valeurs permises.
SELECT pg_temp.verifie('audience inconnue refusée',
  pg_temp.refus($q$UPDATE public.events SET audience = 'kids' WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$),
  'erreur 23514');
SELECT pg_temp.verifie('âge 0 refusé',
  pg_temp.refus($q$UPDATE public.events SET min_age = 0 WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$),
  'erreur 23514');
SELECT pg_temp.verifie('âge 19 refusé',
  pg_temp.refus($q$UPDATE public.events SET min_age = 19 WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$),
  'erreur 23514');
SELECT pg_temp.verifie('réservation inconnue refusée',
  pg_temp.refus($q$UPDATE public.events SET booking = 'phone' WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$),
  'erreur 23514');
UPDATE public.events SET audience = 'all', min_age = 6, booking = 'none', details_to_confirm = true
WHERE id = 'e0000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('tout public dès 6 ans, sans réservation, à confirmer',
  (SELECT audience || ' ' || min_age || ' ' || booking || ' ' || details_to_confirm || ' ' || is_young_audience
   FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000001'),
  'all 6 none true false');

-- 5. Un genre supprimé, ou passé dans une autre catégorie, quitte les événements.
DELETE FROM public.event_genres WHERE id = '0e000000-0000-4000-8000-000000000004';
SELECT pg_temp.verifie('Rock supprimé : retiré du concert',
  pg_temp.genres('e0000000-0000-4000-8000-000000000002') || ' (' || (SELECT cardinality(genre_ids) FROM public.events
    WHERE id = 'e0000000-0000-4000-8000-000000000002') || ')', 'Jazz (1)');
UPDATE public.event_genres SET category_id = 'ca000000-0000-4000-8000-000000000001'
WHERE id = '0e000000-0000-4000-8000-000000000005';
SELECT pg_temp.verifie('Jazz rangé dans Spectacle : retiré du concert',
  pg_temp.genres('e0000000-0000-4000-8000-000000000002'), '∅');
SELECT pg_temp.verifie('les spectacles gardent leurs genres',
  pg_temp.genres('e0000000-0000-4000-8000-000000000004'), 'Humour');

-- 6. Qui lit et qui écrit les genres.
INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
  ('ad000000-0000-4000-8000-000000000001', 'admin@test.local', '{"role":"admin"}'::jsonb),
  ('ad000000-0000-4000-8000-000000000002', 'membre@test.local', '{}'::jsonb);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.verifie('anon : les genres actifs seulement',
  (SELECT string_agg(name, ', ' ORDER BY name) FROM public.event_genres WHERE category_id::text LIKE 'ca000000-%'),
  'Humour, Jazz, Théâtre');
SELECT pg_temp.verifie('anon : pas d''ajout',
  pg_temp.refus($q$INSERT INTO public.event_genres (category_id, name, phrase)
    VALUES ('ca000000-0000-4000-8000-000000000001', 'Magie', 'la magie')$q$),
  'erreur 42501');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.session('02');
SELECT pg_temp.verifie('un membre : les genres actifs seulement',
  (SELECT count(*)::text FROM public.event_genres WHERE category_id::text LIKE 'ca000000-%'), '3');
SELECT pg_temp.verifie('un membre : pas d''ajout',
  pg_temp.refus($q$INSERT INTO public.event_genres (category_id, name, phrase)
    VALUES ('ca000000-0000-4000-8000-000000000001', 'Magie', 'la magie')$q$),
  'erreur 42501');
UPDATE public.event_genres SET name = 'Théâtre !' WHERE id = '0e000000-0000-4000-8000-000000000001';
SELECT pg_temp.session('01');
SELECT pg_temp.verifie('un membre ne renomme rien ; l''admin voit aussi l''inactif',
  (SELECT string_agg(name, ', ' ORDER BY name) FROM public.event_genres WHERE category_id::text LIKE 'ca000000-%'),
  'Humour, Impro, Jazz, Théâtre');
SELECT pg_temp.verifie('l''admin ajoute un genre',
  pg_temp.refus($q$INSERT INTO public.event_genres (category_id, name, phrase, display_order)
    VALUES ('ca000000-0000-4000-8000-000000000001', 'Magie', 'la magie', 6)$q$),
  'accepté');
UPDATE public.event_genres SET is_active = false
WHERE name = 'Magie' AND category_id = 'ca000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('l''admin désactive un genre',
  (SELECT is_active::text FROM public.event_genres
   WHERE name = 'Magie' AND category_id = 'ca000000-0000-4000-8000-000000000001'), 'false');
RESET ROLE;

ROLLBACK;
