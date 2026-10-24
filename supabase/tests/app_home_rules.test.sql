-- Tests des règles de l'accueil passées en SQL (migration 20261024120000_app_home_rules.sql) : la règle de
-- « Tout » (app_on_tout), events.category toujours l'id de sa catégorie (events_normalize_category), les masqués et
-- les auteurs bloqués d'app_events_in_range lus une fois par requête, la catégorie demandée résolue une fois.
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au vendredi 6 novembre 2026, 19:15 (heure de Paris) par `at_time`. Les événements sont
-- désignés par le début de leur titre (« E01 »), les comptes par « U » et le dernier chiffre de leur id.

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

-- La session qui lit : anon, ou un compte (« 1 »). Toujours suivie de RESET ROLE.
CREATE FUNCTION pg_temp.session(compte text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF compte IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object(
      'role', 'authenticated',
      'sub', '3e000000-0000-4000-8000-00000000000' || compte,
      'is_anonymous', false,
      'app_metadata', json_build_object('provider', 'email')
    )::text, true);
    SET LOCAL ROLE authenticated;
  END IF;
END $$;

-- Les événements de la semaine du 2 novembre (titres courts, triés) ; [categorie] : celle demandée.
CREATE FUNCTION pg_temp.liste(categorie text DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(split_part(e.title, ' ', 1), ' ' ORDER BY e.title), '')
  FROM public.app_events_in_range('2026-11-02 00:00', '2026-11-16 00:00', NULL, categorie, '2026-11-06 19:15') AS e
$$;
GRANT EXECUTE ON FUNCTION pg_temp.liste(text) TO anon, authenticated;

-- La catégorie gardée d'un événement : « C1 » pour l'id d'une catégorie du jeu d'essai, sinon le texte.
CREATE FUNCTION pg_temp.categorie(numero text) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(
    (SELECT 'C' || right(c.id::text, 1) FROM public.categories AS c WHERE c.id::text = e.category),
    '« ' || e.category || ' »'
  )
  FROM public.events AS e
  WHERE e.title LIKE numero || ' %'
$$;

-- Comptes de la semaine (events_count) pour une catégorie, ou « Tout ».
CREATE FUNCTION pg_temp.compte(categorie text DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT c.events_count::text
  FROM public.app_event_counts(
    jsonb_build_array(jsonb_build_object('start', '2026-11-02T00:00:00', 'end', '2026-11-16T00:00:00')),
    NULL, categorie, '2026-11-06 19:15'
  ) AS c
$$;

-- Le plus grand nombre de passages d'un nœud du plan d'app_events_in_range qui lit user_hidden_events,
-- blocked_users ou categories, ou d'un sous-plan : 1 si rien n'est relu à chaque événement.
CREATE FUNCTION pg_temp.boucles_max(categorie text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  plan jsonb;
BEGIN
  EXECUTE format(
    'EXPLAIN (ANALYZE, FORMAT JSON) SELECT e.id FROM public.app_events_in_range(%L, %L, NULL, %L, %L) AS e',
    '2026-11-02 00:00', '2026-11-16 00:00', categorie, '2026-11-06 19:15'
  ) INTO plan;
  RETURN (
    SELECT max(n.v::text::numeric)::text
    FROM jsonb_path_query(plan,
      'strict $.** ? (@."Relation Name" == "user_hidden_events" || @."Relation Name" == "blocked_users"
                      || @."Relation Name" == "categories" || @."Parent Relationship" == "SubPlan"
                      || @."Parent Relationship" == "InitPlan")."Actual Loops"') AS n(v)
  );
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.boucles_max(text) TO anon, authenticated;

-- Jeu d'essai --------------------------------------------------------------------------------------

-- U1 masque E03 et bloque U2 ; U2 et U4 sont des auteurs ; U3 est admin.
INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
  ('3e000000-0000-4000-8000-000000000001', 'u1@accueil.test', '{"provider":"email"}'),
  ('3e000000-0000-4000-8000-000000000002', 'u2@accueil.test', '{"provider":"email"}'),
  ('3e000000-0000-4000-8000-000000000003', 'u3@accueil.test', '{"provider":"email","role":"admin"}'),
  ('3e000000-0000-4000-8000-000000000004', 'u4@accueil.test', '{"provider":"email"}');

-- C1, C2 actives ; C3 inactive (cachée par la RLS de categories, sauf aux admins).
INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('2e000000-0000-4000-8000-000000000001', 'Zz Accueil Concert', true, 90),
  ('2e000000-0000-4000-8000-000000000002', 'Zz Accueil Atelier', true, 91),
  ('2e000000-0000-4000-8000-000000000003', 'Zz Accueil Ancienne', false, 92);

-- Approuvés, visibles, sans lieu ni zone ; la catégorie telle qu'écrite.
INSERT INTO public.events (id, title, date, category, status, created_by)
SELECT
  ('e2000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  categorie,
  'approved',
  auteur::uuid
FROM (VALUES
  (1, 'E01 sans auteur',                 '2026-11-07 20:00', '2e000000-0000-4000-8000-000000000001', NULL),
  (2, 'E02 retiré de l''accueil',        '2026-11-07 21:00', '2e000000-0000-4000-8000-000000000001', NULL),
  (3, 'E03 masqué par U1',               '2026-11-08 15:00', '2e000000-0000-4000-8000-000000000001', NULL),
  (4, 'E04 auteur U2, bloqué par U1',    '2026-11-08 16:00', '2e000000-0000-4000-8000-000000000002', '3e000000-0000-4000-8000-000000000002'),
  (5, 'E05 nom, casse et espaces',       '2026-11-08 17:00', '  zz accueil ATELIER ', '3e000000-0000-4000-8000-000000000004'),
  (6, 'E06 texte inconnu',               '2026-11-09 18:00', 'Cirque', NULL),
  (7, 'E07 id en capitales',             '2026-11-09 19:00', ' 2E000000-0000-4000-8000-000000000001', NULL),
  (8, 'E08 nom d''une catégorie inactive', '2026-11-10 20:00', 'Zz Accueil Ancienne', NULL),
  (9, 'E09 vide',                        '2026-11-10 21:00', '', NULL)
) AS v(n, titre, debut, categorie, auteur);

UPDATE public.events SET hide_from_home = true WHERE title LIKE 'E02 %';

INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e2000000-0000-4000-8000-000000000003', '3e000000-0000-4000-8000-000000000001');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('3e000000-0000-4000-8000-000000000001', '3e000000-0000-4000-8000-000000000002');

-- events.category : l'id de sa catégorie ------------------------------------------------------------

SELECT pg_temp.verifie('catégorie par son id : gardée', pg_temp.categorie('E01'), 'C1');
SELECT pg_temp.verifie('catégorie par son nom : son id', pg_temp.categorie('E05'), 'C2');
SELECT pg_temp.verifie('id en capitales, espaces : l''id', pg_temp.categorie('E07'), 'C1');
SELECT pg_temp.verifie('catégorie inactive par son nom : son id', pg_temp.categorie('E08'), 'C3');
SELECT pg_temp.verifie('texte inconnu : gardé', pg_temp.categorie('E06'), '« Cirque »');
SELECT pg_temp.verifie('texte vide : gardé', pg_temp.categorie('E09'), '«  »');

-- Un admin, avec sa session : le trigger tourne pour lui, sans droit sur ses fonctions.
SELECT pg_temp.verifie('authenticated ne peut appeler ni la résolution ni le trigger',
  has_function_privilege('authenticated', 'public.resolve_event_category(text)', 'execute')::text || ' '
    || has_function_privilege('authenticated', 'public.normalize_event_category()', 'execute')::text
    || ' ' || has_function_privilege('anon', 'public.resolve_event_category(text)', 'execute')::text,
  'false false false');
SELECT pg_temp.session('3');
UPDATE public.events SET category = 'ZZ ACCUEIL ATELIER' WHERE title LIKE 'E09 %';
UPDATE public.events SET title = 'E06 texte inconnu, titre changé' WHERE title LIKE 'E06 %';
RESET ROLE;
SELECT pg_temp.verifie('admin : un nom écrit devient l''id', pg_temp.categorie('E09'), 'C2');
SELECT pg_temp.verifie('une autre colonne changée : la catégorie ne bouge pas', pg_temp.categorie('E06'), '« Cirque »');

-- La conversion de la migration, rejouée : les textes qui désignent une catégorie deviennent son id.
ALTER TABLE public.events DISABLE TRIGGER events_normalize_category;
UPDATE public.events SET category = 'zz accueil concert' WHERE title LIKE 'E01 %';
UPDATE public.events SET category = 'Cirque ' WHERE title LIKE 'E06 %';
ALTER TABLE public.events ENABLE TRIGGER events_normalize_category;
UPDATE public.events AS e
SET category = r.categorie::text
FROM (
  SELECT ev.id, public.resolve_event_category(ev.category) AS categorie
  FROM public.events AS ev
) AS r
WHERE r.id = e.id
  AND r.categorie IS NOT NULL
  AND e.category IS DISTINCT FROM r.categorie::text;
SELECT pg_temp.verifie('conversion : un nom devient l''id', pg_temp.categorie('E01'), 'C1');
SELECT pg_temp.verifie('conversion : un texte inconnu reste', pg_temp.categorie('E06'), '« Cirque  »');
UPDATE public.events SET category = 'Cirque' WHERE title LIKE 'E06 %';

-- « Tout » : app_on_tout ------------------------------------------------------------------------------

SELECT pg_temp.verifie('hors de « Tout » : les événements retirés de l''accueil',
  (SELECT string_agg(split_part(e.title, ' ', 1), ' ' ORDER BY e.title)
   FROM public.events AS e WHERE NOT public.app_on_tout(e)),
  'E02');

SELECT pg_temp.session();
SELECT pg_temp.verifie('anon lit app_on_tout (colonne calculée de PostgREST)',
  (SELECT count(*) FILTER (WHERE public.app_on_tout(e))::text || '/' || count(*)::text
   FROM public.app_events() AS e),
  '8/9');
-- Les comptes de « Tout » sans E02, ceux de sa catégorie avec.
SELECT pg_temp.verifie('comptes : « Tout » sans E02', pg_temp.compte(), '8');
SELECT pg_temp.verifie('comptes : sa catégorie avec E02', pg_temp.compte('Zz Accueil Concert'), '4');
RESET ROLE;

-- app_events_in_range : masqués, auteurs bloqués, catégorie ---------------------------------------------

SELECT pg_temp.session();
SELECT pg_temp.verifie('anon : tout', pg_temp.liste(), 'E01 E02 E03 E04 E05 E06 E07 E08 E09');
SELECT pg_temp.verifie('anon : C1 par son id', pg_temp.liste('2e000000-0000-4000-8000-000000000001'), 'E01 E02 E03 E07');
SELECT pg_temp.verifie('anon : C1 par son nom, casse et espaces', pg_temp.liste(' zz ACCUEIL concert'), 'E01 E02 E03 E07');
SELECT pg_temp.verifie('anon : C2 par son nom', pg_temp.liste('Zz Accueil Atelier'), 'E04 E05 E09');
SELECT pg_temp.verifie('anon : un texte inconnu, tel quel', pg_temp.liste('cirque'), 'E06');
SELECT pg_temp.verifie('anon : une catégorie inactive, cachée par la RLS', pg_temp.liste('Zz Accueil Ancienne'), '');
SELECT pg_temp.verifie('anon : rien n''est relu à chaque événement', pg_temp.boucles_max(), '1');
SELECT pg_temp.verifie('anon, une catégorie par son nom : rien n''est relu à chaque événement',
  pg_temp.boucles_max('zz accueil concert'), '1');
RESET ROLE;

-- U1 : sans E03 (masqué) ni E04 (auteur bloqué) ; E01, sans auteur, reste (NOT IN et null).
SELECT pg_temp.session('1');
SELECT pg_temp.verifie('U1 : sans son masqué ni son auteur bloqué', pg_temp.liste(), 'E01 E02 E05 E06 E07 E08 E09');
SELECT pg_temp.verifie('U1 : C1', pg_temp.liste('Zz Accueil Concert'), 'E01 E02 E07');
SELECT pg_temp.verifie('U1 : comptes de « Tout »', pg_temp.compte(), '6');
SELECT pg_temp.verifie('U1 : rien n''est relu à chaque événement', pg_temp.boucles_max(), '1');
SELECT pg_temp.verifie('U1, une catégorie par son nom : rien n''est relu à chaque événement',
  pg_temp.boucles_max('Zz Accueil Atelier'), '1');
RESET ROLE;

-- U4 n'a rien masqué ni bloqué ; U3, admin, voit la catégorie inactive.
SELECT pg_temp.session('4');
SELECT pg_temp.verifie('U4 : tout', pg_temp.liste(), 'E01 E02 E03 E04 E05 E06 E07 E08 E09');
RESET ROLE;
SELECT pg_temp.session('3');
SELECT pg_temp.verifie('admin : la catégorie inactive par son nom', pg_temp.liste('zz accueil ancienne'), 'E08');
RESET ROLE;

ROLLBACK;
