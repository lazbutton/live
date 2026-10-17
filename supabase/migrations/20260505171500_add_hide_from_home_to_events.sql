-- Add a dedicated flag to hide events from the home feed
-- while keeping them visible in category pages.

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS hide_from_home boolean DEFAULT false;

UPDATE public.events
SET hide_from_home = false
WHERE hide_from_home IS NULL;

ALTER TABLE public.events
ALTER COLUMN hide_from_home SET DEFAULT false;

ALTER TABLE public.events
ALTER COLUMN hide_from_home SET NOT NULL;

COMMENT ON COLUMN public.events.hide_from_home IS
  'If true, event is hidden from home feed (all categories view) but still visible in category-specific pages.';
