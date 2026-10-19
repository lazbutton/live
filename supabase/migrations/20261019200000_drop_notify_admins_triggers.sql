-- Retrait des triggers pg_net qui devaient notifier les admins des nouvelles demandes et des
-- nouveaux feedbacks : ils n'ont jamais rien envoyé.
--
-- notify_admins_new_request_trigger() et notify_admins_new_feedback_trigger() (dernière
-- définition : 20260821124000_configure_notification_api_url.sql) appellent
-- `net.http_post(url := …, headers := …, body := payload::text)`. pg_net attend un corps jsonb
-- (`http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)`,
-- vérifié avec pg_net 0.19.5) et Postgres ne convertit pas implicitement text en jsonb : l'appel
-- échoue, le bloc EXCEPTION n'en fait qu'un WARNING et aucune requête ne part. Déjà le cas dans
-- leur première version (20250120000002, 20250120000003).
--
-- Les admins sont notifiés par le code :
-- - demandes : POST /api/user-requests (sendNotificationToAdmins) ; si la route échoue, l'app
--   insère la demande elle-même puis appelle POST /api/notifications/admin/new-request ;
-- - feedbacks : l'ancien formulaire de l'app (retiré) appelait /api/notifications/admin/new-feedback.
-- Réparés, ces triggers notifieraient ces cas une deuxième fois, et chaque ligne importée en masse
-- (scraping, Facebook, Notion). Les retirer ne change rien à ce que reçoivent les admins.
--
-- Retirées aussi : notify_admins_new_request(uuid) et notify_admins_new_feedback(uuid)
-- (20250120000000, 20250120000001). Elles ne font qu'un RAISE NOTICE, rien ne les appelle, et
-- elles sont exposées en RPC (security definer).
--
-- Rejouable : IF EXISTS partout. Sans CASCADE : si un autre trigger utilise encore l'une de ces
-- fonctions, la migration échoue au lieu de le supprimer en silence. Un Database Webhook créé
-- depuis le dashboard porte un autre nom et appelle une autre fonction : il n'est pas concerné.

DROP TRIGGER IF EXISTS trigger_notify_admins_new_request ON public.user_requests;
DROP TRIGGER IF EXISTS trigger_notify_admins_new_feedback ON public.feedbacks;

DROP FUNCTION IF EXISTS public.notify_admins_new_request_trigger();
DROP FUNCTION IF EXISTS public.notify_admins_new_feedback_trigger();
DROP FUNCTION IF EXISTS public.notify_admins_new_request(uuid);
DROP FUNCTION IF EXISTS public.notify_admins_new_feedback(uuid);

-- Vérification (lecture seule), aucune ligne attendue :
-- select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname like 'notify_admins_new_%';
-- select tgrelid::regclass, tgname from pg_trigger where tgname like 'trigger_notify_admins_%';

-- Rollback : réappliquer 20250120000000 à 20250120000003, puis 20260821124000 (triggers recréés,
-- toujours sans effet tant que le corps reste en text).
