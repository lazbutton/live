-- ============================================
-- Migration 004 : Fonction pour créer un admin
-- Date : 2024-12-XX
-- Description : Fonction helper pour promouvoir un utilisateur en admin
-- ============================================

-- Fonction pour promouvoir un utilisateur en admin via ses métadonnées
-- Note: Cette fonction nécessite les privilèges admin de Supabase
-- Utilisation: SELECT make_user_admin('email@example.com');

CREATE OR REPLACE FUNCTION make_user_admin(user_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID;
  current_metadata JSONB;
BEGIN
  -- Trouver l'ID de l'utilisateur par email
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF user_id IS NULL THEN
    RETURN 'Erreur: Utilisateur avec l''email ' || user_email || ' introuvable';
  END IF;
  
  -- Récupérer les métadonnées actuelles
  SELECT raw_user_meta_data INTO current_metadata
  FROM auth.users
  WHERE id = user_id;
  
  -- Ajouter ou mettre à jour le rôle admin
  IF current_metadata IS NULL THEN
    current_metadata := '{"role": "admin"}'::jsonb;
  ELSE
    current_metadata := current_metadata || '{"role": "admin"}'::jsonb;
  END IF;
  
  -- Mettre à jour les métadonnées de l'utilisateur
  UPDATE auth.users
  SET raw_user_meta_data = current_metadata
  WHERE id = user_id;
  
  RETURN 'Succès: L''utilisateur ' || user_email || ' est maintenant admin';
END;
$$;

-- ============================================
-- EXEMPLE D'UTILISATION
-- ============================================
-- 
-- 1. Via le SQL Editor de Supabase :
--    SELECT make_user_admin('votre-email@example.com');
--
-- 2. Via l'API Supabase Admin (Node.js/Python/etc.) :
--    Vous pouvez aussi utiliser l'API Admin pour mettre à jour les métadonnées :
--    
--    Python:
--    from supabase import create_client, Client
--    admin_client = create_client(url, service_role_key)
--    admin_client.auth.admin.update_user_by_id(
--        user_id,
--        {"user_metadata": {"role": "admin"}}
--    )
--
--    JavaScript/TypeScript:
--    import { createClient } from '@supabase/supabase-js'
--    const adminClient = createClient(url, serviceRoleKey)
--    await adminClient.auth.admin.updateUserById(userId, {
--      user_metadata: { role: 'admin' }
--    })




