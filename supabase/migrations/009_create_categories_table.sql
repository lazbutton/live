-- ============================================
-- Migration 009 : Création de la table categories
-- Date : 2024-12-XX
-- Description : Créer une table categories pour permettre l'édition des catégories dans l'admin
-- ============================================

-- Créer la table categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Créer un index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order);

-- Activer RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Politique : Tout le monde peut lire les catégories actives
CREATE POLICY "Anyone can view active categories"
  ON categories FOR SELECT
  USING (is_active = true);

-- Politique : Les admins peuvent tout voir
CREATE POLICY "Admins can view all categories"
  ON categories FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique : Seuls les admins peuvent créer des catégories
CREATE POLICY "Admins can create categories"
  ON categories FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique : Seuls les admins peuvent modifier les catégories
CREATE POLICY "Admins can update categories"
  ON categories FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique : Seuls les admins peuvent supprimer les catégories
CREATE POLICY "Admins can delete categories"
  ON categories FOR DELETE
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour updated_at automatiquement
CREATE TRIGGER update_categories_updated_at_trigger
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_categories_updated_at();

-- Insérer les catégories par défaut
INSERT INTO categories (name, description, display_order) VALUES
  ('MUSIC', 'Événements musicaux', 1),
  ('SPORT', 'Événements sportifs', 2),
  ('ART', 'Événements artistiques', 3),
  ('THEATER', 'Spectacles de théâtre', 4),
  ('CONCERT', 'Concerts', 5),
  ('DJ', 'Soirées DJ', 6),
  ('ACOUSTIC', 'Concerts acoustiques', 7),
  ('TECHNO', 'Soirées techno', 8),
  ('ROCK', 'Concerts rock', 9),
  ('JAZZ', 'Concerts jazz', 10),
  ('HOUSE', 'Soirées house', 11),
  ('ELECTRO', 'Soirées électro', 12)
ON CONFLICT (name) DO NOTHING;

-- Commentaires pour documenter
COMMENT ON TABLE categories IS 'Table des catégories d''événements, éditables par les administrateurs';
COMMENT ON COLUMN categories.name IS 'Nom de la catégorie (en majuscules, unique)';
COMMENT ON COLUMN categories.description IS 'Description de la catégorie';
COMMENT ON COLUMN categories.icon_url IS 'URL de l''icône de la catégorie (optionnel)';
COMMENT ON COLUMN categories.is_active IS 'Indique si la catégorie est active et visible';
COMMENT ON COLUMN categories.display_order IS 'Ordre d''affichage de la catégorie';

-- ============================================
-- ROLLBACK (en cas de problème)
-- ============================================

-- Pour annuler cette migration, exécuter :
-- DROP TRIGGER IF EXISTS update_categories_updated_at_trigger ON categories;
-- DROP FUNCTION IF EXISTS update_categories_updated_at();
-- DROP POLICY IF EXISTS "Anyone can view active categories" ON categories;
-- DROP POLICY IF EXISTS "Admins can view all categories" ON categories;
-- DROP POLICY IF EXISTS "Admins can create categories" ON categories;
-- DROP POLICY IF EXISTS "Admins can update categories" ON categories;
-- DROP POLICY IF EXISTS "Admins can delete categories" ON categories;
-- DROP INDEX IF EXISTS idx_categories_name;
-- DROP INDEX IF EXISTS idx_categories_is_active;
-- DROP INDEX IF EXISTS idx_categories_display_order;
-- DROP TABLE IF EXISTS categories;



