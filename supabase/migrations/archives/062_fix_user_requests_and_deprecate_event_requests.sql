-- ============================================
-- Migration 062 : Normalisation des demandes d'ajout d'événements
-- Date : 2025-XX-XX
-- Description :
-- - Standardiser les demandes d'ajout d'événements via `user_requests`
-- - Supporter `event_creation` + `event_from_url`
-- - Ajouter un statut `converted` et un lien `converted_event_id`
-- - Déprécier / supprimer l'ancienne table `event_requests` (non utilisée côté app)
-- ============================================

-- 1) Déprécier l'ancienne table (non utilisée côté code)
DROP TABLE IF EXISTS event_requests;

-- 2) S'assurer que la table user_requests a le bon modèle
-- Colonnes de base pour les demandes d'événements
ALTER TABLE user_requests
  ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'event_creation';

ALTER TABLE user_requests
  ADD COLUMN IF NOT EXISTS event_data JSONB;

ALTER TABLE user_requests
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Champs dédiés aux demandes "depuis URL"
ALTER TABLE user_requests
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

ALTER TABLE user_requests
  ADD COLUMN IF NOT EXISTS location_name TEXT;

ALTER TABLE user_requests
  ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Colonnes de compte utilisateur (dépréciées / supprimées)
ALTER TABLE user_requests
  DROP COLUMN IF EXISTS email;

ALTER TABLE user_requests
  DROP COLUMN IF EXISTS name;

-- Lien vers l'événement créé (conversion)
ALTER TABLE user_requests
  ADD COLUMN IF NOT EXISTS converted_event_id UUID REFERENCES events(id) ON DELETE SET NULL;

ALTER TABLE user_requests
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP WITH TIME ZONE;

-- 3) Contraintes de type de demande
ALTER TABLE user_requests
  DROP CONSTRAINT IF EXISTS user_requests_request_type_check;

ALTER TABLE user_requests
  ADD CONSTRAINT user_requests_request_type_check
  CHECK (request_type IN ('event_creation', 'event_from_url'));

-- 4) Contraintes de statut (ajout de "converted")
-- Le nom auto-généré dépend de Postgres, on tente plusieurs noms possibles.
ALTER TABLE user_requests
  DROP CONSTRAINT IF EXISTS user_requests_status_check;

ALTER TABLE user_requests
  DROP CONSTRAINT IF EXISTS user_requests_status_check1;

ALTER TABLE user_requests
  DROP CONSTRAINT IF EXISTS user_requests_status_check2;

ALTER TABLE user_requests
  ADD CONSTRAINT user_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'converted'));

-- 5) Index utiles
CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status);
CREATE INDEX IF NOT EXISTS idx_user_requests_requested_at ON user_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_requests_request_type ON user_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_user_requests_requested_by ON user_requests(requested_by) WHERE requested_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_requests_source_url ON user_requests(source_url) WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_requests_location_id ON user_requests(location_id) WHERE location_id IS NOT NULL;

-- 6) Conversion : demande -> événement (status pending, et on marque la demande comme converted)
CREATE OR REPLACE FUNCTION convert_event_request_to_event(request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_event_id UUID;
  request_data RECORD;
  current_user_id UUID;
  event_json JSONB;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  IF NOT is_user_admin() THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent convertir des demandes en événements';
  END IF;

  -- On ne convertit que les demandes complètes (event_creation)
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
    status
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
    'pending'
  ) RETURNING id INTO new_event_id;

  -- Lier l'organisateur si présent dans event_data
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
    notes = COALESCE(notes, '') || E'\nConverti en événement ID: ' || new_event_id::TEXT
  WHERE id = request_id;

  RETURN new_event_id;
END;
$$;

COMMENT ON FUNCTION convert_event_request_to_event(UUID) IS
'Convertit une demande event_creation (user_requests) en événement status=pending et marque la demande comme converted. Admin uniquement.';
