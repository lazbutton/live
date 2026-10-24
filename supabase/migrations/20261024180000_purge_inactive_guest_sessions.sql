-- ============================================
-- Migration : les sessions invitées sans trace depuis 13 mois, supprimées chaque nuit
-- Date : 2026-10-24
-- Description : une session invitée (utilisateur anonyme d'auth.users, ouverte au premier geste qui écrit,
--   ../live/docs/fonctionnalites/compte.md, « La session, sans compte ») restait en base pour toujours, avec
--   ses favoris, masqués, suivis, préférences et jeton de notification, même quand l'app était désinstallée.
--   Durée choisie par l'utilisateur le 2026-10-24 : 13 mois sans trace (politique de confidentialité,
--   section 2.2, « La session invitée »).
--
--   La dernière trace d'une session invitée est la plus récente de ces dates :
--     • la session elle-même : sa création, sa connexion (auth.users.created_at, last_sign_in_at), et chacun
--       de ses rafraîchissements. L'app rafraîchit sa session à chaque ouverture, dès que le jeton d'accès
--       (une heure) a expiré ; GoTrue l'écrit dans auth.users.updated_at, auth.sessions.updated_at et
--       refreshed_at (heure UTC sans fuseau), et crée un jeton de rafraîchissement (auth.refresh_tokens).
--       last_sign_in_at ne bouge pas (vérifié sur GoTrue v2.183.0 le 2026-10-24) ;
--     • ses gestes : un favori, un événement masqué, un suivi, l'enregistrement de son jeton de notification
--       (à chaque ouverture, notifications autorisées), un blocage, un signalement, un feedback, une
--       proposition. Chacun demande un jeton d'accès, valable une heure après un rafraîchissement : ils ne
--       reculent la trace que de cette heure au plus (en prod le 2026-10-24, aucun ne la reculait).
--   Ne comptent pas, parce que le serveur les écrit sans l'invité : ses préférences de notification et leurs
--   catégories (des migrations les réécrivent : 20260504163000 a normalisé leurs category_ids, en prod 23
--   lignes dans la même minute le 2026-05-04), la trace des notifications envoyées (notification_logs), et
--   le compteur d'analyses d'affiche (poster_analysis_usage, gardé deux jours).
--
--   Ce qui change :
--     1. inactive_guest_sessions() : les sessions invitées dont la dernière trace a plus de 13 mois, avec
--        cette trace. Lecture seule ; pour compter avant une purge.
--     2. purge_inactive_guest_sessions() : les supprime d'auth.users, la plus ancienne trace d'abord, 500 au
--        plus par appel ; tout ce qui leur est rattaché part en cascade (sessions et jetons de
--        rafraîchissement ; favoris, masqués, suivis, préférences et catégories de notification, jetons
--        push, trace des envois, blocages, signalements, feedbacks, propositions ; un événement dont elle
--        serait l'auteur reste, sans auteur). Une par une : une suppression refusée (une clé étrangère qui
--        l'empêche, un verrou tenu plus de 5 s) est comptée et journalisée, les autres passent. Rend
--        {"deleted", "failed", "has_more"}. Appelée chaque nuit par /api/cron/cleanup.
--   Les comptes (is_anonymous faux) ne sont jamais touchés. La session invitée d'un téléphone qui s'est
--   connecté à un compte reste en base (l'app ne la déconnecte pas ; copy_guest_data a recopié ses
--   données) : elle part 13 mois après sa dernière trace, comme les autres.
--
--   Côté app : rouverte après la purge, l'app voit son rafraîchissement refusé (400,
--   refresh_token_not_found) ; supabase_flutter retire alors la session (signedOut), et le prochain geste
--   qui écrit en ouvre une nouvelle (décision 7, B9).
--
--   `security definer` (lecture d'auth.sessions et auth.refresh_tokens, suppression dans auth.users),
--   search_path vide, objets qualifiés. Exécutables par service_role seulement. Rejouable (CREATE OR
--   REPLACE).

-- ============================================
-- CODE SQL
-- ============================================

-- 1. La règle : les sessions invitées sans trace depuis 13 mois.
CREATE OR REPLACE FUNCTION public.inactive_guest_sessions()
RETURNS TABLE (user_id uuid, last_activity timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.user_id, t.last_activity
  FROM (
    SELECT
      u.id AS user_id,
      greatest(
        -- La session : création, connexion, rafraîchissements.
        u.created_at,
        u.last_sign_in_at,
        u.updated_at,
        (SELECT max(greatest(s.created_at, s.updated_at, s.refreshed_at AT TIME ZONE 'UTC'))
         FROM auth.sessions AS s
         WHERE s.user_id = u.id),
        (SELECT max(greatest(r.created_at, r.updated_at))
         FROM auth.sessions AS s
         JOIN auth.refresh_tokens AS r ON r.session_id = s.id
         WHERE s.user_id = u.id),
        -- Les gestes de l'invité.
        (SELECT max(l.created_at) FROM public.event_likes AS l WHERE l.user_id = u.id),
        (SELECT max(h.created_at) FROM public.user_hidden_events AS h WHERE h.user_id = u.id),
        (SELECT max(f.created_at) FROM public.user_follows AS f WHERE f.user_id = u.id),
        (SELECT max(greatest(p.created_at, p.updated_at))
         FROM public.user_push_tokens AS p
         WHERE p.user_id = u.id),
        (SELECT max(b.created_at) FROM public.blocked_users AS b WHERE b.blocker_user_id = u.id),
        (SELECT max(c.created_at) FROM public.content_reports AS c WHERE c.reporter_user_id = u.id),
        (SELECT max(fb.created_at) FROM public.feedbacks AS fb WHERE fb.user_id = u.id),
        (SELECT max(greatest(q.created_at, q.requested_at))
         FROM public.user_requests AS q
         WHERE q.requested_by = u.id)
      ) AS last_activity
    FROM auth.users AS u
    WHERE u.is_anonymous
      -- Tri rapide, sans rien écarter de plus (la dernière trace est au moins aussi récente) : chaque
      -- rafraîchissement met users.updated_at à jour, les sessions qui servent s'arrêtent là.
      AND greatest(u.created_at, u.last_sign_in_at, u.updated_at) < now() - interval '13 months'
  ) AS t
  WHERE t.last_activity < now() - interval '13 months'
$$;

COMMENT ON FUNCTION public.inactive_guest_sessions() IS
  'Sessions invitées (auth.users anonymes) dont la dernière trace (création, connexion, rafraîchissement de la session, ou un geste : favori, masqué, suivi, jeton push, blocage, signalement, feedback, proposition) a plus de 13 mois, avec cette trace. Règle : migration 20261024180000.';

-- 2. La purge, chaque nuit (/api/cron/cleanup).
CREATE OR REPLACE FUNCTION public.purge_inactive_guest_sessions()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  lot constant integer := 500;
  invite uuid;
  supprimees integer := 0;
  echecs integer := 0;
BEGIN
  FOR invite IN
    SELECT i.user_id
    FROM public.inactive_guest_sessions() AS i
    ORDER BY i.last_activity, i.user_id
    LIMIT lot
  LOOP
    BEGIN
      -- Ses sessions, ses jetons et ce qui lui est rattaché dans public partent en cascade.
      DELETE FROM auth.users AS u
      WHERE u.id = invite
        AND u.is_anonymous;
      IF FOUND THEN
        supprimees := supprimees + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Sans l'id ni le détail de l'erreur (qui le contient) : le message et son code.
      echecs := echecs + 1;
      RAISE WARNING 'purge_inactive_guest_sessions : une session invitée n''a pas pu être supprimée (% : %)',
        SQLSTATE, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted', supprimees,
    'failed', echecs,
    'has_more', supprimees + echecs = lot
  );
END;
$$;

COMMENT ON FUNCTION public.purge_inactive_guest_sessions() IS
  'Supprime les sessions invitées sans trace depuis 13 mois (inactive_guest_sessions), la plus ancienne d''abord, 500 au plus par appel, avec ce qui leur est rattaché (cascade). Une par une : une suppression refusée est comptée (failed) et journalisée. Rend {"deleted", "failed", "has_more"}. Appelée chaque nuit par /api/cron/cleanup. Règle : migration 20261024180000.';

REVOKE ALL ON FUNCTION public.inactive_guest_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inactive_guest_sessions() TO service_role;
REVOKE ALL ON FUNCTION public.purge_inactive_guest_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_inactive_guest_sessions() TO service_role;

-- Vérification (SQL Editor, rôle postgres) : combien partiraient à la prochaine nuit, et les droits.
-- select count(*), min(last_activity) from public.inactive_guest_sessions();
-- select has_function_privilege('anon', 'public.purge_inactive_guest_sessions()', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.purge_inactive_guest_sessions()', 'execute') as authenticated,
--        has_function_privilege('service_role', 'public.purge_inactive_guest_sessions()', 'execute') as service_role;

-- ============================================
-- ROLLBACK
-- ============================================

-- Retirer la purge (le cron journalise alors une erreur à cette étape, le reste du ménage continue) :
-- DROP FUNCTION IF EXISTS public.purge_inactive_guest_sessions();
-- DROP FUNCTION IF EXISTS public.inactive_guest_sessions();
-- Une session supprimée ne revient pas (sauvegarde de la base seulement).
