-- Domaine public utilisé par les triggers pg_net de notifications admin.
-- Un éventuel paramètre app.api_url peut remplacer le domaine sans migration.

CREATE OR REPLACE FUNCTION public.notify_admins_new_request_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  api_base_url text;
  payload json;
  response_id bigint;
BEGIN
  api_base_url := COALESCE(
    NULLIF(current_setting('app.api_url', true), ''),
    'https://www.outlive.fr'
  );
  payload := json_build_object(
    'id', NEW.id,
    'request_type', NEW.request_type,
    'event_data', NEW.event_data,
    'source_url', NEW.source_url,
    'requested_at', NEW.requested_at
  );

  SELECT net.http_post(
    url := api_base_url || '/api/notifications/admin/new-request',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload::text
  ) INTO response_id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      'Erreur lors de la notification de la demande %: %',
      NEW.id,
      SQLERRM;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admins_new_feedback_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  api_base_url text;
  payload json;
  response_id bigint;
BEGIN
  api_base_url := COALESCE(
    NULLIF(current_setting('app.api_url', true), ''),
    'https://www.outlive.fr'
  );
  payload := json_build_object(
    'id', NEW.id,
    'description', NEW.description,
    'user_id', NEW.user_id,
    'status', NEW.status,
    'feedback_object_id', NEW.feedback_object_id,
    'created_at', NEW.created_at
  );

  SELECT net.http_post(
    url := api_base_url || '/api/notifications/admin/new-feedback',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload::text
  ) INTO response_id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      'Erreur lors de la notification du feedback %: %',
      NEW.id,
      SQLERRM;
    RETURN NEW;
END;
$$;
