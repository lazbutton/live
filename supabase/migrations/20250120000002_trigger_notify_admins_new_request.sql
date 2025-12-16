-- Migration: Trigger PostgreSQL pour notifier les admins des nouvelles demandes
-- Date: 2025-01-20
--
-- Cette migration crée un trigger qui appelle directement l'API avec les données complètes
-- sans passer par les variables non interpolées des webhooks Supabase.
--
-- Prérequis: Extension pg_net doit être activée dans Supabase
-- Vérifier: SELECT * FROM pg_available_extensions WHERE name = 'pg_net';
-- Activer: CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fonction pour appeler l'API avec les données complètes
CREATE OR REPLACE FUNCTION notify_admins_new_request_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  api_url TEXT;
  payload JSON;
  response_id BIGINT;
BEGIN
  -- Récupérer l'URL de l'API depuis les variables d'environnement ou utiliser une valeur par défaut
  -- Note: Vous devrez peut-être ajuster cette URL selon votre configuration
  api_url := COALESCE(
    current_setting('app.api_url', true),
    'https://votre-domaine.com/api/notifications/admin/new-request'
  );

  -- Construire le payload JSON avec les données complètes
  payload := json_build_object(
    'id', NEW.id,
    'request_type', NEW.request_type,
    'event_data', NEW.event_data,
    'source_url', NEW.source_url,
    'requested_at', NEW.requested_at
  );

  -- Appeler l'API via pg_net
  SELECT net.http_post(
    url := api_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload::text
  ) INTO response_id;

  -- Logger pour le débogage
  RAISE NOTICE 'Notification envoyée pour la demande % (response_id: %)', NEW.id, response_id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Logger l'erreur mais ne pas bloquer l'insertion
    RAISE WARNING 'Erreur lors de l''envoi de la notification pour la demande %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Créer le trigger
DROP TRIGGER IF EXISTS trigger_notify_admins_new_request ON user_requests;
CREATE TRIGGER trigger_notify_admins_new_request
  AFTER INSERT ON user_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_admins_new_request_trigger();

COMMENT ON FUNCTION notify_admins_new_request_trigger() IS 'Trigger qui appelle automatiquement l''API de notification pour les nouvelles demandes avec les données complètes';


