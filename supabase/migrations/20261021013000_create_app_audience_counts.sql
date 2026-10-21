-- Mesure d'audience de l'app (U41) : des compteurs quotidiens, sans identité.
--
-- Cinq compteurs par jour : fiche ouverte (event_opened), billetterie touchée (ticket_tapped),
-- recherche sans résultat (search_no_result), feuille « Quand ? » utilisée (when_sheet_used), cœur
-- (event_liked). Chaque téléphone additionne ses gestes d'une journée et envoie ces totaux au plus une
-- fois par jour, avec la clé publique seule (ni session, ni identifiant) : la table n'a qu'une ligne par
-- jour et par compteur, additionnée par tous les téléphones. Conditions de la CNIL pour se passer de
-- consentement, et ce qui y répond : `docs/AUDIENCE_ET_PLANTAGES.md` du dépôt de l'app.
--
-- app_audience_add(day, counts) : ajoute à `day` les compteurs de `counts` ({"event_opened": 3, …}).
-- Sans identité, on ne peut pas empêcher des appels répétés : la fonction borne ce qu'un appel ajoute.
-- Compteurs connus seulement, nombres arrondis à l'entier inférieur et plafonnés à 200, jour compris
-- dans les 7 derniers jours (heure de Paris) ; le reste est ignoré sans erreur (l'app jette alors ce
-- qu'elle gardait). Rend le nombre de compteurs ajoutés. Efface au passage les jours de plus de 25 mois
-- (recommandation de la CNIL sur la conservation).
--
-- `security definer` pour écrire malgré la RLS ; `set search_path = ''`, tout est qualifié.
-- Exécutable par anon et authenticated. La table ne se lit que par un admin (RLS) ; l'app ne la lit
-- jamais.

CREATE TABLE IF NOT EXISTS public.app_audience_counts (
  day date NOT NULL,
  -- Même liste que dans app_audience_add : les changer ensemble.
  metric text NOT NULL CHECK (metric IN (
    'event_opened', 'ticket_tapped', 'search_no_result', 'when_sheet_used', 'event_liked'
  )),
  count bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, metric)
);

COMMENT ON TABLE public.app_audience_counts IS
  'Mesure d''audience de l''app (U41) : un total par jour et par compteur, additionné par tous les téléphones, sans identité. Écrite par app_audience_add, lue par les admins, effacée après 25 mois.';

ALTER TABLE public.app_audience_counts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_audience_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_audience_counts TO authenticated;

DROP POLICY IF EXISTS "Admins lisent l'audience de l'app" ON public.app_audience_counts;
CREATE POLICY "Admins lisent l'audience de l'app" ON public.app_audience_counts
  FOR SELECT TO authenticated
  USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));

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
        'event_opened', 'ticket_tapped', 'search_no_result', 'when_sheet_used', 'event_liked'
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

REVOKE ALL ON FUNCTION public.app_audience_add(date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_audience_add(date, jsonb) TO anon, authenticated;

-- Vérification (SQL Editor) : les 14 derniers jours.
-- select day, metric, count from public.app_audience_counts
-- where day > current_date - 14 order by day desc, metric;

-- Rollback :
-- DROP FUNCTION IF EXISTS public.app_audience_add(date, jsonb);
-- DROP TABLE IF EXISTS public.app_audience_counts;
