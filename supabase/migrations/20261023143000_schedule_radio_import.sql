-- ============================================
-- Migration : Radio — l'import chaque heure, lancé par la base (pg_cron)
-- Date : 2026-10-23
-- Description : l'import de la radio doit tourner chaque heure (`../live/docs/RADIO_CAMPUS.md`, § 4),
-- mais Vercel Hobby n'accepte qu'un cron par jour : un « 0 * * * * » dans vercel.json fait échouer le
-- déploiement (« Hobby accounts are limited to daily cron jobs »). vercel.json garde donc un passage par
-- jour, et la base lance les autres : pg_cron, chaque heure à :07, appelle
-- GET <app.api_url ou https://www.outlive.fr>/api/cron/radio-import par pg_net, avec le secret des crons
-- lu dans Vault (« radio_import_cron_secret », la valeur de CRON_SECRET sur Vercel). Sans ce secret, rien
-- n'est envoyé (comme le webhook des vignettes, 20261019190000_add_event_image_cards.sql).
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- - pg_cron et pg_net (créés s'ils manquent) ;
-- - radio_request_import() : l'appel de la route, sans effet sans le secret ; service seulement ;
-- - la tâche « radio-import » de pg_cron, chaque heure à :07.
-- L'import lui-même ne relit pas un flux lu depuis moins de 50 minutes : le passage quotidien de Vercel
-- ou un import lancé à la main ne doublent pas les lectures chez la radio.
--
-- À faire en prod après la migration, une fois (SQL Editor) :
--   select vault.create_secret('<la valeur de CRON_SECRET sur Vercel>', 'radio_import_cron_secret');
-- Sur Vercel Pro, on pourrait à la place mettre « 7 * * * * » dans vercel.json et retirer la tâche :
--   select cron.unschedule('radio-import');

-- ============================================
-- CODE SQL
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- La requête part dans la file de pg_net ; la route répond en moins de 60 s.
CREATE OR REPLACE FUNCTION public.radio_request_import()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cron_secret text;
  api_base_url text;
BEGIN
  SELECT s.decrypted_secret
  INTO cron_secret
  FROM vault.decrypted_secrets AS s
  WHERE s.name = 'radio_import_cron_secret'
  LIMIT 1;

  -- Secret pas encore posé : le passage quotidien de Vercel suffit en attendant.
  IF NULLIF(cron_secret, '') IS NULL THEN
    RETURN NULL;
  END IF;

  api_base_url := rtrim(
    COALESCE(NULLIF(current_setting('app.api_url', true), ''), 'https://www.outlive.fr'),
    '/'
  );

  RETURN net.http_get(
    url := api_base_url || '/api/cron/radio-import',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
    timeout_milliseconds := 60000
  );
END;
$$;

COMMENT ON FUNCTION public.radio_request_import() IS
  'Radio : appelle GET /api/cron/radio-import (pg_net) avec le secret « radio_import_cron_secret » de Vault ; sans lui, rien. Lancée chaque heure par la tâche pg_cron « radio-import ».';

REVOKE ALL ON FUNCTION public.radio_request_import() FROM PUBLIC, anon, authenticated;

-- Chaque heure à :07 (pas à l'heure pile). Rejouable : une tâche du même nom est remplacée.
SELECT cron.schedule('radio-import', '7 * * * *', 'SELECT public.radio_request_import()');

-- Vérification (SQL Editor) :
-- select jobname, schedule, active from cron.job where jobname = 'radio-import';
-- select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'radio-import') order by start_time desc limit 5;
-- select id, status_code, left(content, 200) from net._http_response order by created desc limit 5;

-- ============================================
-- ROLLBACK
-- ============================================
-- select cron.unschedule('radio-import');
-- DROP FUNCTION IF EXISTS public.radio_request_import();
