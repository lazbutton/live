-- ============================================
-- Migration 007 : Fonction pour convertir une demande d'événement en événement
-- Date : 2024-12-XX
-- Description : Fonction pour créer un événement à partir d'une demande
-- ============================================

-- Fonction pour convertir une demande d'événement en événement réel
CREATE OR REPLACE FUNCTION convert_event_request_to_event(request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_event_id UUID;
  request_data RECORD;
  current_user_id UUID;
BEGIN
  -- Récupérer l'ID de l'utilisateur admin actuel
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Vérifier que l'utilisateur est admin
  IF NOT is_user_admin() THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent convertir des demandes en événements';
  END IF;
  
  -- Récupérer les données de la demande
  SELECT * INTO request_data
  FROM event_requests
  WHERE id = request_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande non trouvée ou déjà traitée';
  END IF;
  
  -- Créer l'événement
  INSERT INTO events (
    title,
    description,
    date,
    location_id,
    image_url,
    category,
    price,
    address,
    capacity,
    door_opening_time,
    external_url,
    created_by,
    status
  ) VALUES (
    request_data.title,
    request_data.description,
    request_data.date,
    request_data.location_id,
    request_data.image_url,
    request_data.category,
    request_data.price,
    request_data.address,
    request_data.capacity,
    request_data.door_opening_time,
    request_data.external_url,
    current_user_id,
    'approved' -- Les événements créés depuis une demande sont automatiquement approuvés
  ) RETURNING id INTO new_event_id;
  
  -- Lier l'organisateur si présent
  IF request_data.organizer_id IS NOT NULL THEN
    INSERT INTO event_organizers (event_id, organizer_id)
    VALUES (new_event_id, request_data.organizer_id)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Mettre à jour la demande pour marquer qu'elle a été convertie
  UPDATE event_requests
  SET 
    status = 'converted',
    converted_to_event_id = new_event_id,
    reviewed_by = current_user_id,
    reviewed_at = NOW()
  WHERE id = request_id;
  
  RETURN new_event_id;
END;
$$;

-- Commentaire sur la fonction
COMMENT ON FUNCTION convert_event_request_to_event(UUID) IS 
'Convertit une demande d''événement en événement réel. Seuls les administrateurs peuvent utiliser cette fonction.';






