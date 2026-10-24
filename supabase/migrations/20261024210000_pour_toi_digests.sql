-- « Pour toi » : les résumés de notification par la règle de la page (étape 7).
--
-- ../live/docs/chantiers/pour-toi.md (« Le parcours », point 6 ; « Données et code », « live-admin : Pour toi » ;
-- choix 6). Les résumés du matin et du lundi (crons daily-events et weekly-summary) parlent de « Pour toi » à qui a
-- choisi des goûts : « 7 événements cette semaine pour toi ». Sans goût, rien ne change.
--
-- 1. app_is_for_me_by_ids(…) : la règle de la page (20261024190000) sur des valeurs déjà lues : l'événement (id,
--    lieu, les goûts qui le prennent) et le profil. app_is_for_me(events, …) la passe désormais : même résultat,
--    mêmes appels, dépliée de même dans app_events_in_range ; elle sert aussi aux résumés sans relire les goûts d'un
--    événement pour chaque destinataire.
-- 2. app_digest_for_me(range_start, range_end, at_time) : pour chaque utilisateur qui a au moins un goût actif, les
--    événements de la plage qui sont pour lui, sans ses masqués ni les auteurs qu'il a bloqués ; une ligne sans
--    événement pour qui n'a rien (il a des goûts : pas le résumé de tout). Pour le service (les crons), qui garde ses
--    règles de résumé (complets écartés, ce qui commence dans la plage).
-- 3. app_interests_from_categories(apply) : les catégories déjà cochées pour les résumés deviennent des goûts
--    (choix 6), une fois, le jour de la sortie de la version de l'app qui a « Pour toi » (avant, l'app installée
--    écrit encore ses catégories). Seulement un choix : toutes les catégories cochées, c'est le défaut de l'app, pas
--    un goût. Spectacle devient Théâtre, Humour et Cirque. Sans apply, rien n'est écrit : la liste de ce qui le
--    serait.
--
-- Fonctions des crons : `security invoker`, appelées par le service ; fermées à anon et authenticated. Prérequis :
-- 20261024190000_create_pour_toi.sql. À appliquer d'un bloc (`psql --single-transaction`) ; pas de BEGIN ni de COMMIT
-- ici.

-- 1. La règle sur des valeurs déjà lues ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_is_for_me_by_ids(
  event_id uuid,
  event_location_id uuid,
  event_interest_ids uuid[],
  interest_ids uuid[],
  location_ids uuid[],
  event_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT coalesce(
    event_location_id = ANY (location_ids)
    OR event_id = ANY (event_ids)
    OR (cardinality(interest_ids) > 0 AND event_interest_ids && interest_ids),
    false
  )
$$;

COMMENT ON FUNCTION public.app_is_for_me_by_ids(uuid, uuid, uuid[], uuid[], uuid[], uuid[]) IS
  'Règle de « Pour toi » sur des valeurs déjà lues : l''événement (id, lieu, ses goûts : app_interest_ids) est-il pour ce profil (goûts choisis, lieux suivis, événements des suivis : app_for_me_profile_of) ? Jamais null. Passée par app_is_for_me et les résumés (app_digest_for_me). Migration 20261024210000.';

GRANT EXECUTE ON FUNCTION public.app_is_for_me_by_ids(uuid, uuid, uuid[], uuid[], uuid[], uuid[])
  TO anon, authenticated, service_role;

-- Même signature, même résultat : la règle passe par app_is_for_me_by_ids. Les goûts de l'événement ne sont lus que
-- si le lieu et les suivis ne l'ont pas déjà pris.
CREATE OR REPLACE FUNCTION public.app_is_for_me(
  e public.events,
  interest_ids uuid[],
  location_ids uuid[],
  event_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_is_for_me_by_ids(
    e.id,
    e.location_id,
    public.app_interest_ids(e),
    interest_ids,
    location_ids,
    event_ids
  )
$$;

COMMENT ON FUNCTION public.app_is_for_me(public.events, uuid[], uuid[], uuid[]) IS
  'Règle de « Pour toi » : l''événement se tient dans un lieu suivi, est proposé par un lieu, un organisateur ou un artiste suivi (event_ids du profil), ou un des goûts choisis le prend (app_interest_ids) ; app_is_for_me_by_ids. Profil : app_for_me_profile(). Jamais null. Migrations 20261024190000 et 20261024210000.';

-- 2. Les résumés : qui reçoit quoi ----------------------------------------------------------------------------------
--
-- Les événements de la plage (app_events_in_range, lue une fois ; le service n'a ni masqués ni auteurs bloqués), leurs
-- goûts lus une fois chacun, puis pour chaque utilisateur qui a un goût actif : ceux qui sont pour lui, sans ses
-- masqués ni les auteurs qu'il a bloqués. Comme la page « Pour toi » : sans la règle de « Tout » (un événement retiré
-- de l'accueil, la fiche d'un festival comptent).
CREATE OR REPLACE FUNCTION public.app_digest_for_me(
  range_start timestamp,
  range_end timestamp DEFAULT NULL,
  at_time timestamp DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  event_id uuid
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH evenements AS MATERIALIZED (
    SELECT e.id, e.location_id, e.created_by, e.date, public.app_interest_ids(e) AS gouts
    FROM public.app_events_in_range(
      app_digest_for_me.range_start,
      app_digest_for_me.range_end,
      NULL,
      NULL,
      app_digest_for_me.at_time
    ) AS e
  ),
  destinataires AS (
    SELECT DISTINCT ui.user_id
    FROM public.user_interests AS ui
    JOIN public.app_interests AS i ON i.id = ui.interest_id AND i.is_active
  )
  -- LEFT JOIN : un destinataire sans rien pour lui garde une ligne (event_id null) ; le cron sait ainsi qu'il a des
  -- goûts, et ne lui envoie pas le résumé de tout.
  SELECT d.user_id, x.id
  FROM destinataires AS d
  CROSS JOIN LATERAL public.app_for_me_profile_of(d.user_id) AS p
  LEFT JOIN evenements AS x
    ON public.app_is_for_me_by_ids(x.id, x.location_id, x.gouts, p.interest_ids, p.location_ids, p.event_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_hidden_events AS h WHERE h.user_id = d.user_id AND h.event_id = x.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users AS bu WHERE bu.blocker_user_id = d.user_id AND bu.blocked_user_id = x.created_by
    )
  ORDER BY d.user_id, x.date, x.id
$$;

COMMENT ON FUNCTION public.app_digest_for_me(timestamp, timestamp, timestamp) IS
  'Résumés de « Pour toi » (crons daily-events et weekly-summary, service) : pour chaque utilisateur qui a un goût actif, les événements de app_events_in_range sur [range_start, range_end) qui sont pour lui (app_is_for_me_by_ids, son profil app_for_me_profile_of), sans ses masqués ni les auteurs qu''il a bloqués ; une ligne à event_id null pour qui n''a rien. Migration 20261024210000.';

REVOKE ALL ON FUNCTION public.app_digest_for_me(timestamp, timestamp, timestamp) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_digest_for_me(timestamp, timestamp, timestamp) TO service_role;

-- 3. Les catégories cochées deviennent des goûts (choix 6), le jour de la sortie --------------------------------------
--
-- Les catégories d'un utilisateur, comme les lisent les crons (getEffectiveNotificationCategoryIds) : category_ids
-- s'il en a ([] : aucune), sinon ses lignes de user_notification_categories. Un choix : au moins une, et pas toutes
-- les catégories actives (le défaut de l'app). Pour chaque catégorie choisie, les goûts actifs qui la prennent ;
-- Spectacle, que les goûts découpent par ses tags, devient Théâtre, Humour et Cirque. Seulement pour qui n'a encore
-- aucun goût : un choix fait dans l'app passe avant. Rend une ligne par utilisateur concerné, et ses goûts.
CREATE OR REPLACE FUNCTION public.app_interests_from_categories(apply boolean DEFAULT false)
RETURNS TABLE (
  user_id uuid,
  interest_slugs text[]
)
LANGUAGE sql
VOLATILE
SECURITY INVOKER
AS $$
  WITH actives AS (
    SELECT array_agg(c.id::text) AS ids FROM public.categories AS c WHERE c.is_active
  ),
  choix AS (
    SELECT p.user_id, p.category_ids AS ids
    FROM public.user_notification_preferences AS p
    WHERE cardinality(p.category_ids) > 0
    UNION ALL
    SELECT r.user_id, array_agg(r.category_id::text)
    FROM public.user_notification_categories AS r
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_notification_preferences AS p
      WHERE p.user_id = r.user_id AND p.category_ids IS NOT NULL
    )
    GROUP BY r.user_id
  ),
  choix_reels AS (
    SELECT ch.user_id, ch.ids
    FROM choix AS ch
    CROSS JOIN actives AS a
    WHERE NOT (ch.ids @> a.ids)
      AND NOT EXISTS (SELECT 1 FROM public.user_interests AS ui WHERE ui.user_id = ch.user_id)
  ),
  plan AS (
    SELECT DISTINCT cr.user_id, i.id AS interest_id, i.slug, i.display_order
    FROM choix_reels AS cr
    JOIN public.app_interests AS i ON i.is_active AND NOT i.family
    WHERE i.category_ids::text[] && cr.ids
      OR (
        i.slug = ANY (ARRAY['theatre', 'humour', 'cirque'])
        AND EXISTS (
          SELECT 1 FROM public.categories AS c
          WHERE upper(btrim(c.name)) = 'SPECTACLE' AND c.id::text = ANY (cr.ids)
        )
      )
  ),
  -- Écrite seulement avec apply ; lue ou non, une écriture du WITH a toujours lieu, une fois.
  ecrits AS (
    INSERT INTO public.user_interests (user_id, interest_id)
    SELECT pl.user_id, pl.interest_id
    FROM plan AS pl
    WHERE app_interests_from_categories.apply
    ON CONFLICT (user_id, interest_id) DO NOTHING
    RETURNING 1
  )
  SELECT pl.user_id, array_agg(pl.slug ORDER BY pl.display_order)
  FROM plan AS pl
  GROUP BY pl.user_id
  ORDER BY pl.user_id
$$;

COMMENT ON FUNCTION public.app_interests_from_categories(boolean) IS
  'Choix 6 de « Pour toi » : les catégories cochées pour les résumés (un choix, pas toutes : le défaut) deviennent des goûts, pour qui n''en a pas encore ; Spectacle devient Théâtre, Humour et Cirque. Sans apply, rien n''est écrit (ce qui le serait). À lancer une fois, le jour de la sortie de la version de l''app qui a « Pour toi ». Migration 20261024210000.';

REVOKE ALL ON FUNCTION public.app_interests_from_categories(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_interests_from_categories(boolean) TO service_role;

-- Vérification (SQL Editor) : les droits ; ce que la reprise des catégories écrirait (rien n'est écrit).
-- select has_function_privilege('anon', 'public.app_digest_for_me(timestamp, timestamp, timestamp)', 'execute');
-- select count(*), sum(cardinality(interest_slugs)) from public.app_interests_from_categories(false);

-- Rollback, dans cet ordre :
-- DROP FUNCTION IF EXISTS public.app_interests_from_categories(boolean);
-- DROP FUNCTION IF EXISTS public.app_digest_for_me(timestamp, timestamp, timestamp);
-- recréer app_is_for_me de 20261024190000_create_pour_toi.sql (sa définition, même signature) ;
-- DROP FUNCTION IF EXISTS public.app_is_for_me_by_ids(uuid, uuid, uuid[], uuid[], uuid[], uuid[]);
