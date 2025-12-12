-- ============================================
-- Migration : Ajout du statut 'draft' aux événements
-- Date : 2025-01-15
-- Description : Ajoute le statut 'draft' pour permettre aux organisateurs
--               de sauvegarder des événements en brouillon
-- ============================================

-- Supprimer la contrainte existante
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;

-- Ajouter la nouvelle contrainte avec le statut 'draft'
ALTER TABLE public.events 
ADD CONSTRAINT events_status_check 
CHECK (status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'rejected'::text]));

-- Commenter la colonne status pour documentation
COMMENT ON COLUMN public.events.status IS 'Statut de l''événement: draft (brouillon, visible uniquement par l''organisateur), pending (en attente de validation), approved (approuvé et visible publiquement), rejected (rejeté)';


