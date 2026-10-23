-- ============================================
-- Migration : Festivals — un compteur d'audience
-- Date : 2026-10-23
-- Description : « festival ouvert » (festival_opened : la page d'un festival s'ouvre, c'est-à-dire la fiche
-- d'un festival qui a un programme ; elle compte aussi dans event_opened), compté par l'app comme les autres
-- (U41, sans identité ; `../live/docs/FESTIVALS.md`, étape 5, et `../live/docs/AUDIENCE_ET_PLANTAGES.md`).
-- Les deux listes (contrainte de la table, compteurs acceptés par app_audience_add) gagnent cette clé ; rien
-- d'autre ne change.
--
-- Les listes sont celles de 20261023142000_add_radio_audience_metrics.sql (la Radio), la clé en plus. La Radio
-- n'est pas encore en prod quand ce compteur l'est : 20261023142000 a gagné festival_opened elle aussi, et les
-- deux migrations rendent la même liste dans n'importe quel ordre d'application (appliquée après celle-ci, elle
-- ne retire rien ; avant, celle-ci ne change que le commentaire). Un compteur inconnu d'app_audience_add est
-- ignoré sans erreur, le reste de l'envoi compté : une app qui envoie festival_opened avant cette migration
-- le perd (elle jette la journée dès la réponse), sans rien perdre d'autre.
-- ============================================

ALTER TABLE public.app_audience_counts DROP CONSTRAINT IF EXISTS app_audience_counts_metric_check;
ALTER TABLE public.app_audience_counts ADD CONSTRAINT app_audience_counts_metric_check CHECK (metric IN (
  -- Même liste que dans app_audience_add (et dans 20261023142000) : les changer ensemble.
  'event_opened', 'ticket_tapped', 'search_no_result', 'when_sheet_used', 'event_liked',
  'radio_live_play', 'radio_episode_play', 'festival_opened'
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
        'radio_live_play', 'radio_episode_play', 'festival_opened'
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
  'Mesure d''audience de l''app (U41) : ajoute au jour donné (7 derniers jours, heure de Paris) les compteurs connus, de 1 à 200 chacun par appel ; le reste est ignoré. Sans identité. Rend le nombre de compteurs ajoutés. Compteurs : migrations 20261021013000, 20261023142000 (radio) et 20261023180000 (festival_opened).';

-- CREATE OR REPLACE garde les droits de la fonction : exécutable par anon et authenticated.

-- Vérification (SQL Editor) :
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'app_audience_counts_metric_check';

-- Rollback (après avoir effacé les lignes festival_opened) :
-- DELETE FROM public.app_audience_counts WHERE metric = 'festival_opened';
-- puis recréer la contrainte et la fonction de 20261023142000_add_radio_audience_metrics.sql sans la clé (et, si
-- la Radio n'est pas en prod, celles de 20261021013000_create_app_audience_counts.sql).
