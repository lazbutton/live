-- Événements visibles dans l'app publique : une seule définition.
--
-- L'app Flutter lit `supabase.rpc('app_events', get: true)` au lieu de répéter
-- status / archived / show_on_app dans chacune de ses requêtes.
--
-- Prérequis : 20260915120000_add_show_on_app_and_agenda_types.sql (colonne show_on_app).
--
-- Fonction plutôt que vue : une vue `select *` fige ses colonnes à sa création, et une
-- colonne ajoutée plus tard à events ferait échouer les requêtes de l'app qui la
-- sélectionnent. `setof public.events` suit la table, et PostgREST garde les jointures
-- (locations, event_organizers, event_artists…) comme sur la table.
--
-- `language sql` + `stable` + `security invoker`, sans clause SET : Postgres « inline »
-- la fonction, donc les filtres, le tri et le limit envoyés par l'app s'appliquent
-- directement sur events avec ses index, et la RLS de l'utilisateur reste appliquée.

CREATE OR REPLACE FUNCTION public.app_events()
RETURNS SETOF public.events
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT *
  FROM public.events
  WHERE status = 'approved'
    AND archived = false
    AND show_on_app = true
    AND is_safety_hidden = false
$$;

COMMENT ON FUNCTION public.app_events() IS
  'Événements visibles dans l''app : approuvés, non archivés, show_on_app, non masqués par la modération. Seule source de cette règle pour l''app Flutter.';

GRANT EXECUTE ON FUNCTION public.app_events() TO anon, authenticated;

-- Rollback :
-- DROP FUNCTION IF EXISTS public.app_events();
