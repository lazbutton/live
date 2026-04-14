ALTER TABLE public.user_requests
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS contributor_message text,
  ADD COLUMN IF NOT EXISTS allow_user_resubmission boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contributor_display_name text,
  ADD COLUMN IF NOT EXISTS community_attribution_opt_in boolean NOT NULL DEFAULT false;

UPDATE public.user_requests
SET internal_notes = notes
WHERE internal_notes IS NULL
  AND notes IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_requests_moderation_reason_check'
  ) THEN
    ALTER TABLE public.user_requests
      DROP CONSTRAINT user_requests_moderation_reason_check;
  END IF;
END $$;

ALTER TABLE public.user_requests
  ADD CONSTRAINT user_requests_moderation_reason_check
  CHECK (
    moderation_reason IS NULL OR moderation_reason = ANY (
      ARRAY[
        'duplicate'::text,
        'invalid_date'::text,
        'insufficient_info'::text,
        'unreliable_source'::text,
        'out_of_scope'::text
      ]
    )
  );

COMMENT ON COLUMN public.user_requests.internal_notes IS 'Notes internes visibles uniquement côté admin.';
COMMENT ON COLUMN public.user_requests.moderation_reason IS 'Motif structuré de revue/rejet: duplicate, invalid_date, insufficient_info, unreliable_source, out_of_scope.';
COMMENT ON COLUMN public.user_requests.contributor_message IS 'Message exploitable envoyé au contributeur dans l’application.';
COMMENT ON COLUMN public.user_requests.allow_user_resubmission IS 'Indique si la demande rejetée peut être corrigée et renvoyée par le contributeur.';
COMMENT ON COLUMN public.user_requests.contributor_display_name IS 'Nom public à utiliser pour une attribution communautaire si opt-in.';
COMMENT ON COLUMN public.user_requests.community_attribution_opt_in IS 'Autorisation d’attribution publique de la contribution. Vrai par défaut.';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS community_submission boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS community_attribution_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS community_contributor_label text;

COMMENT ON COLUMN public.events.community_submission IS 'Vrai si l’événement provient d’une suggestion communautaire validée.';
COMMENT ON COLUMN public.events.community_attribution_opt_in IS 'Autorisation d’afficher nominativement le contributeur sur la fiche événement.';
COMMENT ON COLUMN public.events.community_contributor_label IS 'Nom public du contributeur si l’attribution communautaire est autorisée.';

CREATE OR REPLACE FUNCTION public.convert_event_request_to_event(request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_event_id UUID;
  request_data RECORD;
  current_user_id UUID;
  event_json JSONB;
  normalized_contributor_label text;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  IF NOT is_user_admin() THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent convertir des demandes en événements';
  END IF;

  SELECT * INTO request_data
  FROM user_requests
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

  INSERT INTO events (
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
    NULLIF(event_json->>'location_id', 'null')::UUID,
    NULLIF(event_json->>'image_url', 'null'),
    event_json->>'category',
    NULLIF(event_json->>'price', 'null')::DECIMAL,
    NULLIF(event_json->>'presale_price', 'null')::DECIMAL,
    NULLIF(event_json->>'subscriber_price', 'null')::DECIMAL,
    NULLIF(event_json->>'address', 'null'),
    NULLIF(event_json->>'capacity', 'null')::INTEGER,
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
  ) RETURNING id INTO new_event_id;

  IF event_json->>'organizer_id' IS NOT NULL AND event_json->>'organizer_id' != 'null' THEN
    INSERT INTO event_organizers (event_id, organizer_id)
    VALUES (new_event_id, (event_json->>'organizer_id')::UUID)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE user_requests
  SET
    status = 'converted',
    converted_event_id = new_event_id,
    converted_at = NOW(),
    reviewed_by = current_user_id,
    reviewed_at = NOW(),
    internal_notes = concat_ws(
      E'\n',
      NULLIF(BTRIM(internal_notes), ''),
      'Converti en événement ID: ' || new_event_id::TEXT
    ),
    notes = concat_ws(
      E'\n',
      NULLIF(BTRIM(notes), ''),
      'Converti en événement ID: ' || new_event_id::TEXT
    )
  WHERE id = request_id;

  RETURN new_event_id;
END;
$$;

COMMENT ON FUNCTION public.convert_event_request_to_event(request_id uuid) IS 'Convertit une demande event_creation (user_requests) en événement status=pending, en préservant le feedback structuré et les métadonnées de contribution communautaire.';

DROP POLICY IF EXISTS "Users can manage their own pending event requests" ON public.user_requests;

CREATE POLICY "Users can manage their own actionable event requests"
  ON public.user_requests
  FOR UPDATE
  USING (
    (
      (request_type = 'event_creation'::text) OR
      (request_type = 'event_from_url'::text)
    ) AND
    (requested_by = auth.uid()) AND
    (
      (status = 'pending'::text) OR
      ((status = 'rejected'::text) AND (allow_user_resubmission = true))
    )
  )
  WITH CHECK (
    (
      (request_type = 'event_creation'::text) OR
      (request_type = 'event_from_url'::text)
    ) AND
    (requested_by = auth.uid()) AND
    (
      (status = 'pending'::text) OR
      ((status = 'rejected'::text) AND (allow_user_resubmission = true))
    )
  );
