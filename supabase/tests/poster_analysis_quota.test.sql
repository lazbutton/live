-- Tests de take_poster_analysis() (migration 20261021200000_create_poster_analysis_quota.sql).
--
-- Sur une base jetable avec toutes les migrations : scripts/db-test.sh. Jamais en prod : tout se passe
-- dans une transaction annulée, mais le script s'arrête de lui-même si la base contient déjà des
-- événements.

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

-- [fois] réservations de suite pour la session [session] (« 1 » : …0001) : leurs réponses, « ok ok
-- user_limit ».
CREATE FUNCTION pg_temp.reserve(session text, invite boolean, fois integer, par_session integer,
  total_invites integer) RETURNS text
LANGUAGE sql AS $$
  SELECT string_agg(
    public.take_poster_analysis(('7a000000-0000-4000-8000-00000000000' || session)::uuid, invite,
      par_session, total_invites),
    ' ' ORDER BY n)
  FROM generate_series(1, fois) AS n
$$;

-- Un appel refusé : le code de l'erreur au lieu d'arrêter le fichier.
CREATE FUNCTION pg_temp.appelle_en(role text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', role);
  PERFORM public.take_poster_analysis('7a000000-0000-4000-8000-000000000009', true, 10, 10);
  RESET ROLE;
  RETURN 'appelée';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'erreur ' || SQLSTATE;
END $$;

CREATE FUNCTION pg_temp.sans_session() RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.take_poster_analysis(NULL, true, 3, 3);
  RETURN 'acceptée';
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE;
END $$;

CREATE FUNCTION pg_temp.lit_la_table(role text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', role);
  PERFORM 1 FROM public.poster_analysis_usage;
  RESET ROLE;
  RETURN 'lue';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'erreur ' || SQLSTATE;
END $$;

-- Par session : 3 par jour.
SELECT pg_temp.verifie('compte : 3 analyses, puis la limite de la session',
  pg_temp.reserve('1', false, 4, 3, 1), 'ok ok ok user_limit');
SELECT pg_temp.verifie('compte : pas soumis au total des invités',
  pg_temp.reserve('2', false, 2, 3, 0), 'ok ok');

-- Invités : 3 par session, 4 à eux tous.
SELECT pg_temp.verifie('invité 3 : ses 3 analyses',
  pg_temp.reserve('3', true, 4, 3, 4), 'ok ok ok user_limit');
SELECT pg_temp.verifie('invité 4 : la 4e des invités, puis la limite de tous',
  pg_temp.reserve('4', true, 2, 3, 4), 'ok guest_limit');
SELECT pg_temp.verifie('les comptes ne sont pas comptés avec les invités',
  (SELECT sum(analyses_count) FILTER (WHERE is_guest) || '/' || sum(analyses_count) FILTER (WHERE NOT is_guest)
   FROM public.poster_analysis_usage),
  '4/5');

-- Une session invitée qui se connecte garde son id : elle compte alors comme un compte.
SELECT pg_temp.verifie('invité 4 connecté : sa limite de session, plus celle des invités',
  pg_temp.reserve('4', false, 3, 3, 4), 'ok ok user_limit');
SELECT pg_temp.verifie('limites nulles ou négatives : tout est refusé',
  pg_temp.reserve('5', false, 1, 0, 0) || ' ' || pg_temp.reserve('6', true, 1, -1, 5),
  'user_limit user_limit');

-- Le ménage : un jour d'avant-hier disparaît au premier appel ; la veille reste.
INSERT INTO public.poster_analysis_usage (day, user_id, is_guest, analyses_count) VALUES
  ((now() AT TIME ZONE 'Europe/Paris')::date - 2, '7a000000-0000-4000-8000-000000000007', true, 9),
  ((now() AT TIME ZONE 'Europe/Paris')::date - 1, '7a000000-0000-4000-8000-000000000008', true, 9);
-- Deux requêtes : une même requête lirait la table telle qu'avant l'appel.
SELECT pg_temp.verifie('ménage : les jours d''avant ne comptent pas pour aujourd''hui',
  pg_temp.reserve('7', true, 1, 3, 100), 'ok');
SELECT pg_temp.verifie('ménage : avant-hier effacé, la veille gardée',
  (SELECT string_agg(right(user_id::text, 1), ' ' ORDER BY day, user_id)
   FROM public.poster_analysis_usage
   WHERE day < (now() AT TIME ZONE 'Europe/Paris')::date),
  '8');

SELECT pg_temp.verifie('sans session : refusé', pg_temp.sans_session(), 'erreur P0001');

SELECT pg_temp.verifie('anon et authenticated : ni la fonction ni la table',
  pg_temp.appelle_en('anon') || ' ' || pg_temp.appelle_en('authenticated') || ' '
  || pg_temp.lit_la_table('anon') || ' ' || pg_temp.lit_la_table('authenticated'),
  'erreur 42501 erreur 42501 erreur 42501 erreur 42501');
SELECT pg_temp.verifie('service_role : la fonction',
  pg_temp.appelle_en('service_role'), 'appelée');

ROLLBACK;
