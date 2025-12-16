-- ============================================
-- Migration : Ajout du statut 'draft' aux événements
-- Date : 2025-01-21
-- Description : Ajoute le statut 'draft' pour permettre de sauvegarder
--               des événements en brouillon lors de la création depuis une demande
-- ============================================

-- Supprimer la contrainte existante
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;

-- Ajouter la nouvelle contrainte avec le statut 'draft'
ALTER TABLE public.events 
ADD CONSTRAINT events_status_check 
CHECK (status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'rejected'::text]));

-- Commenter la colonne status pour documentation
COMMENT ON COLUMN public.events.status IS 'Statut de l''événement: draft (brouillon, visible uniquement par l''organisateur), pending (en attente de validation), approved (approuvé et visible publiquement), rejected (rejeté)';

