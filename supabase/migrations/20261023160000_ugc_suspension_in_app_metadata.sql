-- ============================================
-- Migration : la suspension UGC dans raw_app_meta_data, plus dans raw_user_meta_data
-- Date : 2026-10-23
-- Description : corrige une escalade du même type que le rôle admin (20261023150000). La suspension
--   d'un compte pour le contenu communautaire était lue dans `raw_user_meta_data->>'ugc_suspended'`
--   (is_user_safety_suspended(), qui alimente can_use_ugc_features() et les policies RLS d'events ;
--   lib/mobile-user-auth.ts). Or `raw_user_meta_data` est écrit par l'utilisateur lui-même : avec la
--   seule clé publique (anon), `supabase.auth.updateUser({ data: { ugc_suspended: false } })`
--   (PUT /auth/v1/user) y pose n'importe quelle valeur. Un compte suspendu pouvait donc lever sa
--   propre suspension.
--
--   Vérifié sur une pile Supabase locale jetable (jamais la prod) :
--     • PUT /auth/v1/user { data: { ugc_suspended: false } } (self-service) écrit raw_user_meta_data ;
--       is_user_safety_suspended() renvoyait alors false et le compte reprenait la main sur l'UGC.
--     • PUT /auth/v1/user { app_metadata: {...} } (self-service) → 403 : GoTrue refuse toute écriture
--       de raw_app_meta_data par l'utilisateur. Seuls le service role / l'API admin (updateUserById,
--       app_metadata) l'écrivent. raw_app_meta_data est donc le bon endroit pour la suspension.
--
--   Correctif (appliqué aussi côté TypeScript — routes admin et modération, lib/mobile-user-auth.ts —
--   et côté app Flutter, qui lit la suspension pour déconnecter le compte suspendu) :
--     1. Les suspendus existants : les clés ugc_suspension recopiées de raw_user_meta_data vers
--        raw_app_meta_data.
--     2. Ces clés retirées de raw_user_meta_data de tout le monde (plus un vecteur de confiance).
--     3. is_user_safety_suspended() lit raw_app_meta_data.
--     4. Garde-fou : un trigger BEFORE INSERT/UPDATE sur auth.users efface toute clé ugc_suspension
--        qu'un utilisateur tenterait d'écrire dans son raw_user_meta_data (self-service ou inscription).
--        Ainsi ce champ ne peut plus jamais lever une suspension, même pour un lecteur oublié.
--
--   `ugc_terms_accepted_version` (et les autres clés de user_metadata : nom, etc.) RESTENT dans
--   raw_user_meta_data : l'acceptation des conditions est un geste légitime de l'utilisateur. Seules
--   les clés de suspension bougent.
--
--   Indépendant de 20261023150000 (rôle admin) : trigger et fonction distincts, aucune dépendance.
--   On pourra plus tard fusionner les deux garde-fous en un seul une fois les deux migrations en prod.
--
--   À appliquer avec un rôle qui peut créer un trigger sur auth.users (SQL Editor ou `supabase db
--   push`, rôle postgres), comme les triggers habituels de ce schéma. Rejouable (|| idempotent,
--   CREATE OR REPLACE, DROP TRIGGER IF EXISTS).

-- ============================================
-- CODE SQL
-- ============================================

-- 1. Reprise des suspendus existants : les clés ugc_suspension recopiées dans raw_app_meta_data
--    (fusion idempotente ; jsonb_strip_nulls retire les clés absentes de user_metadata).
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_strip_nulls(jsonb_build_object(
       'ugc_suspended', raw_user_meta_data->'ugc_suspended',
       'ugc_suspension_reason', raw_user_meta_data->'ugc_suspension_reason',
       'ugc_suspended_at', raw_user_meta_data->'ugc_suspended_at',
       'ugc_suspended_by', raw_user_meta_data->'ugc_suspended_by'))
WHERE raw_user_meta_data ? 'ugc_suspended';

-- 2. Les clés de suspension quittent raw_user_meta_data de tout le monde (le trigger du point 4 les y
--    maintiendra).
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data
  - 'ugc_suspended' - 'ugc_suspension_reason' - 'ugc_suspended_at' - 'ugc_suspended_by'
WHERE raw_user_meta_data ?| array[
  'ugc_suspended', 'ugc_suspension_reason', 'ugc_suspended_at', 'ugc_suspended_by'];

-- 3. is_user_safety_suspended() lit désormais raw_app_meta_data (évaluée dans can_use_ugc_features()
--    et les policies RLS d'events). Signature et attributs inchangés.
CREATE OR REPLACE FUNCTION public.is_user_safety_suspended()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  suspended_flag text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- La suspension est dans app_metadata (écrite par le service seul), plus dans user_metadata.
  SELECT raw_app_meta_data->>'ugc_suspended'
  INTO suspended_flag
  FROM auth.users
  WHERE id = auth.uid();

  RETURN COALESCE(lower(suspended_flag), 'false') IN ('true', '1', 'yes');
END;
$$;

COMMENT ON FUNCTION public.is_user_safety_suspended() IS
'Retourne true si le compte courant est suspendu pour les fonctionnalites UGC (raw_app_meta_data).';

-- 4. Garde-fou : raw_user_meta_data ne peut plus porter de clé de suspension. Le trigger les efface à
--    chaque écriture de la colonne (inscription comprise), quel que soit l'appelant. On n'écrit jamais
--    de suspension dans user_metadata (l'admin passe par app_metadata via l'API admin), donc rien de
--    légitime n'est bloqué ; les autres clés de user_metadata (nom, ugc_terms_*) sont intactes.
CREATE OR REPLACE FUNCTION public.strip_ugc_suspension_from_user_metadata() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.raw_user_meta_data ?| array[
    'ugc_suspended', 'ugc_suspension_reason', 'ugc_suspended_at', 'ugc_suspended_by'] THEN
    NEW.raw_user_meta_data := NEW.raw_user_meta_data
      - 'ugc_suspended' - 'ugc_suspension_reason' - 'ugc_suspended_at' - 'ugc_suspended_by';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.strip_ugc_suspension_from_user_metadata() IS
  'Empêche qu''une suspension UGC soit stockée dans raw_user_meta_data (modifiable par l''utilisateur). '
  'La suspension vit dans raw_app_meta_data, lue par is_user_safety_suspended().';

DROP TRIGGER IF EXISTS strip_ugc_suspension_from_user_metadata ON auth.users;
CREATE TRIGGER strip_ugc_suspension_from_user_metadata
  BEFORE INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.strip_ugc_suspension_from_user_metadata();

-- ============================================
-- ROLLBACK (référence)
-- ============================================

-- DROP TRIGGER IF EXISTS strip_ugc_suspension_from_user_metadata ON auth.users;
-- DROP FUNCTION IF EXISTS public.strip_ugc_suspension_from_user_metadata();
-- -- is_user_safety_suspended() : reprendre le corps lisant raw_user_meta_data de
-- -- 20260324100000_create_content_reports_and_blocked_users.sql (et recopier la suspension
-- -- app_meta → user_meta pour les suspendus).
