-- Date de première publication d'un événement dans l'app : events.published_at.
--
-- Les suivis (U8 de ../live/docs/AMELIORATIONS.md) préviennent quand un lieu, un organisateur ou un
-- artiste suivi publie (20261021142000_create_follows_digest.sql) et comptent ses nouveaux
-- événements dans « Mes suivis » (app_follows(), 20261021141000_create_user_follows.sql). Il faut
-- pour cela savoir quand un événement est apparu dans l'app, pas quand sa ligne a été créée : un
-- événement importé par la collecte peut attendre la modération plusieurs jours (status 'pending')
-- avant d'être approuvé, et created_at le daterait de son import.
--
-- published_at : l'instant où l'événement a rempli pour la première fois les conditions
-- d'app_events() (20261017120000) : approuvé, non archivé, show_on_app, non masqué par la
-- modération. Ces conditions sont recopiées dans set_event_published_at() : changer l'une, c'est
-- changer l'autre. Null : jamais visible dans l'app.
-- La colonne est tenue par la base seule (trigger trg_events_set_published_at) : posée à
-- l'insertion ou à la mise à jour qui rend l'événement visible, jamais effacée ni déplacée ensuite.
-- Une valeur envoyée par un client est ignorée (une copie d'événement ne garde pas la date de
-- l'original). Retiré de l'app puis remis, un événement garde sa première date : ses suiveurs n'en
-- sont pas prévenus deux fois.
--
-- Événements déjà visibles : published_at = created_at (à défaut, maintenant). Personne ne les
-- suivait encore : aucune notification ne les attend.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

COMMENT ON COLUMN public.events.published_at IS
  'Instant de la première publication dans l''app (conditions d''app_events() remplies pour la première fois), tenu par le trigger trg_events_set_published_at ; null : jamais visible. Sert aux suivis (U8).';

-- Avant le trigger, qui ignorerait ces valeurs. Sans toucher à updated_at (trigger
-- update_events_updated_at, BEFORE UPDATE) : ce n'est pas une modification des événements, et l'API
-- v1 expose updatedAt (lib/api/v1/events).
DO $$
DECLARE
  avec_updated_at boolean := EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.events'::regclass
      AND tgname = 'update_events_updated_at'
      AND NOT tgisinternal
  );
BEGIN
  IF avec_updated_at THEN
    ALTER TABLE public.events DISABLE TRIGGER update_events_updated_at;
  END IF;

  UPDATE public.events
  SET published_at = coalesce(created_at, now())
  WHERE published_at IS NULL
    AND status = 'approved'
    AND archived = false
    AND show_on_app = true
    AND is_safety_hidden = false;

  IF avec_updated_at THEN
    ALTER TABLE public.events ENABLE TRIGGER update_events_updated_at;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_event_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- La date déjà posée reste ; sinon, maintenant si l'événement devient visible dans l'app.
  NEW.published_at := CASE WHEN TG_OP = 'UPDATE' THEN OLD.published_at END;
  IF NEW.published_at IS NULL
    AND NEW.status = 'approved'
    AND NEW.archived = false
    AND NEW.show_on_app = true
    AND NEW.is_safety_hidden = false
  THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.set_event_published_at() IS
  'Trigger de events : pose published_at la première fois que l''événement remplit les conditions d''app_events(), garde la date déjà posée, ignore toute valeur envoyée.';

DROP TRIGGER IF EXISTS trg_events_set_published_at ON public.events;
CREATE TRIGGER trg_events_set_published_at
  BEFORE INSERT OR UPDATE OF status, archived, show_on_app, is_safety_hidden, published_at
  ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_event_published_at();

-- Index des nouveautés : les événements publiés depuis une date (suivis).
CREATE INDEX IF NOT EXISTS idx_events_published_at
  ON public.events USING btree (published_at)
  WHERE published_at IS NOT NULL;

-- Vérification (SQL Editor) : les dernières publications.
-- select title, status, created_at, published_at from public.events
-- where published_at is not null order by published_at desc limit 10;

-- Rollback :
-- DROP TRIGGER IF EXISTS trg_events_set_published_at ON public.events;
-- DROP FUNCTION IF EXISTS public.set_event_published_at();
-- DROP INDEX IF EXISTS public.idx_events_published_at;
-- ALTER TABLE public.events DROP COLUMN IF EXISTS published_at;
