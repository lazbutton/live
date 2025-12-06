-- ============================================
-- Migration 022 : Création des tables pour le système de feedback
-- Date : 2025-01-XX
-- Description : Tables pour gérer les feedbacks utilisateurs et les types d'objets
-- ============================================

-- Table pour les types d'objets de feedback (administrables)
CREATE TABLE IF NOT EXISTS feedback_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table pour les feedbacks utilisateurs
CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_object_id UUID NOT NULL REFERENCES feedback_objects(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'resolved', 'archived')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_feedback_object_id ON feedbacks(feedback_object_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON feedbacks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_objects_is_active ON feedback_objects(is_active);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_feedback_objects_updated_at
  BEFORE UPDATE ON feedback_objects
  FOR EACH ROW
  EXECUTE FUNCTION update_feedback_updated_at();

CREATE TRIGGER update_feedbacks_updated_at
  BEFORE UPDATE ON feedbacks
  FOR EACH ROW
  EXECUTE FUNCTION update_feedback_updated_at();

-- ============================================
-- POLITIQUES RLS (Row Level Security)
-- ============================================

-- Activer RLS
ALTER TABLE feedback_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;

-- Feedback Objects : Tout le monde peut voir les objets actifs
CREATE POLICY "Anyone can view active feedback objects"
  ON feedback_objects FOR SELECT
  USING (is_active = true);

-- Feedback Objects : Seuls les admins peuvent gérer
CREATE POLICY "Admins can manage feedback objects"
  ON feedback_objects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Feedbacks : Les utilisateurs authentifiés peuvent créer leurs propres feedbacks
CREATE POLICY "Authenticated users can create feedbacks"
  ON feedbacks FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.email IS NULL OR auth.users.email = '')
    ) -- Empêcher les utilisateurs anonymes
  );

-- Feedbacks : Les utilisateurs peuvent voir leurs propres feedbacks
CREATE POLICY "Users can view their own feedbacks"
  ON feedbacks FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Feedbacks : Les utilisateurs peuvent modifier leurs propres feedbacks en attente
CREATE POLICY "Users can update their own pending feedbacks"
  ON feedbacks FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
  );

-- Feedbacks : Les admins peuvent gérer tous les feedbacks
CREATE POLICY "Admins can manage all feedbacks"
  ON feedbacks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- ============================================
-- DONNÉES INITIALES
-- ============================================

-- Insérer quelques types d'objets par défaut
INSERT INTO feedback_objects (name, description, display_order) VALUES
  ('Bug / Erreur', 'Signaler un bug ou une erreur dans l''application', 1),
  ('Suggestion d''amélioration', 'Proposer une amélioration ou une nouvelle fonctionnalité', 2),
  ('Problème de contenu', 'Signaler un problème avec le contenu d''un événement', 3),
  ('Question / Aide', 'Poser une question ou demander de l''aide', 4),
  ('Autre', 'Autre type de feedback', 5)
ON CONFLICT (name) DO NOTHING;

-- Commentaires
COMMENT ON TABLE feedback_objects IS 'Types d''objets de feedback administrables';
COMMENT ON TABLE feedbacks IS 'Feedbacks soumis par les utilisateurs';
COMMENT ON COLUMN feedbacks.status IS 'Statut du feedback: pending, read, resolved, archived';

