-- event_likes : chacun ne lit plus que ses propres favoris.
--
-- ⚠️ À APPLIQUER EN PROD SEULEMENT QUAND LES VERSIONS DE L'APP EN CIRCULATION COMPTENT LES FAVORIS
-- PAR event_like_counts() (20261020180000_create_event_like_counts.sql). Avant, « Mes suggestions »
-- lisait toutes les lignes d'un événement pour les compter : avec cette policy, une ancienne version
-- y afficherait 0 (ou 1, le favori de l'utilisateur). Date d'application : voir MIGRATIONS_LOG.md.
--
-- Avant : « Users can view all event likes », `USING (true)` pour public (anon compris) : avec la
-- clé publique, n'importe qui lisait quel utilisateur avait aimé quel événement.
-- Après : `auth.uid() = user_id`, comme les policies INSERT et DELETE de la table. L'app ne lit que
-- les lignes de l'utilisateur connecté (`EventLikeService._fetchLikedIdsForUser`, filtre
-- `user_id`) : ses favoris, l'état du cœur et la liste des favoris ne changent pas. L'admin ne lit
-- pas event_likes ; le service role ignore la RLS.

DROP POLICY IF EXISTS "Users can view all event likes" ON public.event_likes;
DROP POLICY IF EXISTS "Users can view their own event likes" ON public.event_likes;

CREATE POLICY "Users can view their own event likes"
  ON public.event_likes
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Vérification, en anon : `GET /rest/v1/event_likes?select=id&limit=1` → `[]`.

-- Rollback :
-- DROP POLICY IF EXISTS "Users can view their own event likes" ON public.event_likes;
-- CREATE POLICY "Users can view all event likes" ON public.event_likes FOR SELECT USING (true);
