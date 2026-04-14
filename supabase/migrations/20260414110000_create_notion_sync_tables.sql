CREATE TABLE public.notion_event_links (
  event_id uuid PRIMARY KEY,
  notion_page_id text NOT NULL UNIQUE,
  notion_page_url text,
  live_updated_at timestamp with time zone,
  notion_last_edited_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  last_sync_direction text,
  last_sync_hash text,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notion_event_links_direction_check
    CHECK (
      last_sync_direction IS NULL
      OR last_sync_direction = ANY (ARRAY['to_notion'::text, 'from_notion'::text])
    )
);

CREATE TABLE public.notion_request_links (
  request_id uuid PRIMARY KEY,
  notion_page_id text NOT NULL UNIQUE,
  notion_page_url text,
  live_updated_at timestamp with time zone,
  notion_last_edited_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  last_sync_direction text,
  last_sync_hash text,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notion_request_links_direction_check
    CHECK (
      last_sync_direction IS NULL
      OR last_sync_direction = ANY (ARRAY['to_notion'::text, 'from_notion'::text])
    )
);

CREATE TABLE public.notion_location_links (
  location_id uuid PRIMARY KEY,
  notion_page_id text NOT NULL UNIQUE,
  notion_page_url text,
  live_updated_at timestamp with time zone,
  notion_last_edited_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  last_sync_direction text,
  last_sync_hash text,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notion_location_links_direction_check
    CHECK (
      last_sync_direction IS NULL
      OR last_sync_direction = ANY (ARRAY['to_notion'::text, 'from_notion'::text])
    )
);

CREATE TABLE public.notion_organizer_links (
  owner_kind text NOT NULL,
  owner_id uuid NOT NULL,
  notion_page_id text NOT NULL UNIQUE,
  notion_page_url text,
  live_updated_at timestamp with time zone,
  notion_last_edited_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  last_sync_direction text,
  last_sync_hash text,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_kind, owner_id),
  CONSTRAINT notion_organizer_links_owner_kind_check
    CHECK (owner_kind = ANY (ARRAY['organizer'::text, 'location'::text])),
  CONSTRAINT notion_organizer_links_direction_check
    CHECK (
      last_sync_direction IS NULL
      OR last_sync_direction = ANY (ARRAY['to_notion'::text, 'from_notion'::text])
    )
);

CREATE TABLE public.notion_sync_jobs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entity_kind text NOT NULL DEFAULT 'unknown',
  entity_id uuid,
  notion_page_id text,
  direction text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamp with time zone NOT NULL DEFAULT now(),
  locked_at timestamp with time zone,
  locked_by text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  CONSTRAINT notion_sync_jobs_entity_kind_check
    CHECK (
      entity_kind = ANY (
        ARRAY[
          'unknown'::text,
          'event'::text,
          'request'::text,
          'location'::text,
          'organizer'::text
        ]
      )
    ),
  CONSTRAINT notion_sync_jobs_direction_check
    CHECK (direction = ANY (ARRAY['to_notion'::text, 'from_notion'::text])),
  CONSTRAINT notion_sync_jobs_status_check
    CHECK (
      status = ANY (
        ARRAY[
          'pending'::text,
          'processing'::text,
          'completed'::text,
          'failed'::text,
          'skipped'::text
        ]
      )
    )
);

CREATE TABLE public.notion_sync_errors (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  job_id uuid REFERENCES public.notion_sync_jobs(id) ON DELETE SET NULL,
  entity_kind text NOT NULL DEFAULT 'unknown',
  entity_id uuid,
  notion_page_id text,
  direction text NOT NULL,
  error_message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notion_sync_errors_entity_kind_check
    CHECK (
      entity_kind = ANY (
        ARRAY[
          'unknown'::text,
          'event'::text,
          'request'::text,
          'location'::text,
          'organizer'::text
        ]
      )
    ),
  CONSTRAINT notion_sync_errors_direction_check
    CHECK (direction = ANY (ARRAY['to_notion'::text, 'from_notion'::text]))
);

CREATE TABLE public.notion_sync_checkpoints (
  checkpoint_key text PRIMARY KEY,
  entity_kind text NOT NULL DEFAULT 'unknown',
  last_notion_cursor text,
  last_webhook_received_at timestamp with time zone,
  last_completed_job_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notion_sync_checkpoints_entity_kind_check
    CHECK (
      entity_kind = ANY (
        ARRAY[
          'unknown'::text,
          'event'::text,
          'request'::text,
          'location'::text,
          'organizer'::text
        ]
      )
    )
);

CREATE INDEX notion_sync_jobs_pending_idx
  ON public.notion_sync_jobs(status, available_at, created_at);

CREATE INDEX notion_sync_jobs_entity_idx
  ON public.notion_sync_jobs(entity_kind, entity_id, direction);

CREATE INDEX notion_sync_errors_created_at_idx
  ON public.notion_sync_errors(created_at DESC);

CREATE UNIQUE INDEX notion_sync_jobs_active_dedupe_idx
  ON public.notion_sync_jobs(dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status = ANY (ARRAY['pending'::text, 'processing'::text]);

CREATE TRIGGER update_notion_event_links_updated_at
  BEFORE UPDATE ON public.notion_event_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notion_request_links_updated_at
  BEFORE UPDATE ON public.notion_request_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notion_location_links_updated_at
  BEFORE UPDATE ON public.notion_location_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notion_organizer_links_updated_at
  BEFORE UPDATE ON public.notion_organizer_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notion_sync_jobs_updated_at
  BEFORE UPDATE ON public.notion_sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notion_sync_checkpoints_updated_at
  BEFORE UPDATE ON public.notion_sync_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enqueue_notion_sync_job(
  p_entity_kind text,
  p_entity_id uuid DEFAULT NULL,
  p_notion_page_id text DEFAULT NULL,
  p_direction text DEFAULT 'to_notion',
  p_reason text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_dedupe_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_job_id uuid;
  created_job_id uuid;
BEGIN
  IF p_entity_kind IS NULL THEN
    p_entity_kind := 'unknown';
  END IF;

  IF p_direction IS NULL THEN
    p_direction := 'to_notion';
  END IF;

  IF p_dedupe_key IS NOT NULL THEN
    SELECT id
    INTO existing_job_id
    FROM public.notion_sync_jobs
    WHERE dedupe_key = p_dedupe_key
      AND status = ANY (ARRAY['pending'::text, 'processing'::text])
    ORDER BY created_at DESC
    LIMIT 1;

    IF existing_job_id IS NOT NULL THEN
      UPDATE public.notion_sync_jobs
      SET
        entity_kind = COALESCE(p_entity_kind, entity_kind),
        entity_id = COALESCE(p_entity_id, entity_id),
        notion_page_id = COALESCE(p_notion_page_id, notion_page_id),
        reason = COALESCE(p_reason, reason),
        payload = COALESCE(payload, '{}'::jsonb) || COALESCE(p_payload, '{}'::jsonb),
        available_at = LEAST(available_at, now()),
        error_message = NULL
      WHERE id = existing_job_id;

      RETURN existing_job_id;
    END IF;
  END IF;

  INSERT INTO public.notion_sync_jobs (
    entity_kind,
    entity_id,
    notion_page_id,
    direction,
    reason,
    payload,
    dedupe_key
  ) VALUES (
    p_entity_kind,
    p_entity_id,
    p_notion_page_id,
    p_direction,
    p_reason,
    COALESCE(p_payload, '{}'::jsonb),
    p_dedupe_key
  )
  RETURNING id INTO created_job_id;

  RETURN created_job_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_notion_sync_job(
  text,
  uuid,
  text,
  text,
  text,
  jsonb,
  text
) IS 'Ajoute un job de synchronisation Notion ou réutilise un job pending/processing partageant la même clé de déduplication.';

CREATE OR REPLACE FUNCTION public.claim_notion_sync_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 10
)
RETURNS SETOF public.notion_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.notion_sync_jobs
    WHERE status = 'pending'
      AND available_at <= now()
    ORDER BY available_at ASC, created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 10), 1)
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.notion_sync_jobs jobs
    SET
      status = 'processing',
      attempt_count = jobs.attempt_count + 1,
      locked_at = now(),
      locked_by = COALESCE(NULLIF(BTRIM(p_worker_id), ''), 'notion-worker'),
      updated_at = now()
    WHERE jobs.id IN (SELECT id FROM candidates)
    RETURNING jobs.*
  )
  SELECT * FROM updated;
END;
$$;

COMMENT ON FUNCTION public.claim_notion_sync_jobs(text, integer) IS 'Réserve les prochains jobs Notion disponibles avec SKIP LOCKED pour un worker donné.';

CREATE OR REPLACE FUNCTION public.convert_event_request_to_event_service(
  request_id uuid,
  reviewed_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_event_id uuid;
  request_data RECORD;
  event_json jsonb;
  normalized_contributor_label text;
BEGIN
  IF reviewed_by IS NULL THEN
    RAISE EXCEPTION 'reviewed_by est requis';
  END IF;

  SELECT * INTO request_data
  FROM public.user_requests
  WHERE id = request_id
    AND request_type = 'event_creation'
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande d''événement non trouvée ou déjà traitée';
  END IF;

  IF request_data.event_data IS NULL THEN
    RAISE EXCEPTION 'Les données de l''événement sont manquantes';
  END IF;

  event_json := request_data.event_data;
  normalized_contributor_label := NULLIF(BTRIM(request_data.contributor_display_name), '');

  INSERT INTO public.events (
    title,
    description,
    date,
    end_date,
    location_id,
    image_url,
    category,
    price,
    presale_price,
    subscriber_price,
    address,
    capacity,
    door_opening_time,
    external_url,
    external_url_label,
    instagram_url,
    facebook_url,
    scraping_url,
    created_by,
    status,
    community_submission,
    community_attribution_opt_in,
    community_contributor_label
  ) VALUES (
    event_json->>'title',
    event_json->>'description',
    (event_json->>'date')::timestamptz,
    NULLIF(event_json->>'end_date', 'null')::timestamptz,
    NULLIF(event_json->>'location_id', 'null')::uuid,
    NULLIF(event_json->>'image_url', 'null'),
    event_json->>'category',
    NULLIF(event_json->>'price', 'null')::decimal,
    NULLIF(event_json->>'presale_price', 'null')::decimal,
    NULLIF(event_json->>'subscriber_price', 'null')::decimal,
    NULLIF(event_json->>'address', 'null'),
    NULLIF(event_json->>'capacity', 'null')::integer,
    NULLIF(event_json->>'door_opening_time', 'null'),
    NULLIF(event_json->>'external_url', 'null'),
    NULLIF(event_json->>'external_url_label', 'null'),
    NULLIF(event_json->>'instagram_url', 'null'),
    NULLIF(event_json->>'facebook_url', 'null'),
    NULLIF(event_json->>'scraping_url', 'null'),
    request_data.requested_by,
    'pending',
    true,
    COALESCE(request_data.community_attribution_opt_in, false),
    CASE
      WHEN COALESCE(request_data.community_attribution_opt_in, false)
        THEN normalized_contributor_label
      ELSE NULL
    END
  )
  RETURNING id INTO new_event_id;

  IF event_json->>'organizer_id' IS NOT NULL AND event_json->>'organizer_id' <> 'null' THEN
    INSERT INTO public.event_organizers (event_id, organizer_id)
    VALUES (new_event_id, (event_json->>'organizer_id')::uuid)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.user_requests
  SET
    status = 'converted',
    converted_event_id = new_event_id,
    converted_at = now(),
    reviewed_by = reviewed_by,
    reviewed_at = now(),
    internal_notes = concat_ws(
      E'\n',
      NULLIF(BTRIM(internal_notes), ''),
      'Converti en événement ID: ' || new_event_id::text
    ),
    notes = concat_ws(
      E'\n',
      NULLIF(BTRIM(notes), ''),
      'Converti en événement ID: ' || new_event_id::text
    )
  WHERE id = request_id;

  RETURN new_event_id;
END;
$$;

COMMENT ON FUNCTION public.convert_event_request_to_event_service(uuid, uuid) IS 'Convertit une user_request en événement depuis un contexte service-role/worker Notion, en enregistrant l’admin technique dans reviewed_by.';

CREATE OR REPLACE FUNCTION public.queue_event_sync_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_event_id uuid;
  target_page_id text;
  payload jsonb;
BEGIN
  target_event_id := COALESCE(NEW.id, OLD.id);
  payload := '{}'::jsonb;

  IF TG_OP = 'DELETE' THEN
    SELECT notion_page_id INTO target_page_id
    FROM public.notion_event_links
    WHERE event_id = OLD.id
    LIMIT 1;

    UPDATE public.notion_event_links
    SET deleted_at = COALESCE(deleted_at, now())
    WHERE event_id = OLD.id;

    payload := jsonb_build_object('action', 'delete');
  ELSIF TG_OP = 'UPDATE' AND COALESCE(NEW.archived, false) = true AND COALESCE(OLD.archived, false) = false THEN
    payload := jsonb_build_object('action', 'archive');
  END IF;

  PERFORM public.enqueue_notion_sync_job(
    'event',
    target_event_id,
    target_page_id,
    'to_notion',
    'events_' || lower(TG_OP),
    payload,
    'event:' || target_event_id::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_request_sync_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_request_id uuid;
  target_page_id text;
  payload jsonb;
BEGIN
  target_request_id := COALESCE(NEW.id, OLD.id);
  payload := '{}'::jsonb;

  IF TG_OP = 'DELETE' THEN
    SELECT notion_page_id INTO target_page_id
    FROM public.notion_request_links
    WHERE request_id = OLD.id
    LIMIT 1;

    UPDATE public.notion_request_links
    SET deleted_at = COALESCE(deleted_at, now())
    WHERE request_id = OLD.id;

    payload := jsonb_build_object('action', 'delete');
  END IF;

  PERFORM public.enqueue_notion_sync_job(
    'request',
    target_request_id,
    target_page_id,
    'to_notion',
    'user_requests_' || lower(TG_OP),
    payload,
    'request:' || target_request_id::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_location_sync_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_location_id uuid;
  target_page_id text;
  payload jsonb;
BEGIN
  target_location_id := COALESCE(NEW.id, OLD.id);
  payload := '{}'::jsonb;

  IF TG_OP = 'DELETE' THEN
    SELECT notion_page_id INTO target_page_id
    FROM public.notion_location_links
    WHERE location_id = OLD.id
    LIMIT 1;

    UPDATE public.notion_location_links
    SET deleted_at = COALESCE(deleted_at, now())
    WHERE location_id = OLD.id;

    payload := jsonb_build_object('action', 'delete');
  END IF;

  PERFORM public.enqueue_notion_sync_job(
    'location',
    target_location_id,
    target_page_id,
    'to_notion',
    'locations_' || lower(TG_OP),
    payload,
    'location:' || target_location_id::text
  );

  PERFORM public.enqueue_notion_sync_job(
    'organizer',
    target_location_id,
    NULL,
    'to_notion',
    'locations_as_organizers_' || lower(TG_OP),
    '{}'::jsonb,
    'organizer:location:' || target_location_id::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_organizer_sync_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_organizer_id uuid;
  target_page_id text;
  payload jsonb;
BEGIN
  target_organizer_id := COALESCE(NEW.id, OLD.id);
  payload := '{}'::jsonb;

  IF TG_OP = 'DELETE' THEN
    SELECT notion_page_id INTO target_page_id
    FROM public.notion_organizer_links
    WHERE owner_kind = 'organizer'
      AND owner_id = OLD.id
    LIMIT 1;

    UPDATE public.notion_organizer_links
    SET deleted_at = COALESCE(deleted_at, now())
    WHERE owner_kind = 'organizer'
      AND owner_id = OLD.id;

    payload := jsonb_build_object('action', 'delete');
  END IF;

  PERFORM public.enqueue_notion_sync_job(
    'organizer',
    target_organizer_id,
    target_page_id,
    'to_notion',
    'organizers_' || lower(TG_OP),
    payload,
    'organizer:organizer:' || target_organizer_id::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_event_sync_job_from_relations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_event_id uuid;
BEGIN
  target_event_id := COALESCE(NEW.event_id, OLD.event_id);

  IF target_event_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.enqueue_notion_sync_job(
    'event',
    target_event_id,
    NULL,
    'to_notion',
    'event_organizers_' || lower(TG_OP),
    '{}'::jsonb,
    'event:' || target_event_id::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER queue_notion_event_sync_on_events
  AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_event_sync_job();

CREATE TRIGGER queue_notion_request_sync_on_user_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.user_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_request_sync_job();

CREATE TRIGGER queue_notion_location_sync_on_locations
  AFTER INSERT OR UPDATE OR DELETE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_location_sync_job();

CREATE TRIGGER queue_notion_organizer_sync_on_organizers
  AFTER INSERT OR UPDATE OR DELETE ON public.organizers
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_organizer_sync_job();

CREATE TRIGGER queue_notion_event_sync_on_event_organizers
  AFTER INSERT OR UPDATE OR DELETE ON public.event_organizers
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_event_sync_job_from_relations();

ALTER TABLE public.notion_event_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_request_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_location_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_organizer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_sync_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_sync_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notion event links"
  ON public.notion_event_links
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can manage notion request links"
  ON public.notion_request_links
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can manage notion location links"
  ON public.notion_location_links
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can manage notion organizer links"
  ON public.notion_organizer_links
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can manage notion sync jobs"
  ON public.notion_sync_jobs
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can manage notion sync errors"
  ON public.notion_sync_errors
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can manage notion sync checkpoints"
  ON public.notion_sync_checkpoints
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));
