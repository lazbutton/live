-- ============================================
-- Migration : Radio — deux compteurs d'audience
-- Date : 2026-10-23
-- Description : « direct écouté » (radio_live_play : le direct lancé) et « épisode écouté »
-- (radio_episode_play : un épisode lancé), comptés par l'app comme les cinq autres (U41, sans
-- identité ; `../live/docs/RADIO_CAMPUS.md`, § 3 et § 4). Les deux listes de
-- 20261021013000_create_app_audience_counts.sql (contrainte de la table, compteurs acceptés par
-- app_audience_add) gagnent ces deux clés ; rien d'autre ne change.
-- ============================================

ALTER TABLE public.app_audience_counts DROP CONSTRAINT IF EXISTS app_audience_counts_metric_check;
ALTER TABLE public.app_audience_counts ADD CONSTRAINT app_audience_counts_metric_check CHECK (metric IN (
  -- Même liste que dans app_audience_add : les changer ensemble.
  'event_opened', 'ticket_tapped', 'search_no_result', 'when_sheet_used', 'event_liked',
  'radio_live_play', 'radio_episode_play'
));

CREATE OR REPLACE FUNCTION public.app_audience_add(day date, counts jsonb)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH bornes AS (
    SELECT (now() AT TIME ZONE 'Europe/Paris')::date AS aujourdhui
  ),
  purge AS (
    DELETE FROM public.app_audience_counts AS c
    USING bornes AS b
    WHERE c.day < (b.aujourdhui - interval '25 months')::date
  ),
  ajouts AS (
    SELECT
      e.key AS metric,
      CASE WHEN jsonb_typeof(e.value) = 'number'
        THEN greatest(least(floor(e.value::numeric), 200), 0)::integer
      END AS n
    FROM bornes AS b,
      jsonb_each(CASE WHEN jsonb_typeof(app_audience_add.counts) = 'object'
        THEN app_audience_add.counts ELSE '{}'::jsonb END) AS e
    WHERE app_audience_add.day BETWEEN b.aujourdhui - 7 AND b.aujourdhui
      -- Même liste que la contrainte de la table : les changer ensemble.
      AND e.key IN (
        'event_opened', 'ticket_tapped', 'search_no_result', 'when_sheet_used', 'event_liked',
        'radio_live_play', 'radio_episode_play'
      )
      AND jsonb_typeof(e.value) = 'number'
  ),
  ecrits AS (
    INSERT INTO public.app_audience_counts AS c (day, metric, count)
    SELECT app_audience_add.day, a.metric, a.n
    FROM ajouts AS a
    WHERE a.n >= 1
    ON CONFLICT (day, metric) DO UPDATE SET count = c.count + excluded.count
    RETURNING 1
  )
  SELECT count(*)::integer FROM ecrits
$$;

COMMENT ON FUNCTION public.app_audience_add(date, jsonb) IS
  'Mesure d''audience de l''app (U41) : ajoute au jour donné (7 derniers jours, heure de Paris) les compteurs connus, de 1 à 200 chacun par appel ; le reste est ignoré. Sans identité. Rend le nombre de compteurs ajoutés.';

-- CREATE OR REPLACE garde les droits de la fonction : exécutable par anon et authenticated.

-- Rollback (après avoir effacé les lignes radio_*) :
-- DELETE FROM public.app_audience_counts WHERE metric IN ('radio_live_play', 'radio_episode_play');
-- puis recréer la contrainte et la fonction de 20261021013000_create_app_audience_counts.sql.
