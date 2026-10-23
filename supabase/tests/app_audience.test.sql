-- Tests de la mesure d'audience de l'app (U41) : app_audience_counts et app_audience_add()
-- (migration 20261021013000_create_app_audience_counts.sql).
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

-- Aujourd'hui à Paris, décalé de `jours`.
CREATE FUNCTION pg_temp.jour(jours integer) RETURNS date
LANGUAGE sql AS $$ SELECT (now() AT TIME ZONE 'Europe/Paris')::date + jours $$;

-- Lignes de la table en texte « J-n compteur=total », lues sans RLS (postgres).
CREATE FUNCTION pg_temp.lignes() RETURNS text
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT coalesce(string_agg(
    'J' || (c.day - pg_temp.jour(0)) || ' ' || c.metric || '=' || c.count, ' '
    ORDER BY c.day DESC, c.metric), '')
  FROM public.app_audience_counts AS c
$$;

-- Lignes visibles par le rôle courant (RLS), ou l'erreur.
CREATE FUNCTION pg_temp.lignes_visibles() RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT count(*)::text FROM public.app_audience_counts);
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 'refusé';
END $$;

-- app_audience_add sous le rôle courant, ou l'erreur.
CREATE FUNCTION pg_temp.ajoute(jour date, compteurs jsonb) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.app_audience_add(jour, compteurs)::text;
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE;
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'quidam@test.local', '{}'::jsonb),
  ('3d000000-0000-4000-8000-000000000009', 'admin@test.local',  '{}'::jsonb);

-- Le rôle admin vit dans app_metadata (20261023150000) ; raw_user_meta_data ne peut plus le porter.
UPDATE auth.users SET raw_app_meta_data = '{"role":"admin"}'::jsonb
WHERE id = '3d000000-0000-4000-8000-000000000009';

SELECT pg_temp.verifie('app_audience_add : exécutable par anon et authenticated, pas par public',
  has_function_privilege('anon', 'public.app_audience_add(date, jsonb)', 'execute')::text || ' '
  || has_function_privilege('authenticated', 'public.app_audience_add(date, jsonb)', 'execute')::text || ' '
  || (SELECT coalesce(bool_or(a.grantee = 0), false)::text
      FROM pg_proc AS p, aclexplode(p.proacl) AS a
      WHERE p.oid = 'public.app_audience_add(date, jsonb)'::regprocedure),
  'true true false');

-- Sans session (clé publique), comme l'app ---------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT pg_temp.verifie('anon : deux compteurs d''hier ajoutés',
  pg_temp.ajoute(pg_temp.jour(-1), '{"event_opened": 3, "ticket_tapped": 1}'),
  '2');
SELECT pg_temp.verifie('anon : un autre téléphone, les totaux s''additionnent',
  pg_temp.ajoute(pg_temp.jour(-1), '{"event_opened": 2}') || ' | ' || pg_temp.lignes(),
  '1 | J-1 event_opened=5 J-1 ticket_tapped=1');

SELECT pg_temp.verifie('compteurs inconnus, textes, négatifs et zéros ignorés ; décimaux arrondis ; 200 au plus',
  pg_temp.ajoute(pg_temp.jour(-1),
    '{"inconnu": 5, "search_no_result": "3", "when_sheet_used": -4, "event_liked": 0,
      "event_opened": 2.7, "ticket_tapped": 5000, "Event_Opened": 1}')
  || ' | ' || pg_temp.lignes(),
  '2 | J-1 event_opened=7 J-1 ticket_tapped=201');

SELECT pg_temp.verifie('nombres démesurés : bornés sans erreur',
  pg_temp.ajoute(pg_temp.jour(-1), '{"event_liked": 1e400, "search_no_result": -1e400}')
  || ' | ' || pg_temp.lignes(),
  '1 | J-1 event_liked=200 J-1 event_opened=7 J-1 ticket_tapped=201');

SELECT pg_temp.verifie('jours : demain, il y a 8 jours, nul → rien ; il y a 7 jours et aujourd''hui → oui',
  pg_temp.ajoute(pg_temp.jour(1), '{"event_opened": 1}') || ' '
  || pg_temp.ajoute(pg_temp.jour(-8), '{"event_opened": 1}') || ' '
  || pg_temp.ajoute(NULL, '{"event_opened": 1}') || ' '
  || pg_temp.ajoute(pg_temp.jour(-7), '{"when_sheet_used": 4}') || ' '
  || pg_temp.ajoute(pg_temp.jour(0), '{"search_no_result": 2}'),
  '0 0 0 1 1');

SELECT pg_temp.verifie('compteurs qui ne sont pas un objet : rien',
  pg_temp.ajoute(pg_temp.jour(-1), '[1, 2]') || ' '
  || pg_temp.ajoute(pg_temp.jour(-1), '"event_opened"') || ' '
  || pg_temp.ajoute(pg_temp.jour(-1), NULL) || ' '
  || pg_temp.ajoute(pg_temp.jour(-1), '{}'),
  '0 0 0 0');

SELECT pg_temp.verifie('anon : ni lecture ni écriture directe de la table',
  pg_temp.lignes_visibles(), 'refusé');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.app_audience_counts (day, metric, count)
    VALUES (current_date, 'event_opened', 1000000);
    RAISE EXCEPTION 'ÉCHEC anon a pu écrire dans app_audience_counts';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  anon : écriture directe refusée';
  END;
END $$;

-- Un compte sans rôle d'admin : rien à lire, pas d'écriture directe -------------------------------

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001"}', true);

SELECT pg_temp.verifie('compte ordinaire : aucune ligne visible', pg_temp.lignes_visibles(), '0');
DO $$
BEGIN
  BEGIN
    UPDATE public.app_audience_counts SET count = 0;
    RAISE EXCEPTION 'ÉCHEC un compte a pu modifier app_audience_counts';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  compte ordinaire : modification refusée';
  END;
END $$;

-- Un admin lit tout ----------------------------------------------------------------------------------

SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000009"}', true);
SELECT pg_temp.verifie('admin : toutes les lignes', pg_temp.lignes_visibles(), '5');

-- Conservation : 25 mois -----------------------------------------------------------------------------

RESET ROLE;
INSERT INTO public.app_audience_counts (day, metric, count) VALUES
  ((pg_temp.jour(0) - interval '25 months')::date - 1, 'event_opened', 9),
  ((pg_temp.jour(0) - interval '25 months')::date, 'event_liked', 4);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.ajoute(pg_temp.jour(-1), '{"event_opened": 1}');
RESET ROLE;

SELECT pg_temp.verifie('plus de 25 mois : effacé au passage ; 25 mois tout juste : gardé',
  (SELECT string_agg(c.metric || '=' || c.count, ' ' ORDER BY c.day)
   FROM public.app_audience_counts AS c
   WHERE c.day < pg_temp.jour(-700)),
  'event_liked=4');

-- Radio (20261023142000_add_radio_audience_metrics.sql) : direct écouté, épisode écouté --------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.verifie('radio : direct et épisode écoutés comptés, une autre clé radio ignorée',
  pg_temp.ajoute(pg_temp.jour(-2), '{"radio_live_play": 3, "radio_episode_play": 2, "radio_inconnu": 1}'),
  '2');
RESET ROLE;
SELECT pg_temp.verifie('radio : les deux compteurs du jour',
  (SELECT string_agg(c.metric || '=' || c.count, ' ' ORDER BY c.metric)
   FROM public.app_audience_counts AS c WHERE c.day = pg_temp.jour(-2)),
  'radio_episode_play=2 radio_live_play=3');

ROLLBACK;
