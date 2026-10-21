-- ============================================
-- Migration : RLS d'events évaluée une fois par requête, pas par ligne
-- Date : 2026-10-21
-- Description : mêmes droits, écrits pour que Postgres ne refasse pas les vérifications à chaque
-- événement lu. Relevé en prod le 2026-10-21 (MIGRATIONS_LOG.md, « Séries ») : en anon,
-- « Organizers can view their events » rejouait pour chaque ligne un EXISTS sur user_organizers, dont
-- la RLS appelait is_user_admin() à chaque ligne : ~0,5 ms par événement, ~188 ms pour les 362
-- événements à venir.
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- Politiques d'events (lecture, modification, suppression) et de user_organizers, réécrites sans
-- changer leur nom, leur commande ni leurs rôles :
-- - is_user_admin(), auth.uid(), is_real_authenticated_user(), can_use_ugc_features() entre parenthèses
--   « (SELECT …) » : une InitPlan, calculée une fois par requête au lieu d'une fois par ligne (ces
--   fonctions ne dépendent pas de la ligne) ;
-- - « EXISTS (… WHERE eo.event_id = events.id AND …) » devient « events.id IN (SELECT eo.event_id …) » :
--   un sous-plan haché, construit une fois par requête (un EXISTS corrélé peut être rejoué par ligne,
--   au choix du planificateur), et seulement pour une session connectée (« (SELECT auth.uid()) IS NOT
--   NULL AND … » : sans session, le sous-plan ne tourne pas). Même jointure, mêmes tables (lues avec
--   leur RLS comme avant), mêmes rôles d'organisateur.
-- Les politiques d'insertion ne bougent pas (évaluées une fois par ligne insérée).
-- Droits prouvés identiques par supabase/tests/events_rls.test.sql : ses cas de droits passent avant et
-- après ce fichier ; ceux de la forme des politiques, seulement après.

-- ============================================
-- CODE SQL
-- ============================================

-- events : admins ------------------------------------------------------------------------------------

ALTER POLICY "Admins can view all events" ON public.events
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()) = true);

ALTER POLICY "Admins can update all events" ON public.events
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()) = true)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()) = true);

ALTER POLICY "Admins can delete all events" ON public.events
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()) = true);

-- events : auteur ------------------------------------------------------------------------------------

ALTER POLICY "Users can view their own events" ON public.events
  USING ((SELECT public.is_real_authenticated_user()) AND (SELECT auth.uid()) = created_by);

ALTER POLICY "Users can update their own pending events" ON public.events
  USING ((SELECT public.can_use_ugc_features()) AND (SELECT auth.uid()) = created_by AND status = 'pending')
  WITH CHECK ((SELECT public.can_use_ugc_features()) AND (SELECT auth.uid()) = created_by AND status = 'pending');

ALTER POLICY "Users can delete their own pending events" ON public.events
  USING ((SELECT public.can_use_ugc_features()) AND (SELECT auth.uid()) = created_by AND status = 'pending');

-- events : organisateurs -----------------------------------------------------------------------------
-- La jointure est celle de 20250114000000_add_user_organizers.sql : un lien de l'utilisateur
-- (user_organizers, avec le rôle demandé) et un organisateur de l'événement qui est cet organisateur, ou
-- un lieu-organisateur lié à l'utilisateur (par n'importe lequel de ses liens, comme avant).

ALTER POLICY "Organizers can view their events" ON public.events
  USING (
    (SELECT public.is_user_admin())
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND id IN (
        SELECT eo.event_id
        FROM public.event_organizers eo
        JOIN public.user_organizers uo ON (
          eo.organizer_id = uo.organizer_id
          OR eo.location_id IN (
            SELECT l.id FROM public.locations l
            WHERE l.is_organizer = true
              AND l.id IN (SELECT uo2.organizer_id FROM public.user_organizers uo2 WHERE uo2.user_id = (SELECT auth.uid()))
          )
        )
        WHERE uo.user_id = (SELECT auth.uid())
      )
    )
  );

ALTER POLICY "Organizers can update their events" ON public.events
  USING (
    (SELECT public.is_user_admin())
    OR (
      status IN ('draft', 'pending', 'approved')
      AND (SELECT auth.uid()) IS NOT NULL
      AND id IN (
        SELECT eo.event_id
        FROM public.event_organizers eo
        JOIN public.user_organizers uo ON (
          eo.organizer_id = uo.organizer_id
          OR eo.location_id IN (
            SELECT l.id FROM public.locations l
            WHERE l.is_organizer = true
              AND l.id IN (SELECT uo2.organizer_id FROM public.user_organizers uo2 WHERE uo2.user_id = (SELECT auth.uid()))
          )
        )
        WHERE uo.user_id = (SELECT auth.uid())
          AND uo.role IN ('owner', 'editor')
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_user_admin())
    OR (
      status IN ('draft', 'pending', 'approved')
      AND (SELECT auth.uid()) IS NOT NULL
      AND id IN (
        SELECT eo.event_id
        FROM public.event_organizers eo
        JOIN public.user_organizers uo ON (
          eo.organizer_id = uo.organizer_id
          OR eo.location_id IN (
            SELECT l.id FROM public.locations l
            WHERE l.is_organizer = true
              AND l.id IN (SELECT uo2.organizer_id FROM public.user_organizers uo2 WHERE uo2.user_id = (SELECT auth.uid()))
          )
        )
        WHERE uo.user_id = (SELECT auth.uid())
          AND uo.role IN ('owner', 'editor')
      )
    )
  );

ALTER POLICY "Organizers can delete their pending events" ON public.events
  USING (
    (SELECT public.is_user_admin())
    OR (
      status IN ('draft', 'pending')
      AND (SELECT auth.uid()) IS NOT NULL
      AND id IN (
        SELECT eo.event_id
        FROM public.event_organizers eo
        JOIN public.user_organizers uo ON (
          eo.organizer_id = uo.organizer_id
          OR eo.location_id IN (
            SELECT l.id FROM public.locations l
            WHERE l.is_organizer = true
              AND l.id IN (SELECT uo2.organizer_id FROM public.user_organizers uo2 WHERE uo2.user_id = (SELECT auth.uid()))
          )
        )
        WHERE uo.user_id = (SELECT auth.uid())
          AND uo.role = 'owner'
      )
    )
  );

-- user_organizers (lue par les politiques ci-dessus) -----------------------------------------------

ALTER POLICY "Users can view their own organizer associations" ON public.user_organizers
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Admins can view all organizer associations" ON public.user_organizers
  USING ((SELECT public.is_user_admin()));

ALTER POLICY "Admins can manage organizer associations" ON public.user_organizers
  USING ((SELECT public.is_user_admin()))
  WITH CHECK ((SELECT public.is_user_admin()));

-- ============================================
-- ROLLBACK (optionnel)
-- ============================================

-- Reprendre les expressions d'avant par ALTER POLICY : 20250114000000_add_user_organizers.sql
-- (organisateurs, user_organizers), 20251212120000_baseline.sql (admins),
-- 20260322173000_restrict_anonymous_rls_writes.sql et
-- 20260324100000_create_content_reports_and_blocked_users.sql (auteur). Le test
-- events_rls.test.sql passe avec les deux versions.
