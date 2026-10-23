-- ============================================
-- Migration : le rôle admin dans raw_app_meta_data, plus dans raw_user_meta_data
-- Date : 2026-10-23
-- Description : corrige une escalade de privilèges. Le rôle admin était lu dans
--   `raw_user_meta_data->>'role'` (is_user_admin(), lib/auth.ts, lib/admin-mobile-auth.ts, ~30 routes).
--   Or `raw_user_meta_data` est écrit par l'utilisateur lui-même : avec la seule clé publique (anon),
--   `supabase.auth.updateUser({ data: { role: "admin" } })` (PUT /auth/v1/user) y pose n'importe quelle
--   valeur, pour un compte ordinaire comme pour une session invitée (anonyme), et même dès l'inscription
--   (`signup` avec `data: { role: "admin" }`). N'importe qui pouvait donc se faire admin.
--
--   Vérifié sur une pile Supabase locale jetable (jamais la prod) avec GoTrue v2.183.0 :
--     • PUT /auth/v1/user { data: { role: "admin" } } → 200, raw_user_meta_data.role = "admin" ;
--       is_user_admin() renvoyait alors true et le compte lisait app_audience_counts (admin uniquement) ;
--       le JWT rafraîchi portait user_metadata.role = "admin" (ce que lisent les routes via getUser()).
--     • PUT /auth/v1/user { app_metadata: {...} } (self-service) → 403 : GoTrue refuse toute écriture de
--       raw_app_meta_data par l'utilisateur. Seuls le service role / l'API admin (updateUserById,
--       app_metadata) l'écrivent. raw_app_meta_data est donc le bon endroit pour une autorisation.
--
--   Correctif (appliqué aussi côté TypeScript dans la même PR) :
--     1. Les admins existants : rôle recopié de raw_user_meta_data vers raw_app_meta_data.
--     2. La clé `role` retirée de raw_user_meta_data de tout le monde (plus un vecteur de confiance).
--     3. is_user_admin() et make_user_admin() lisent/écrivent raw_app_meta_data.
--     4. Garde-fou : un trigger BEFORE INSERT/UPDATE sur auth.users efface toute clé `role` qu'un
--        utilisateur tenterait d'écrire dans son raw_user_meta_data (self-service ou inscription). Ainsi
--        ce champ ne peut plus jamais conférer l'admin, même pour un lecteur oublié ou pour l'app.
--
--   À appliquer avec un rôle qui peut créer un trigger sur auth.users (SQL Editor ou `supabase db push`,
--   rôle postgres), comme les triggers habituels de ce schéma. Rejouable (|| idempotent, CREATE OR
--   REPLACE, DROP TRIGGER IF EXISTS).

-- ============================================
-- CODE SQL
-- ============================================

-- 1. Reprise des admins existants : rôle recopié dans raw_app_meta_data (fusion idempotente).
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
WHERE raw_user_meta_data->>'role' = 'admin';

-- 2. La clé `role` quitte raw_user_meta_data de tout le monde (le trigger du point 4 l'y maintiendra).
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data - 'role'
WHERE raw_user_meta_data ? 'role';

-- 3. is_user_admin() lit désormais raw_app_meta_data (évaluée dans toutes les policies RLS admin).
CREATE OR REPLACE FUNCTION public.is_user_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path = public, auth
    AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Rôle de l'utilisateur connecté, dans app_metadata (écrit par le service uniquement).
  SELECT raw_app_meta_data->>'role' INTO user_role
  FROM auth.users
  WHERE id = auth.uid();

  RETURN COALESCE(user_role = 'admin', false);
END;
$$;

-- make_user_admin() écrit dans raw_app_meta_data (usage manuel au SQL Editor, rôle postgres ; déjà
-- retirée d'anon/authenticated par 20261020220000).
CREATE OR REPLACE FUNCTION public.make_user_admin(user_email text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public, auth
    AS $$
DECLARE
  target_id UUID;
BEGIN
  SELECT id INTO target_id FROM auth.users WHERE email = user_email;

  IF target_id IS NULL THEN
    RETURN 'Erreur: Utilisateur avec l''email ' || user_email || ' introuvable';
  END IF;

  UPDATE auth.users
  SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
  WHERE id = target_id;

  RETURN 'Succès: L''utilisateur ' || user_email || ' est maintenant admin';
END;
$$;

-- 4. Garde-fou : raw_user_meta_data ne peut plus porter `role`. Le trigger efface la clé à chaque
--    écriture de la colonne (inscription comprise), quel que soit l'appelant. On n'écrit jamais de rôle
--    dans user_metadata (l'admin passe par app_metadata via l'API admin), donc rien de légitime n'est
--    bloqué ; les autres clés de user_metadata (nom, ugc_*) sont intactes.
CREATE OR REPLACE FUNCTION public.strip_role_from_user_metadata() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'role' THEN
    NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'role';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.strip_role_from_user_metadata() IS
  'Empêche qu''un rôle soit stocké dans raw_user_meta_data (modifiable par l''utilisateur). '
  'Le rôle admin vit dans raw_app_meta_data, lu par is_user_admin().';

DROP TRIGGER IF EXISTS strip_role_from_user_metadata ON auth.users;
CREATE TRIGGER strip_role_from_user_metadata
  BEFORE INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.strip_role_from_user_metadata();

-- 5. organizer_audit_log : la seule policy RLS qui lisait encore le rôle en clair dans
--    raw_user_meta_data (toutes les autres passent par is_user_admin()). Même sens, via is_user_admin()
--    — sinon, le rôle ayant quitté user_metadata, les admins perdraient l'accès au journal.
ALTER POLICY "Users can view audit log of their organizers" ON public.organizer_audit_log
  USING (
    public.is_user_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_organizers
      WHERE user_organizers.organizer_id = organizer_audit_log.organizer_id
        AND user_organizers.user_id = auth.uid()
    )
  );

-- ============================================
-- ROLLBACK (référence)
-- ============================================

-- DROP TRIGGER IF EXISTS strip_role_from_user_metadata ON auth.users;
-- DROP FUNCTION IF EXISTS public.strip_role_from_user_metadata();
-- -- is_user_admin() et make_user_admin() : reprendre les corps lisant/écrivant raw_user_meta_data
-- -- de 20251212120000_baseline.sql (et recopier le rôle app_meta → user_meta pour les admins).
