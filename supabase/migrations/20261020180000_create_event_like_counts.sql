-- Nombre de favoris (event_likes) d'événements, sans exposer qui les a mis.
--
-- La policy SELECT de event_likes est `USING (true)` (baseline) : avec la clé anon publique,
-- n'importe qui lit quel utilisateur a aimé quel événement (constaté en prod le 2026-10-20). L'app
-- s'en sert pour compter les favoris de « Mes suggestions » en lisant toutes les lignes d'un
-- événement. Cette fonction rend le compte seul ; une fois les versions de l'app en circulation
-- passées par elle, 20261020181000_restrict_event_likes_select.sql réserve la lecture des lignes à
-- leur auteur.
--
-- event_like_counts(event_ids) : une ligne (event_id, likes_count) par id demandé, pour les
-- événements visibles dans l'app (app_events()) et ceux créés par l'appelant (events.created_by,
-- même en attente, masqués ou retirés de l'app : ce sont ses contributions). Un autre événement,
-- inconnu ou non visible, n'a pas de ligne : l'app compte alors 0. Ids nuls ignorés, ids en double
-- une ligne, au plus 200 ids par appel.
--
-- `security definer` pour compter malgré la RLS de event_likes (après le changement de policy,
-- l'appelant ne voit plus que ses propres lignes) ; `set search_path = ''`, tout est qualifié.
-- `stable`. Exécutable par anon et authenticated seulement.
-- Prérequis : 20261017120000_create_app_events_function.sql (app_events()).

CREATE OR REPLACE FUNCTION public.event_like_counts(event_ids uuid[])
RETURNS TABLE (
  event_id uuid,
  likes_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH demandes AS (
    SELECT DISTINCT x.id
    FROM unnest(coalesce(event_like_counts.event_ids, '{}'::uuid[])) AS x(id)
    WHERE x.id IS NOT NULL
    LIMIT 200
  ),
  autorises AS (
    SELECT d.id
    FROM demandes AS d
    JOIN public.app_events() AS e ON e.id = d.id
    UNION
    SELECT d.id
    FROM demandes AS d
    JOIN public.events AS e ON e.id = d.id
    WHERE e.created_by = (SELECT auth.uid())
  )
  SELECT
    a.id,
    (SELECT count(*) FROM public.event_likes AS l WHERE l.event_id = a.id)::integer
  FROM autorises AS a
  ORDER BY a.id
$$;

COMMENT ON FUNCTION public.event_like_counts(uuid[]) IS
  'Nombre de favoris (event_likes) de chaque événement demandé, visible dans l''app (app_events()) ou créé par l''appelant ; sans les lignes ni leurs auteurs. Au plus 200 ids.';

REVOKE ALL ON FUNCTION public.event_like_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_like_counts(uuid[]) TO anon, authenticated;

-- Vérification (SQL Editor) : les événements publiés les plus aimés.
-- select e.title, c.likes_count
-- from public.event_like_counts(array(select event_id from public.event_likes)) as c
-- join public.events as e on e.id = c.event_id
-- order by c.likes_count desc limit 5;

-- Rollback :
-- DROP FUNCTION IF EXISTS public.event_like_counts(uuid[]);
