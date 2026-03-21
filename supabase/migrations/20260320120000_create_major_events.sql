-- Migration: create_major_events
-- Description: ajoute le socle multi-lieux avec major_events et ses tables de liaison

CREATE TABLE public.major_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    short_description text,
    long_description text,
    hero_image_url text,
    logo_url text,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    timezone text DEFAULT 'Europe/Paris'::text NOT NULL,
    city_name text,
    primary_category text,
    tag_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    map_center_latitude numeric(10,8),
    map_center_longitude numeric(11,8),
    default_map_zoom numeric(5,2),
    ticketing_url text,
    official_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT major_events_end_after_start CHECK ((end_at >= start_at)),
    CONSTRAINT major_events_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'archived'::text]))),
    CONSTRAINT major_events_pkey PRIMARY KEY (id),
    CONSTRAINT major_events_slug_key UNIQUE (slug),
    CONSTRAINT major_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.major_events IS 'Hub éditorial pour les gros événements multi-lieux.';
COMMENT ON COLUMN public.major_events.slug IS 'Slug public utilisé pour les URLs et deep links.';
COMMENT ON COLUMN public.major_events.primary_category IS 'Catégorie principale du hub, alignée sur events.category.';
COMMENT ON COLUMN public.major_events.tag_ids IS 'Tags éditoriaux de regroupement.';
COMMENT ON COLUMN public.major_events.default_map_zoom IS 'Zoom par défaut de la carte du hub.';

CREATE TABLE public.major_event_events (
    major_event_id uuid NOT NULL,
    event_id uuid NOT NULL,
    sort_index integer DEFAULT 0 NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    program_label_override text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT major_event_events_pkey PRIMARY KEY (major_event_id, event_id),
    CONSTRAINT major_event_events_event_id_key UNIQUE (event_id),
    CONSTRAINT major_event_events_major_event_id_fkey FOREIGN KEY (major_event_id) REFERENCES public.major_events(id) ON DELETE CASCADE,
    CONSTRAINT major_event_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.major_event_events IS 'Liaison entre un hub multi-lieux et ses événements enfants.';
COMMENT ON COLUMN public.major_event_events.program_label_override IS 'Libellé éditorial optionnel affiché dans le programme du hub.';

CREATE TABLE public.major_event_locations (
    major_event_id uuid NOT NULL,
    location_id uuid NOT NULL,
    sort_index integer DEFAULT 0 NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    label_override text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT major_event_locations_pkey PRIMARY KEY (major_event_id, location_id),
    CONSTRAINT major_event_locations_major_event_id_fkey FOREIGN KEY (major_event_id) REFERENCES public.major_events(id) ON DELETE CASCADE,
    CONSTRAINT major_event_locations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.major_event_locations IS 'Lieux participants d’un hub multi-lieux.';
COMMENT ON COLUMN public.major_event_locations.label_override IS 'Nom alternatif du lieu dans le contexte du hub.';

CREATE TABLE public.major_event_organizers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    major_event_id uuid NOT NULL,
    organizer_id uuid,
    location_id uuid,
    role_label text,
    sort_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT major_event_organizers_pkey PRIMARY KEY (id),
    CONSTRAINT major_event_organizers_exactly_one_check CHECK ((((organizer_id IS NOT NULL) AND (location_id IS NULL)) OR ((organizer_id IS NULL) AND (location_id IS NOT NULL)))),
    CONSTRAINT major_event_organizers_major_event_id_fkey FOREIGN KEY (major_event_id) REFERENCES public.major_events(id) ON DELETE CASCADE,
    CONSTRAINT major_event_organizers_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE,
    CONSTRAINT major_event_organizers_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.major_event_organizers IS 'Organisateurs, partenaires ou lieux-organisateurs liés à un hub multi-lieux.';
COMMENT ON COLUMN public.major_event_organizers.role_label IS 'Rôle d’affichage dans le hub : partenaire, co-prod, scène invitée, etc.';

CREATE UNIQUE INDEX major_event_organizers_major_event_id_organizer_id_key
    ON public.major_event_organizers USING btree (major_event_id, organizer_id)
    WHERE (organizer_id IS NOT NULL);

CREATE UNIQUE INDEX major_event_organizers_major_event_id_location_id_key
    ON public.major_event_organizers USING btree (major_event_id, location_id)
    WHERE (location_id IS NOT NULL);

CREATE INDEX idx_major_events_status ON public.major_events USING btree (status);
CREATE INDEX idx_major_events_start_at ON public.major_events USING btree (start_at);
CREATE INDEX idx_major_events_end_at ON public.major_events USING btree (end_at);
CREATE INDEX idx_major_events_is_featured ON public.major_events USING btree (is_featured);

CREATE INDEX idx_major_event_events_major_event_id_sort_index
    ON public.major_event_events USING btree (major_event_id, sort_index, event_id);

CREATE INDEX idx_major_event_locations_major_event_id_sort_index
    ON public.major_event_locations USING btree (major_event_id, sort_index, location_id);

CREATE INDEX idx_major_event_organizers_major_event_id_sort_index
    ON public.major_event_organizers USING btree (major_event_id, sort_index, id);

CREATE TRIGGER update_major_events_updated_at
    BEFORE UPDATE ON public.major_events
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.major_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.major_event_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.major_event_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.major_event_organizers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved major events are viewable by everyone"
    ON public.major_events
    FOR SELECT
    USING ((status = 'approved'::text));

CREATE POLICY "Admins can view all major events"
    ON public.major_events
    FOR SELECT
    USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));

CREATE POLICY "Admins can create major events"
    ON public.major_events
    FOR INSERT
    WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));

CREATE POLICY "Admins can update major events"
    ON public.major_events
    FOR UPDATE
    USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)))
    WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));

CREATE POLICY "Admins can delete major events"
    ON public.major_events
    FOR DELETE
    USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));

CREATE POLICY "Approved major event links are viewable by everyone"
    ON public.major_event_events
    FOR SELECT
    USING ((EXISTS (
        SELECT 1
        FROM public.major_events me
        WHERE ((me.id = major_event_events.major_event_id) AND (me.status = 'approved'::text))
    )) AND (EXISTS (
        SELECT 1
        FROM public.events e
        WHERE ((e.id = major_event_events.event_id) AND (e.status = 'approved'::text) AND (COALESCE(e.archived, false) = false))
    )));

CREATE POLICY "Admins can manage all major event links"
    ON public.major_event_events
    USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)))
    WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));

CREATE POLICY "Approved major event locations are viewable by everyone"
    ON public.major_event_locations
    FOR SELECT
    USING (EXISTS (
        SELECT 1
        FROM public.major_events me
        WHERE ((me.id = major_event_locations.major_event_id) AND (me.status = 'approved'::text))
    ));

CREATE POLICY "Admins can manage all major event locations"
    ON public.major_event_locations
    USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)))
    WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));

CREATE POLICY "Approved major event organizers are viewable by everyone"
    ON public.major_event_organizers
    FOR SELECT
    USING (EXISTS (
        SELECT 1
        FROM public.major_events me
        WHERE ((me.id = major_event_organizers.major_event_id) AND (me.status = 'approved'::text))
    ));

CREATE POLICY "Admins can manage all major event organizers"
    ON public.major_event_organizers
    USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)))
    WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));
