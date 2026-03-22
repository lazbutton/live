CREATE OR REPLACE FUNCTION public.is_event_approved_for_public_event_organizers(
  target_event_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events
    WHERE public.events.id = target_event_id
      AND public.events.status = 'approved'
  );
$$;

COMMENT ON FUNCTION public.is_event_approved_for_public_event_organizers(uuid) IS
'Retourne true si un lien event_organizers pointe vers un événement approuvé, sans réévaluer les policies RLS de la requête appelante.';

DROP POLICY IF EXISTS "Event organizers for approved events are viewable by everyone"
  ON public.event_organizers;

CREATE POLICY "Event organizers for approved events are viewable by everyone"
  ON public.event_organizers
  FOR SELECT
  USING (
    public.is_event_approved_for_public_event_organizers(event_id)
  );
