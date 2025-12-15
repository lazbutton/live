-- ============================================
-- Migration : Ajout du timing de rappel aux notifications d'événements
-- Date : 2025-01-16
-- Description : Ajoute une colonne reminder_timing pour permettre aux utilisateurs
--               de choisir quand recevoir le rappel (1 jour, 3 heures, ou 1 heure avant)
--               + Fonction pour calculer automatiquement notification_scheduled_at
-- ============================================

-- Ajouter la colonne reminder_timing
ALTER TABLE public.event_notifications
ADD COLUMN IF NOT EXISTS reminder_timing TEXT CHECK (reminder_timing IN ('1_day', '3_hours', '1_hour'));

-- Ajouter un commentaire
COMMENT ON COLUMN public.event_notifications.reminder_timing IS 'Timing du rappel: 1_day (1 jour avant), 3_hours (3 heures avant), 1_hour (1 heure avant)';

-- Mettre à jour la colonne notification_scheduled_at pour refléter qu'elle peut avoir plusieurs valeurs
COMMENT ON COLUMN public.event_notifications.notification_scheduled_at IS 'Date à laquelle la notification est programmée (selon reminder_timing: 1 jour, 3h ou 1h avant l''événement). Calculée automatiquement par le trigger.';

-- ============================================
-- Fonction pour calculer automatiquement notification_scheduled_at
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_notification_scheduled_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  event_date TIMESTAMPTZ;
BEGIN
  -- Si reminder_timing n'est pas défini, laisser notification_scheduled_at null
  IF NEW.reminder_timing IS NULL THEN
    NEW.notification_scheduled_at := NULL;
    RETURN NEW;
  END IF;

  -- Récupérer la date de l'événement
  SELECT date INTO event_date
  FROM public.events
  WHERE id = NEW.event_id;

  -- Si l'événement n'existe pas ou n'a pas de date, laisser null
  IF event_date IS NULL THEN
    NEW.notification_scheduled_at := NULL;
    RETURN NEW;
  END IF;

  -- Calculer notification_scheduled_at selon le reminder_timing
  CASE NEW.reminder_timing
    WHEN '1_day' THEN
      -- 1 jour avant (24 heures avant)
      NEW.notification_scheduled_at := event_date - INTERVAL '24 hours';
    WHEN '3_hours' THEN
      -- 3 heures avant
      NEW.notification_scheduled_at := event_date - INTERVAL '3 hours';
    WHEN '1_hour' THEN
      -- 1 heure avant
      NEW.notification_scheduled_at := event_date - INTERVAL '1 hour';
    ELSE
      NEW.notification_scheduled_at := NULL;
  END CASE;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.calculate_notification_scheduled_at() IS 'Calcule automatiquement notification_scheduled_at en fonction de reminder_timing et de la date de l''événement. Appelé automatiquement lors de l''insertion ou de la mise à jour.';

-- ============================================
-- Trigger pour calculer automatiquement notification_scheduled_at
-- ============================================

-- Supprimer le trigger s'il existe déjà
DROP TRIGGER IF EXISTS trigger_calculate_notification_scheduled_at ON public.event_notifications;

-- Créer le trigger
CREATE TRIGGER trigger_calculate_notification_scheduled_at
  BEFORE INSERT OR UPDATE OF reminder_timing, event_id ON public.event_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_notification_scheduled_at();

COMMENT ON TRIGGER trigger_calculate_notification_scheduled_at ON public.event_notifications IS 'Calcule automatiquement notification_scheduled_at avant l''insertion ou la mise à jour de reminder_timing/event_id';

