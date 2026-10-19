-- ============================================
-- Migration : vignettes des affiches d'événements
-- Date : 2026-10-19
-- Description : étape C7a de ../live/docs/PLAN_REFONTE.md (décision 1 : vignettes générées par
--   live-admin). Les affiches entrent dans Storage par cinq chemins (formulaire de l'admin, espace
--   organisateur, import par lot, collecte, assistant de l'app) : la vignette s'accroche ici, dans
--   la base, plutôt que dans chacun d'eux. Mode d'emploi : docs/EVENT_IMAGE_CARDS.md.
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- - events : image_card_url (vignette WebP d'environ 800 px de large), image_width et
--   image_height (dimensions de l'original, orientation EXIF appliquée), image_color (couleur
--   dominante, « #rrggbb »), image_card_error (dernier échec définitif, sinon null).
--   Toutes à null tant que la vignette n'est pas faite : l'app garde alors image_url.
-- - Trigger events_reset_image_card : ces colonnes repartent à null à l'insertion et quand
--   image_url change. Une vignette remplie correspond donc toujours à l'image_url de sa ligne.
-- - Trigger events_request_image_card : quand une affiche apparaît ou change, pg_net appelle
--   POST <app.api_url ou https://www.outlive.fr>/api/events/<id>/image-card avec le secret
--   « image_card_webhook_secret » lu dans Vault (même valeur que IMAGE_CARD_WEBHOOK_SECRET sur
--   Vercel). Sans ce secret, rien n'est envoyé : le cron quotidien /api/cron/image-cards rattrape.
-- - queue_event_sync_job() : une mise à jour qui ne change que ces colonnes (et updated_at) n'est
--   plus mise en file pour Notion ; sinon chaque vignette posée ajouterait un job Notion.
--
-- app_events() rend `setof public.events` : les nouvelles colonnes y sont sans la modifier.
-- Prérequis : pg_net (créé ci-dessous s'il manque) et Vault (supabase_vault, présent par défaut).

-- ============================================
-- CODE SQL
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS image_card_url text,
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS image_color text,
  ADD COLUMN IF NOT EXISTS image_card_error text;

-- Pour l'app : une vignette vient toujours avec les dimensions et la couleur, utilisables telles
-- quelles. (COALESCE : une seule dimension renseignée donnerait NULL, qu'un CHECK accepte.)
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_image_size_check,
  ADD CONSTRAINT events_image_size_check CHECK (
    (image_width IS NULL AND image_height IS NULL)
    OR COALESCE(image_width > 0 AND image_height > 0, false)
  ),
  DROP CONSTRAINT IF EXISTS events_image_color_check,
  ADD CONSTRAINT events_image_color_check CHECK (
    image_color IS NULL OR image_color ~ '^#[0-9a-f]{6}$'
  ),
  DROP CONSTRAINT IF EXISTS events_image_card_check,
  ADD CONSTRAINT events_image_card_check CHECK (
    image_card_url IS NULL OR (image_width IS NOT NULL AND image_color IS NOT NULL)
  );

COMMENT ON COLUMN public.events.image_card_url IS
  'Vignette de image_url pour les listes (WebP, ~800 px de large), produite par live-admin. Null tant qu''elle n''est pas faite : utiliser image_url.';
COMMENT ON COLUMN public.events.image_width IS
  'Largeur en pixels de image_url (orientation EXIF appliquée), remplie avec la vignette.';
COMMENT ON COLUMN public.events.image_height IS
  'Hauteur en pixels de image_url (orientation EXIF appliquée), remplie avec la vignette.';
COMMENT ON COLUMN public.events.image_color IS
  'Couleur dominante de image_url (#rrggbb), pour réserver la place de l''image avant son arrivée.';
COMMENT ON COLUMN public.events.image_card_error IS
  'Dernier échec définitif de la vignette (image introuvable, illisible…). Remis à null quand image_url change.';

-- Remise à zéro : à l'insertion (une ligne recopiée garde sinon la vignette d'une autre image) et
-- quand image_url change.
CREATE OR REPLACE FUNCTION public.reset_event_image_card()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.image_url IS DISTINCT FROM OLD.image_url THEN
    NEW.image_card_url := NULL;
    NEW.image_width := NULL;
    NEW.image_height := NULL;
    NEW.image_color := NULL;
    NEW.image_card_error := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_reset_image_card ON public.events;
CREATE TRIGGER events_reset_image_card
  BEFORE INSERT OR UPDATE OF image_url ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_event_image_card();

-- Webhook : la requête part après le commit (file de pg_net), jamais si l'enregistrement est
-- annulé. Une erreur ici ne bloque jamais l'enregistrement de l'événement.
-- `security definer` : lit Vault et appelle pg_net, quel que soit l'auteur de l'écriture.
CREATE OR REPLACE FUNCTION public.request_event_image_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  webhook_secret text;
  api_base_url text;
BEGIN
  IF NULLIF(btrim(NEW.image_url), '') IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url THEN
    RETURN NULL;
  END IF;

  SELECT s.decrypted_secret
  INTO webhook_secret
  FROM vault.decrypted_secrets AS s
  WHERE s.name = 'image_card_webhook_secret'
  LIMIT 1;

  -- Webhook pas encore branché : le cron quotidien fera la vignette.
  IF NULLIF(webhook_secret, '') IS NULL THEN
    RETURN NULL;
  END IF;

  api_base_url := rtrim(
    COALESCE(NULLIF(current_setting('app.api_url', true), ''), 'https://www.outlive.fr'),
    '/'
  );

  PERFORM net.http_post(
    url := api_base_url || '/api/events/' || NEW.id::text || '/image-card',
    body := jsonb_build_object('event_id', NEW.id, 'image_url', NEW.image_url),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_secret
    ),
    timeout_milliseconds := 30000
  );

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Vignette de l''événement % non demandée : %', NEW.id, SQLERRM;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS events_request_image_card ON public.events;
CREATE TRIGGER events_request_image_card
  AFTER INSERT OR UPDATE OF image_url ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.request_event_image_card();

-- Notion : définition de 20260414110000_create_notion_sync_tables.sql, plus le premier IF.
CREATE OR REPLACE FUNCTION public.queue_event_sync_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_event_id uuid;
  target_page_id text;
  payload jsonb;
BEGIN
  -- Vignette posée par live-admin : rien d'autre n'a changé, rien à envoyer à Notion.
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - ARRAY['image_card_url', 'image_width', 'image_height', 'image_color', 'image_card_error', 'updated_at'])
       = (to_jsonb(OLD) - ARRAY['image_card_url', 'image_width', 'image_height', 'image_color', 'image_card_error', 'updated_at']) THEN
    RETURN NEW;
  END IF;

  target_event_id := COALESCE(NEW.id, OLD.id);
  payload := '{}'::jsonb;

  IF TG_OP = 'DELETE' THEN
    SELECT notion_page_id INTO target_page_id
    FROM public.notion_event_links
    WHERE event_id = OLD.id
    LIMIT 1;

    UPDATE public.notion_event_links
    SET deleted_at = COALESCE(deleted_at, now())
    WHERE event_id = OLD.id;

    payload := jsonb_build_object('action', 'delete');
  ELSIF TG_OP = 'UPDATE' AND COALESCE(NEW.archived, false) = true AND COALESCE(OLD.archived, false) = false THEN
    payload := jsonb_build_object('action', 'archive');
  END IF;

  PERFORM public.enqueue_notion_sync_job(
    'event',
    target_event_id,
    target_page_id,
    'to_notion',
    'events_' || lower(TG_OP),
    payload,
    'event:' || target_event_id::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Vérification (SQL Editor, lecture seule) :
-- select count(*) filter (where image_url is not null) as avec_affiche,
--        count(*) filter (where image_card_url is not null) as avec_vignette,
--        count(*) filter (where image_card_error is not null) as en_echec
-- from public.events;
-- Derniers appels du webhook (gardés 6 h par pg_net) :
-- select created, status_code, left(content, 200) from net._http_response order by created desc limit 20;

-- ============================================
-- ROLLBACK
-- ============================================

-- DROP TRIGGER IF EXISTS events_request_image_card ON public.events;
-- DROP TRIGGER IF EXISTS events_reset_image_card ON public.events;
-- DROP FUNCTION IF EXISTS public.request_event_image_card();
-- DROP FUNCTION IF EXISTS public.reset_event_image_card();
-- Rejouer la définition de queue_event_sync_job() de 20260414110000_create_notion_sync_tables.sql.
-- ALTER TABLE public.events
--   DROP CONSTRAINT IF EXISTS events_image_size_check,
--   DROP CONSTRAINT IF EXISTS events_image_color_check,
--   DROP CONSTRAINT IF EXISTS events_image_card_check,
--   DROP COLUMN IF EXISTS image_card_url,
--   DROP COLUMN IF EXISTS image_width,
--   DROP COLUMN IF EXISTS image_height,
--   DROP COLUMN IF EXISTS image_color,
--   DROP COLUMN IF EXISTS image_card_error;
-- DELETE FROM vault.secrets WHERE name = 'image_card_webhook_secret';
-- Les fichiers event-images/cards/* deviennent orphelins : scripts/audit-storage.mjs les retire.
