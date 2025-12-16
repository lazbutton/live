-- Migration: Trigger PostgreSQL pour notifier les admins des nouveaux feedbacks
-- Date: 2025-01-20
--
-- Cette migration crée un trigger qui appelle directement l'API avec les données complètes
-- sans passer par les variables non interpolées des webhooks Supabase.
--
-- Prérequis: Extension pg_net doit être activée dans Supabase
-- Vérifier: SELECT * FROM pg_available_extensions WHERE name = 'pg_net';
-- Activer: CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fonction pour appeler l'API avec les données complètes
CREATE OR REPLACE FUNCTION notify_admins_new_feedback_trigger()
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
    'https://votre-domaine.com/api/notifications/admin/new-feedback'
  );

  -- Construire le payload JSON avec les données complètes
  payload := json_build_object(
    'id', NEW.id,
    'description', NEW.description,
    'user_id', NEW.user_id,
    'status', NEW.status,
    'feedback_object_id', NEW.feedback_object_id,
    'created_at', NEW.created_at
  );

  -- Appeler l'API via pg_net
  SELECT net.http_post(
    url := api_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload::text
  ) INTO response_id;

  -- Logger pour le débogage
  RAISE NOTICE 'Notification envoyée pour le feedback % (response_id: %)', NEW.id, response_id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Logger l'erreur mais ne pas bloquer l'insertion
    RAISE WARNING 'Erreur lors de l''envoi de la notification pour le feedback %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Créer le trigger
DROP TRIGGER IF EXISTS trigger_notify_admins_new_feedback ON feedbacks;
CREATE TRIGGER trigger_notify_admins_new_feedback
  AFTER INSERT ON feedbacks
  FOR EACH ROW
  EXECUTE FUNCTION notify_admins_new_feedback_trigger();

COMMENT ON FUNCTION notify_admins_new_feedback_trigger() IS 'Trigger qui appelle automatiquement l''API de notification pour les nouveaux feedbacks avec les données complètes';


