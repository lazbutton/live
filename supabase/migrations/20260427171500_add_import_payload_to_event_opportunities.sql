ALTER TABLE public.event_opportunities
  ADD COLUMN IF NOT EXISTS capture_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS import_payload jsonb,
  ADD COLUMN IF NOT EXISTS import_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS import_metadata jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_opportunities_capture_mode_check'
  ) THEN
    ALTER TABLE public.event_opportunities
      ADD CONSTRAINT event_opportunities_capture_mode_check
      CHECK (
        capture_mode = ANY (
          ARRAY[
            'manual'::text,
            'url'::text,
            'image'::text,
            'facebook'::text
          ]
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.event_opportunities.capture_mode IS 'Mode de capture utilise dans la collecte: manual, url, image ou facebook.';
COMMENT ON COLUMN public.event_opportunities.import_payload IS 'Payload importe normalise pour pre-remplir le formulaire evenement depuis le pipeline.';
COMMENT ON COLUMN public.event_opportunities.import_warnings IS 'Warnings de rapprochement ou extraction produits pendant l import.';
COMMENT ON COLUMN public.event_opportunities.import_metadata IS 'Metadata technique issue des APIs d import.';
