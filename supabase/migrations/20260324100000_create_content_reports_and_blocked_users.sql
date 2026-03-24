CREATE OR REPLACE FUNCTION public.is_user_safety_suspended()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  suspended_flag text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT raw_user_meta_data->>'ugc_suspended'
  INTO suspended_flag
  FROM auth.users
  WHERE id = auth.uid();

  RETURN COALESCE(lower(suspended_flag), 'false') IN ('true', '1', 'yes');
END;
$$;

COMMENT ON FUNCTION public.is_user_safety_suspended() IS
'Retourne true si le compte courant est suspendu pour les fonctionnalites UGC.';

CREATE OR REPLACE FUNCTION public.can_use_ugc_features()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.is_real_authenticated_user()
    AND public.is_user_safety_suspended() = false;
$$;

COMMENT ON FUNCTION public.can_use_ugc_features() IS
'Retourne true uniquement pour les comptes reels non suspendus pouvant soumettre du contenu.';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_safety_hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_events_created_by
  ON public.events USING btree (created_by);

CREATE INDEX IF NOT EXISTS idx_events_approved_visible_date
  ON public.events USING btree (date)
  WHERE (
    status = 'approved'::text
    AND archived = false
    AND is_safety_hidden = false
  );

CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL DEFAULT 'event' CHECK (target_type IN ('event')),
  target_event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason_code text NOT NULL CHECK (
    reason_code IN (
      'abuse',
      'harassment',
      'hate',
      'sexual',
      'violence',
      'spam',
      'illegal',
      'impersonation',
      'other'
    )
  ),
  details text,
  block_requested boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'under_review', 'actioned', 'dismissed')
  ),
  review_due_at timestamptz NOT NULL DEFAULT (timezone('utc', now()) + interval '24 hours'),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  report_id uuid REFERENCES public.content_reports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT blocked_users_unique UNIQUE (blocker_user_id, blocked_user_id),
  CONSTRAINT blocked_users_no_self_block CHECK (blocker_user_id <> blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status_due
  ON public.content_reports USING btree (status, review_due_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_reports_target_event
  ON public.content_reports USING btree (target_event_id);

CREATE INDEX IF NOT EXISTS idx_content_reports_reported_user
  ON public.content_reports USING btree (reported_user_id);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker
  ON public.blocked_users USING btree (blocker_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked
  ON public.blocked_users USING btree (blocked_user_id);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved events are viewable by everyone"
  ON public.events;

CREATE POLICY "Approved events are viewable by everyone"
  ON public.events
  FOR SELECT
  USING (
    status = 'approved'::text
    AND COALESCE(is_safety_hidden, false) = false
  );

DROP POLICY IF EXISTS "Authenticated users can create events"
  ON public.events;

CREATE POLICY "Authenticated users can create events"
  ON public.events
  FOR INSERT
  WITH CHECK (
    public.can_use_ugc_features()
    AND auth.uid() = created_by
  );

DROP POLICY IF EXISTS "Users can update their own pending events"
  ON public.events;

CREATE POLICY "Users can update their own pending events"
  ON public.events
  FOR UPDATE
  USING (
    public.can_use_ugc_features()
    AND auth.uid() = created_by
    AND status = 'pending'::text
  )
  WITH CHECK (
    public.can_use_ugc_features()
    AND auth.uid() = created_by
    AND status = 'pending'::text
  );

DROP POLICY IF EXISTS "Users can delete their own pending events"
  ON public.events;

CREATE POLICY "Users can delete their own pending events"
  ON public.events
  FOR DELETE
  USING (
    public.can_use_ugc_features()
    AND auth.uid() = created_by
    AND status = 'pending'::text
  );

DROP POLICY IF EXISTS "Authenticated users can create event requests"
  ON public.user_requests;

CREATE POLICY "Authenticated users can create event requests"
  ON public.user_requests
  FOR INSERT
  WITH CHECK (
    public.can_use_ugc_features()
    AND request_type = 'event_creation'::text
    AND requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated users can create event from url requests"
  ON public.user_requests;

CREATE POLICY "Authenticated users can create event from url requests"
  ON public.user_requests
  FOR INSERT
  WITH CHECK (
    public.can_use_ugc_features()
    AND request_type = 'event_from_url'::text
    AND requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can view their own content reports"
  ON public.content_reports;

DROP POLICY IF EXISTS "Users can create their own content reports"
  ON public.content_reports;

DROP POLICY IF EXISTS "Admins can manage all content reports"
  ON public.content_reports;

CREATE POLICY "Users can view their own content reports"
  ON public.content_reports
  FOR SELECT
  USING (
    auth.uid() = reporter_user_id
    OR public.is_user_admin() = true
  );

CREATE POLICY "Users can create their own content reports"
  ON public.content_reports
  FOR INSERT
  WITH CHECK (
    public.can_use_ugc_features()
    AND auth.uid() = reporter_user_id
  );

CREATE POLICY "Admins can manage all content reports"
  ON public.content_reports
  USING (
    auth.uid() IS NOT NULL
    AND public.is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_user_admin() = true
  );

DROP POLICY IF EXISTS "Users can view their own blocked users"
  ON public.blocked_users;

DROP POLICY IF EXISTS "Users can create their own blocked users"
  ON public.blocked_users;

DROP POLICY IF EXISTS "Users can delete their own blocked users"
  ON public.blocked_users;

DROP POLICY IF EXISTS "Admins can manage all blocked users"
  ON public.blocked_users;

CREATE POLICY "Users can view their own blocked users"
  ON public.blocked_users
  FOR SELECT
  USING (
    auth.uid() = blocker_user_id
    OR public.is_user_admin() = true
  );

CREATE POLICY "Users can create their own blocked users"
  ON public.blocked_users
  FOR INSERT
  WITH CHECK (
    public.can_use_ugc_features()
    AND auth.uid() = blocker_user_id
  );

CREATE POLICY "Users can delete their own blocked users"
  ON public.blocked_users
  FOR DELETE
  USING (
    auth.uid() = blocker_user_id
    OR public.is_user_admin() = true
  );

CREATE POLICY "Admins can manage all blocked users"
  ON public.blocked_users
  USING (
    auth.uid() IS NOT NULL
    AND public.is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_user_admin() = true
  );

DROP TRIGGER IF EXISTS update_content_reports_updated_at
  ON public.content_reports;

CREATE TRIGGER update_content_reports_updated_at
  BEFORE UPDATE ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_blocked_users_updated_at
  ON public.blocked_users;

CREATE TRIGGER update_blocked_users_updated_at
  BEFORE UPDATE ON public.blocked_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
