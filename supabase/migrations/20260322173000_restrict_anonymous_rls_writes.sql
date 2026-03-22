CREATE OR REPLACE FUNCTION public.is_real_authenticated_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'provider', '') <> 'anonymous';
$$;

COMMENT ON FUNCTION public.is_real_authenticated_user() IS
'Retourne true uniquement pour les comptes authentifiés non anonymes.';

-- ---------------------------------------------------------------------------
-- locations / organizers / event_organizers
-- Conserver les lectures publiques utiles, mais bloquer les écritures anonymes.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can manage locations"
  ON public.locations;

CREATE POLICY "Real users can insert locations"
  ON public.locations
  FOR INSERT
  WITH CHECK (public.is_real_authenticated_user());

CREATE POLICY "Real users can update locations"
  ON public.locations
  FOR UPDATE
  USING (public.is_real_authenticated_user())
  WITH CHECK (public.is_real_authenticated_user());

CREATE POLICY "Real users can delete locations"
  ON public.locations
  FOR DELETE
  USING (public.is_real_authenticated_user());

DROP POLICY IF EXISTS "Authenticated users can manage organizers"
  ON public.organizers;

CREATE POLICY "Real users can insert organizers"
  ON public.organizers
  FOR INSERT
  WITH CHECK (public.is_real_authenticated_user());

CREATE POLICY "Real users can update organizers"
  ON public.organizers
  FOR UPDATE
  USING (public.is_real_authenticated_user())
  WITH CHECK (public.is_real_authenticated_user());

CREATE POLICY "Real users can delete organizers"
  ON public.organizers
  FOR DELETE
  USING (public.is_real_authenticated_user());

DROP POLICY IF EXISTS "Authenticated users can manage event organizers"
  ON public.event_organizers;

DROP POLICY IF EXISTS "Event organizers for approved events are viewable by everyone"
  ON public.event_organizers;

DROP POLICY IF EXISTS "Real users can view event organizers"
  ON public.event_organizers;

CREATE POLICY "Event organizers for approved events are viewable by everyone"
  ON public.event_organizers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.events
      WHERE public.events.id = public.event_organizers.event_id
        AND public.events.status = 'approved'
    )
  );

CREATE POLICY "Real users can view event organizers"
  ON public.event_organizers
  FOR SELECT
  USING (public.is_real_authenticated_user());

CREATE POLICY "Real users can insert event organizers"
  ON public.event_organizers
  FOR INSERT
  WITH CHECK (public.is_real_authenticated_user());

CREATE POLICY "Real users can update event organizers"
  ON public.event_organizers
  FOR UPDATE
  USING (public.is_real_authenticated_user())
  WITH CHECK (public.is_real_authenticated_user());

CREATE POLICY "Real users can delete event organizers"
  ON public.event_organizers
  FOR DELETE
  USING (public.is_real_authenticated_user());

-- ---------------------------------------------------------------------------
-- feedbacks
-- L'UI bloque déjà les invités. On aligne maintenant le backend.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can create feedbacks"
  ON public.feedbacks;

CREATE POLICY "Authenticated users can create feedbacks"
  ON public.feedbacks
  FOR INSERT
  WITH CHECK (
    public.is_real_authenticated_user()
    AND auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can update their own pending feedbacks"
  ON public.feedbacks;

CREATE POLICY "Users can update their own pending feedbacks"
  ON public.feedbacks
  FOR UPDATE
  USING (
    public.is_real_authenticated_user()
    AND auth.uid() = user_id
    AND status = 'pending'
  )
  WITH CHECK (
    public.is_real_authenticated_user()
    AND auth.uid() = user_id
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Users can view their own feedbacks"
  ON public.feedbacks;

CREATE POLICY "Users can view their own feedbacks"
  ON public.feedbacks
  FOR SELECT
  USING (
    (
      public.is_real_authenticated_user()
      AND auth.uid() = user_id
    )
    OR public.is_user_admin() = true
  );

-- ---------------------------------------------------------------------------
-- user_requests
-- Réserver les demandes de création aux comptes réels.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can create event from url requests"
  ON public.user_requests;

CREATE POLICY "Authenticated users can create event from url requests"
  ON public.user_requests
  FOR INSERT
  WITH CHECK (
    public.is_real_authenticated_user()
    AND request_type = 'event_from_url'
    AND requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated users can create event requests"
  ON public.user_requests;

CREATE POLICY "Authenticated users can create event requests"
  ON public.user_requests
  FOR INSERT
  WITH CHECK (
    public.is_real_authenticated_user()
    AND request_type = 'event_creation'
    AND requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can manage their own pending event requests"
  ON public.user_requests;

CREATE POLICY "Users can manage their own pending event requests"
  ON public.user_requests
  FOR UPDATE
  USING (
    public.is_real_authenticated_user()
    AND (
      request_type = 'event_creation'
      OR request_type = 'event_from_url'
    )
    AND requested_by = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    public.is_real_authenticated_user()
    AND (
      request_type = 'event_creation'
      OR request_type = 'event_from_url'
    )
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Users can delete their own pending event requests"
  ON public.user_requests;

CREATE POLICY "Users can delete their own pending event requests"
  ON public.user_requests
  FOR DELETE
  USING (
    public.is_real_authenticated_user()
    AND (
      request_type = 'event_creation'
      OR request_type = 'event_from_url'
    )
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Users can view their own event requests"
  ON public.user_requests;

CREATE POLICY "Users can view their own event requests"
  ON public.user_requests
  FOR SELECT
  USING (
    (
      public.is_real_authenticated_user()
      AND (
        request_type = 'event_creation'
        OR request_type = 'event_from_url'
      )
      AND requested_by = auth.uid()
    )
    OR (
      auth.uid() IS NOT NULL
      AND public.is_user_admin() = true
    )
  );

-- ---------------------------------------------------------------------------
-- events
-- Réserver la création et la gestion des événements utilisateurs aux comptes réels.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can create events"
  ON public.events;

CREATE POLICY "Authenticated users can create events"
  ON public.events
  FOR INSERT
  WITH CHECK (
    public.is_real_authenticated_user()
    AND auth.uid() = created_by
  );

DROP POLICY IF EXISTS "Users can update their own pending events"
  ON public.events;

CREATE POLICY "Users can update their own pending events"
  ON public.events
  FOR UPDATE
  USING (
    public.is_real_authenticated_user()
    AND auth.uid() = created_by
    AND status = 'pending'
  )
  WITH CHECK (
    public.is_real_authenticated_user()
    AND auth.uid() = created_by
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Users can delete their own pending events"
  ON public.events;

CREATE POLICY "Users can delete their own pending events"
  ON public.events
  FOR DELETE
  USING (
    public.is_real_authenticated_user()
    AND auth.uid() = created_by
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Users can view their own events"
  ON public.events;

CREATE POLICY "Users can view their own events"
  ON public.events
  FOR SELECT
  USING (
    public.is_real_authenticated_user()
    AND auth.uid() = created_by
  );
