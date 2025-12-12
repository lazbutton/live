--
-- PostgreSQL database dump
--

\restrict dbBvoNyVPCGg7l1MttK6fxfWLof0q8xVhzISN1j5F3QMWNeB1a71xPFy9Cik6fL

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: convert_event_request_to_event(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convert_event_request_to_event(request_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  new_event_id UUID;
  request_data RECORD;
  current_user_id UUID;
  event_json JSONB;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  IF NOT is_user_admin() THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent convertir des demandes en événements';
  END IF;

  -- On ne convertit que les demandes complètes (event_creation)
  SELECT * INTO request_data
  FROM user_requests
  WHERE id = request_id
    AND request_type = 'event_creation'
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande d''événement non trouvée ou déjà traitée';
  END IF;

  IF request_data.event_data IS NULL THEN
    RAISE EXCEPTION 'Les données de l''événement sont manquantes';
  END IF;

  event_json := request_data.event_data;

  INSERT INTO events (
    title,
    description,
    date,
    end_date,
    location_id,
    image_url,
    category,
    price,
    presale_price,
    subscriber_price,
    address,
    capacity,
    door_opening_time,
    external_url,
    external_url_label,
    instagram_url,
    facebook_url,
    scraping_url,
    created_by,
    status
  ) VALUES (
    event_json->>'title',
    event_json->>'description',
    (event_json->>'date')::timestamptz,
    NULLIF(event_json->>'end_date', 'null')::timestamptz,
    NULLIF(event_json->>'location_id', 'null')::UUID,
    NULLIF(event_json->>'image_url', 'null'),
    event_json->>'category',
    NULLIF(event_json->>'price', 'null')::DECIMAL,
    NULLIF(event_json->>'presale_price', 'null')::DECIMAL,
    NULLIF(event_json->>'subscriber_price', 'null')::DECIMAL,
    NULLIF(event_json->>'address', 'null'),
    NULLIF(event_json->>'capacity', 'null')::INTEGER,
    NULLIF(event_json->>'door_opening_time', 'null'),
    NULLIF(event_json->>'external_url', 'null'),
    NULLIF(event_json->>'external_url_label', 'null'),
    NULLIF(event_json->>'instagram_url', 'null'),
    NULLIF(event_json->>'facebook_url', 'null'),
    NULLIF(event_json->>'scraping_url', 'null'),
    request_data.requested_by,
    'pending'
  ) RETURNING id INTO new_event_id;

  -- Lier l'organisateur si présent dans event_data
  IF event_json->>'organizer_id' IS NOT NULL AND event_json->>'organizer_id' != 'null' THEN
    INSERT INTO event_organizers (event_id, organizer_id)
    VALUES (new_event_id, (event_json->>'organizer_id')::UUID)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE user_requests
  SET
    status = 'converted',
    converted_event_id = new_event_id,
    converted_at = NOW(),
    reviewed_by = current_user_id,
    reviewed_at = NOW(),
    notes = COALESCE(notes, '') || E'\nConverti en événement ID: ' || new_event_id::TEXT
  WHERE id = request_id;

  RETURN new_event_id;
END;
$$;


--
-- Name: FUNCTION convert_event_request_to_event(request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.convert_event_request_to_event(request_id uuid) IS 'Convertit une demande event_creation (user_requests) en événement status=pending et marque la demande comme converted. Admin uniquement.';


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Pour l'instant, retourner false (pas de système admin)
  -- Vous pouvez modifier cette fonction plus tard pour vérifier un rôle
  RETURN false;
END;
$$;


--
-- Name: is_user_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Récupérer le rôle de l'utilisateur connecté
  SELECT raw_user_meta_data->>'role' INTO user_role
  FROM auth.users
  WHERE id = auth.uid();
  
  -- Retourner true si le rôle est 'admin'
  RETURN COALESCE(user_role = 'admin', false);
END;
$$;


--
-- Name: make_user_admin(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.make_user_admin(user_email text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  user_id UUID;
  current_metadata JSONB;
BEGIN
  -- Trouver l'ID de l'utilisateur par email
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF user_id IS NULL THEN
    RETURN 'Erreur: Utilisateur avec l''email ' || user_email || ' introuvable';
  END IF;
  
  -- Récupérer les métadonnées actuelles
  SELECT raw_user_meta_data INTO current_metadata
  FROM auth.users
  WHERE id = user_id;
  
  -- Ajouter ou mettre à jour le rôle admin
  IF current_metadata IS NULL THEN
    current_metadata := '{"role": "admin"}'::jsonb;
  ELSE
    current_metadata := current_metadata || '{"role": "admin"}'::jsonb;
  END IF;
  
  -- Mettre à jour les métadonnées de l'utilisateur
  UPDATE auth.users
  SET raw_user_meta_data = current_metadata
  WHERE id = user_id;
  
  RETURN 'Succès: L''utilisateur ' || user_email || ' est maintenant admin';
END;
$$;


--
-- Name: update_categories_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_categories_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_event_notifications_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_event_notifications_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_feedback_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_feedback_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_notification_preferences_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_notification_preferences_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_organizer_ai_fields_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_organizer_ai_fields_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_organizer_scraping_configs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_organizer_scraping_configs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    icon_url text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    icon_svg text
);


--
-- Name: TABLE categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.categories IS 'Table des catégories d''événements, éditables par les administrateurs';


--
-- Name: COLUMN categories.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.name IS 'Nom de la catégorie (en majuscules, unique)';


--
-- Name: COLUMN categories.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.description IS 'Description de la catégorie';


--
-- Name: COLUMN categories.icon_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.icon_url IS 'URL de l''icône de la catégorie (optionnel)';


--
-- Name: COLUMN categories.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.is_active IS 'Indique si la catégorie est active et visible';


--
-- Name: COLUMN categories.display_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.display_order IS 'Ordre d''affichage de la catégorie';


--
-- Name: COLUMN categories.icon_svg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.icon_svg IS 'Icône SVG de la catégorie (format SVG en texte)';


--
-- Name: event_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_likes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE event_likes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.event_likes IS 'Table pour gérer les likes d''événements par utilisateur';


--
-- Name: COLUMN event_likes.event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_likes.event_id IS 'ID de l''événement liké';


--
-- Name: COLUMN event_likes.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_likes.user_id IS 'ID de l''utilisateur qui a liké';


--
-- Name: event_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    notification_scheduled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE event_notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.event_notifications IS 'Table pour gérer les notifications d''événements activées par les utilisateurs';


--
-- Name: COLUMN event_notifications.event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_notifications.event_id IS 'ID de l''événement pour lequel la notification est activée';


--
-- Name: COLUMN event_notifications.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_notifications.user_id IS 'ID de l''utilisateur qui a activé la notification';


--
-- Name: COLUMN event_notifications.is_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_notifications.is_enabled IS 'Indique si la notification est activée ou non';


--
-- Name: COLUMN event_notifications.notification_scheduled_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_notifications.notification_scheduled_at IS 'Date à laquelle la notification est programmée (1 jour avant l''événement)';


--
-- Name: event_organizers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_organizers (
    event_id uuid NOT NULL,
    organizer_id uuid,
    location_id uuid,
    CONSTRAINT event_organizers_exactly_one_organizer CHECK ((((organizer_id IS NOT NULL) AND (location_id IS NULL)) OR ((organizer_id IS NULL) AND (location_id IS NOT NULL))))
);


--
-- Name: COLUMN event_organizers.location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_organizers.location_id IS 'ID du lieu utilisé comme organisateur (mutuellement exclusif avec organizer_id)';


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    description text,
    date timestamp with time zone NOT NULL,
    location_id uuid,
    image_url text,
    category text NOT NULL,
    price numeric(10,2),
    address text,
    capacity integer,
    door_opening_time text,
    external_url text,
    created_by uuid,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    end_time text,
    tag_ids uuid[] DEFAULT '{}'::uuid[],
    end_date timestamp with time zone,
    external_url_label text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    room_id uuid,
    instagram_url text,
    facebook_url text,
    archived boolean DEFAULT false NOT NULL,
    is_full boolean DEFAULT false,
    presale_price numeric(10,2),
    subscriber_price numeric(10,2),
    scraping_url text,
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: COLUMN events.end_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.end_time IS 'Heure de fin de l''événement au format HH:MM (ex: 23:30)';


--
-- Name: COLUMN events.end_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.end_date IS 'Date et heure de fin de l''événement (TIMESTAMP WITH TIME ZONE)';


--
-- Name: COLUMN events.external_url_label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.external_url_label IS 'Label personnalisé pour le lien externe de l''événement. Si vide, l''URL sera affichée.';


--
-- Name: COLUMN events.room_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.room_id IS 'ID de la salle où se déroule l''événement (optionnel)';


--
-- Name: COLUMN events.instagram_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.instagram_url IS 'URL du profil Instagram de l''événement';


--
-- Name: COLUMN events.facebook_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.facebook_url IS 'URL du profil Facebook de l''événement';


--
-- Name: COLUMN events.archived; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.archived IS 'Indique si l evenement est archive (true) ou actif (false). Les evenements archives ne sont plus affiches dans l application.';


--
-- Name: COLUMN events.is_full; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.is_full IS 'Indique si l''événement est complet (sold out). Par défaut false.';


--
-- Name: COLUMN events.presale_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.presale_price IS 'Tarif prévente de l''événement (optionnel)';


--
-- Name: COLUMN events.subscriber_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.subscriber_price IS 'Tarif pour les abonnés (optionnel)';


--
-- Name: COLUMN events.scraping_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.scraping_url IS 'URL d''exemple pour le scraping d''informations sur l''événement (optionnel)';


--
-- Name: feedback_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE feedback_objects; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.feedback_objects IS 'Types d''objets de feedback administrables';


--
-- Name: feedbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedbacks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    feedback_object_id uuid NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'pending'::text,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT feedbacks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'read'::text, 'resolved'::text, 'archived'::text])))
);


--
-- Name: TABLE feedbacks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.feedbacks IS 'Feedbacks soumis par les utilisateurs';


--
-- Name: COLUMN feedbacks.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feedbacks.status IS 'Statut du feedback: pending, read, resolved, archived';


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    image_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    short_description text,
    capacity integer,
    directions text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    instagram_url text,
    facebook_url text,
    is_organizer boolean DEFAULT false,
    facebook_page_id text,
    website_url text,
    scraping_example_url text,
    suggested boolean DEFAULT false NOT NULL,
    tiktok_url text
);


--
-- Name: COLUMN locations.is_organizer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.is_organizer IS 'Indique si ce lieu peut aussi être utilisé comme organisateur';


--
-- Name: COLUMN locations.facebook_page_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.facebook_page_id IS 'ID de la page Facebook (ex: "123456789") pour récupérer les événements via l''API Graph. Utilisé lorsque le lieu est aussi un organisateur (is_organizer = true)';


--
-- Name: COLUMN locations.website_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.website_url IS 'URL du site web du lieu (pour les lieux-organisateurs)';


--
-- Name: COLUMN locations.scraping_example_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.scraping_example_url IS 'URL d''exemple de page web à scraper (pour les lieux-organisateurs)';


--
-- Name: COLUMN locations.suggested; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.suggested IS 'Indique si le lieu est suggere (true) ou non (false). Maximum 6 lieux suggeres affiches dans la recherche.';


--
-- Name: COLUMN locations.tiktok_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.tiktok_url IS 'URL du profil TikTok du lieu (optionnel)';


--
-- Name: notification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    event_ids uuid[],
    sent_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE notification_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_logs IS 'Logs des notifications envoyées aux utilisateurs';


--
-- Name: COLUMN notification_logs.event_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_logs.event_ids IS 'Tableau des IDs des événements concernés par la notification';


--
-- Name: COLUMN notification_logs.sent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_logs.sent_at IS 'Date et heure d''envoi de la notification';


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_time time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);


--
-- Name: TABLE notification_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_settings IS 'Paramètres globaux des notifications (gérés par les admins)';


--
-- Name: COLUMN notification_settings.notification_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_settings.notification_time IS 'Heure à laquelle les notifications sont envoyées (format TIME)';


--
-- Name: organizer_ai_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizer_ai_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid,
    location_id uuid,
    field_name text NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ai_hint text,
    CONSTRAINT organizer_ai_fields_owner_check CHECK ((((organizer_id IS NOT NULL) AND (location_id IS NULL)) OR ((organizer_id IS NULL) AND (location_id IS NOT NULL))))
);


--
-- Name: COLUMN organizer_ai_fields.ai_hint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizer_ai_fields.ai_hint IS 'Indications spécifiques à donner à l''IA pour extraire ce champ (ex: "Le prix est toujours écrit en gras", "La date est au format DD/MM/YYYY")';


--
-- Name: organizer_scraping_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizer_scraping_configs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organizer_id uuid,
    event_field text NOT NULL,
    css_selector text NOT NULL,
    attribute text,
    transform_function text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    location_id uuid,
    text_prefix text,
    CONSTRAINT organizer_scraping_configs_exactly_one_organizer CHECK ((((organizer_id IS NOT NULL) AND (location_id IS NULL)) OR ((organizer_id IS NULL) AND (location_id IS NOT NULL))))
);


--
-- Name: TABLE organizer_scraping_configs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organizer_scraping_configs IS 'Configuration de scraping CSS pour chaque organisateur';


--
-- Name: COLUMN organizer_scraping_configs.organizer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizer_scraping_configs.organizer_id IS 'ID de l''organisateur (mutuellement exclusif avec location_id, peut être NULL pour les lieux-organisateurs)';


--
-- Name: COLUMN organizer_scraping_configs.event_field; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizer_scraping_configs.event_field IS 'Nom du champ d''événement (title, description, date, price, location, image_url, organizer, category, tags, capacity, door_opening_time, address)';


--
-- Name: COLUMN organizer_scraping_configs.css_selector; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizer_scraping_configs.css_selector IS 'Sélecteur CSS pour trouver l''élément sur la page';


--
-- Name: COLUMN organizer_scraping_configs.attribute; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizer_scraping_configs.attribute IS 'Attribut HTML à extraire (textContent par défaut, peut être href, src, data-*, etc.)';


--
-- Name: COLUMN organizer_scraping_configs.transform_function; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizer_scraping_configs.transform_function IS 'Fonction de transformation optionnelle (date, price, url, etc.)';


--
-- Name: COLUMN organizer_scraping_configs.location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizer_scraping_configs.location_id IS 'ID du lieu-organisateur (mutuellement exclusif avec organizer_id)';


--
-- Name: COLUMN organizer_scraping_configs.text_prefix; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizer_scraping_configs.text_prefix IS 'Texte à rechercher avant la valeur à extraire (ex: "prix :", "date :"). Si défini, la valeur sera extraite après ce texte dans le contenu de l''élément sélectionné.';


--
-- Name: organizers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    logo_url text,
    icon_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    instagram_url text,
    facebook_url text,
    short_description text,
    facebook_page_id text,
    website_url text,
    scraping_example_url text,
    tiktok_url text
);


--
-- Name: COLUMN organizers.instagram_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizers.instagram_url IS 'URL du profil Instagram de l''organisateur';


--
-- Name: COLUMN organizers.facebook_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizers.facebook_url IS 'URL du profil Facebook de l''organisateur';


--
-- Name: COLUMN organizers.facebook_page_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizers.facebook_page_id IS 'ID de la page Facebook (ex: "123456789") pour récupérer les événements via l''API Graph';


--
-- Name: COLUMN organizers.website_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizers.website_url IS 'URL du site web de l''organisateur pour le scraping automatique';


--
-- Name: COLUMN organizers.scraping_example_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizers.scraping_example_url IS 'URL d''exemple de page web à scraper pour cet organisateur. Les sélecteurs CSS configurés seront utilisés pour scraper cette page et les autres pages similaires.';


--
-- Name: COLUMN organizers.tiktok_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizers.tiktok_url IS 'URL du profil TikTok de l''organisateur (optionnel)';


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rooms (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    location_id uuid NOT NULL,
    name text NOT NULL,
    capacity integer,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE rooms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rooms IS 'Salles et scènes appartenant aux lieux';


--
-- Name: COLUMN rooms.location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rooms.location_id IS 'ID du lieu auquel appartient cette salle';


--
-- Name: COLUMN rooms.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rooms.name IS 'Nom de la salle ou scène (ex: "Grande salle", "Scène principale", etc.)';


--
-- Name: COLUMN rooms.capacity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rooms.capacity IS 'Capacité de la salle (optionnel)';


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_hidden_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_hidden_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE user_hidden_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_hidden_events IS 'Table pour gérer les événements masqués par utilisateur';


--
-- Name: COLUMN user_hidden_events.event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_hidden_events.event_id IS 'ID de l''événement masqué';


--
-- Name: COLUMN user_hidden_events.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_hidden_events.user_id IS 'ID de l''utilisateur qui a masqué l''événement';


--
-- Name: user_notification_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE user_notification_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_notification_categories IS 'Catégories d''événements pour lesquelles l''utilisateur souhaite recevoir des notifications';


--
-- Name: user_notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    frequency text DEFAULT 'daily'::text NOT NULL,
    is_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    category_ids text[],
    CONSTRAINT user_notification_preferences_frequency_check CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'never'::text])))
);


--
-- Name: TABLE user_notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_notification_preferences IS 'Préférences de notifications push pour chaque utilisateur';


--
-- Name: COLUMN user_notification_preferences.frequency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_notification_preferences.frequency IS 'Fréquence des notifications: daily (tous les jours), weekly (début de semaine), never (jamais)';


--
-- Name: COLUMN user_notification_preferences.is_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_notification_preferences.is_enabled IS 'Indique si les notifications sont activées pour cet utilisateur';


--
-- Name: COLUMN user_notification_preferences.category_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_notification_preferences.category_ids IS 'Tableau des IDs des catégories pour lesquelles l''utilisateur souhaite recevoir des notifications. Si NULL ou vide, toutes les catégories sont incluses.';


--
-- Name: user_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text NOT NULL,
    device_id text,
    app_version text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_push_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])))
);


--
-- Name: TABLE user_push_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_push_tokens IS 'Tokens de notifications push (FCM/APNs) pour chaque utilisateur et appareil';


--
-- Name: COLUMN user_push_tokens.platform; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_push_tokens.platform IS 'Plateforme: ios, android, ou web';


--
-- Name: COLUMN user_push_tokens.device_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_push_tokens.device_id IS 'Identifiant unique de l''appareil (optionnel)';


--
-- Name: user_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_requests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    requested_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pending'::text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    request_type text DEFAULT 'user_account'::text,
    event_data jsonb,
    requested_by uuid,
    location_id uuid,
    location_name text,
    source_url text,
    converted_event_id uuid,
    converted_at timestamp with time zone,
    CONSTRAINT user_requests_request_type_check CHECK ((request_type = ANY (ARRAY['event_creation'::text, 'event_from_url'::text]))),
    CONSTRAINT user_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'converted'::text])))
);


--
-- Name: COLUMN user_requests.request_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_requests.request_type IS 'Type de demande: event_creation (demande complète) ou event_from_url (demande depuis URL)';


--
-- Name: COLUMN user_requests.event_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_requests.event_data IS 'Données JSON de l''événement pour les demandes de type event_creation';


--
-- Name: COLUMN user_requests.requested_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_requests.requested_by IS 'ID de l''utilisateur qui fait la demande (pour les événements)';


--
-- Name: COLUMN user_requests.location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_requests.location_id IS 'ID du lieu (pour les demandes event_from_url)';


--
-- Name: COLUMN user_requests.location_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_requests.location_name IS 'Nom du lieu (pour les demandes event_from_url ou event_creation)';


--
-- Name: COLUMN user_requests.source_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_requests.source_url IS 'URL source de l''événement (pour les demandes event_from_url)';


--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: event_likes event_likes_event_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_likes
    ADD CONSTRAINT event_likes_event_id_user_id_key UNIQUE (event_id, user_id);


--
-- Name: event_likes event_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_likes
    ADD CONSTRAINT event_likes_pkey PRIMARY KEY (id);


--
-- Name: event_notifications event_notifications_event_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_notifications
    ADD CONSTRAINT event_notifications_event_id_user_id_key UNIQUE (event_id, user_id);


--
-- Name: event_notifications event_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_notifications
    ADD CONSTRAINT event_notifications_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: feedback_objects feedback_objects_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_objects
    ADD CONSTRAINT feedback_objects_name_key UNIQUE (name);


--
-- Name: feedback_objects feedback_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_objects
    ADD CONSTRAINT feedback_objects_pkey PRIMARY KEY (id);


--
-- Name: feedbacks feedbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedbacks
    ADD CONSTRAINT feedbacks_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: notification_logs notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_pkey PRIMARY KEY (id);


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- Name: organizer_ai_fields organizer_ai_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_ai_fields
    ADD CONSTRAINT organizer_ai_fields_pkey PRIMARY KEY (id);


--
-- Name: organizer_scraping_configs organizer_scraping_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_scraping_configs
    ADD CONSTRAINT organizer_scraping_configs_pkey PRIMARY KEY (id);


--
-- Name: organizers organizers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizers
    ADD CONSTRAINT organizers_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: tags tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: user_hidden_events user_hidden_events_event_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_events
    ADD CONSTRAINT user_hidden_events_event_id_user_id_key UNIQUE (event_id, user_id);


--
-- Name: user_hidden_events user_hidden_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_events
    ADD CONSTRAINT user_hidden_events_pkey PRIMARY KEY (id);


--
-- Name: user_notification_categories user_notification_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_categories
    ADD CONSTRAINT user_notification_categories_pkey PRIMARY KEY (id);


--
-- Name: user_notification_categories user_notification_categories_user_id_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_categories
    ADD CONSTRAINT user_notification_categories_user_id_category_id_key UNIQUE (user_id, category_id);


--
-- Name: user_notification_preferences user_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_notification_preferences user_notification_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_user_id_key UNIQUE (user_id);


--
-- Name: user_push_tokens user_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_push_tokens user_push_tokens_user_id_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_user_id_token_key UNIQUE (user_id, token);


--
-- Name: user_requests user_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_pkey PRIMARY KEY (id);


--
-- Name: event_organizers_unique_event_location; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_organizers_unique_event_location ON public.event_organizers USING btree (event_id, location_id) WHERE (location_id IS NOT NULL);


--
-- Name: event_organizers_unique_event_organizer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_organizers_unique_event_organizer ON public.event_organizers USING btree (event_id, organizer_id) WHERE (organizer_id IS NOT NULL);


--
-- Name: idx_categories_active_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_active_order ON public.categories USING btree (is_active, display_order) WHERE (is_active = true);


--
-- Name: INDEX idx_categories_active_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_categories_active_order IS 'Optimise les requetes de categories actives triees';


--
-- Name: idx_categories_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_display_order ON public.categories USING btree (display_order);


--
-- Name: idx_categories_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_is_active ON public.categories USING btree (is_active);


--
-- Name: idx_categories_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_name ON public.categories USING btree (name);


--
-- Name: idx_event_likes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_likes_created_at ON public.event_likes USING btree (created_at DESC);


--
-- Name: idx_event_likes_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_likes_event_id ON public.event_likes USING btree (event_id);


--
-- Name: idx_event_likes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_likes_user_id ON public.event_likes USING btree (user_id);


--
-- Name: idx_event_notifications_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notifications_event_id ON public.event_notifications USING btree (event_id);


--
-- Name: idx_event_notifications_is_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notifications_is_enabled ON public.event_notifications USING btree (is_enabled);


--
-- Name: idx_event_notifications_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notifications_scheduled_at ON public.event_notifications USING btree (notification_scheduled_at) WHERE (notification_scheduled_at IS NOT NULL);


--
-- Name: idx_event_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notifications_user_id ON public.event_notifications USING btree (user_id);


--
-- Name: idx_event_organizers_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_organizers_event ON public.event_organizers USING btree (event_id);


--
-- Name: idx_event_organizers_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_organizers_location ON public.event_organizers USING btree (location_id) WHERE (location_id IS NOT NULL);


--
-- Name: idx_event_organizers_organizer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_organizers_organizer ON public.event_organizers USING btree (organizer_id);


--
-- Name: idx_events_archived_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_archived_status ON public.events USING btree (archived, status) WHERE ((archived = false) AND (status = 'approved'::text));


--
-- Name: idx_events_archived_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_archived_status_date ON public.events USING btree (archived, status, date) WHERE ((archived = false) AND (status = 'approved'::text));


--
-- Name: idx_events_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_category ON public.events USING btree (category);


--
-- Name: idx_events_category_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_category_status ON public.events USING btree (category, status) WHERE (status = 'approved'::text);


--
-- Name: INDEX idx_events_category_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_events_category_status IS 'Optimise les filtres par categorie';


--
-- Name: idx_events_coordinates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_coordinates ON public.events USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));


--
-- Name: idx_events_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_created_by ON public.events USING btree (created_by);


--
-- Name: idx_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_date ON public.events USING btree (date);


--
-- Name: idx_events_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_end_date ON public.events USING btree (end_date) WHERE (end_date IS NOT NULL);


--
-- Name: idx_events_facebook; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_facebook ON public.events USING btree (facebook_url) WHERE (facebook_url IS NOT NULL);


--
-- Name: idx_events_instagram; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_instagram ON public.events USING btree (instagram_url) WHERE (instagram_url IS NOT NULL);


--
-- Name: idx_events_is_full; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_is_full ON public.events USING btree (is_full) WHERE (is_full = false);


--
-- Name: idx_events_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_location ON public.events USING btree (location_id);


--
-- Name: idx_events_location_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_location_status ON public.events USING btree (location_id, status) WHERE (status = 'approved'::text);


--
-- Name: INDEX idx_events_location_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_events_location_status IS 'Optimise les filtres par lieu';


--
-- Name: idx_events_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_room ON public.events USING btree (room_id);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_events_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status_date ON public.events USING btree (status, date) WHERE (status = 'approved'::text);


--
-- Name: INDEX idx_events_status_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_events_status_date IS 'Optimise les requetes devenements approuves tries par date';


--
-- Name: idx_events_status_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status_end_date ON public.events USING btree (status, end_date) WHERE ((status = 'approved'::text) AND (end_date IS NOT NULL));


--
-- Name: INDEX idx_events_status_end_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_events_status_end_date IS 'Optimise les requetes devenements en cours (multi-jours)';


--
-- Name: idx_events_status_is_full_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status_is_full_date ON public.events USING btree (status, is_full, date) WHERE ((status = 'approved'::text) AND (is_full = false));


--
-- Name: idx_feedback_objects_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_objects_is_active ON public.feedback_objects USING btree (is_active);


--
-- Name: idx_feedbacks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedbacks_created_at ON public.feedbacks USING btree (created_at DESC);


--
-- Name: idx_feedbacks_feedback_object_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedbacks_feedback_object_id ON public.feedbacks USING btree (feedback_object_id);


--
-- Name: idx_feedbacks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedbacks_status ON public.feedbacks USING btree (status);


--
-- Name: idx_feedbacks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedbacks_user_id ON public.feedbacks USING btree (user_id);


--
-- Name: idx_locations_coordinates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_coordinates ON public.locations USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));


--
-- Name: idx_locations_facebook_page_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_facebook_page_id ON public.locations USING btree (facebook_page_id) WHERE (facebook_page_id IS NOT NULL);


--
-- Name: idx_locations_is_organizer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_is_organizer ON public.locations USING btree (is_organizer) WHERE (is_organizer = true);


--
-- Name: idx_locations_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_name ON public.locations USING btree (name);


--
-- Name: idx_locations_scraping_example_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_scraping_example_url ON public.locations USING btree (scraping_example_url) WHERE (scraping_example_url IS NOT NULL);


--
-- Name: idx_locations_suggested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_suggested ON public.locations USING btree (suggested) WHERE (suggested = true);


--
-- Name: idx_locations_website_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_website_url ON public.locations USING btree (website_url) WHERE (website_url IS NOT NULL);


--
-- Name: idx_notification_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_created_at ON public.notification_logs USING btree (created_at DESC);


--
-- Name: idx_notification_logs_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_sent_at ON public.notification_logs USING btree (sent_at DESC);


--
-- Name: idx_notification_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_user_id ON public.notification_logs USING btree (user_id);


--
-- Name: idx_notification_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_preferences_user_id ON public.user_notification_preferences USING btree (user_id);


--
-- Name: idx_organizer_ai_fields_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_ai_fields_location_id ON public.organizer_ai_fields USING btree (location_id) WHERE (location_id IS NOT NULL);


--
-- Name: idx_organizer_ai_fields_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_ai_fields_organizer_id ON public.organizer_ai_fields USING btree (organizer_id) WHERE (organizer_id IS NOT NULL);


--
-- Name: idx_organizer_ai_fields_unique_location; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_organizer_ai_fields_unique_location ON public.organizer_ai_fields USING btree (location_id, field_name) WHERE (location_id IS NOT NULL);


--
-- Name: idx_organizer_ai_fields_unique_organizer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_organizer_ai_fields_unique_organizer ON public.organizer_ai_fields USING btree (organizer_id, field_name) WHERE (organizer_id IS NOT NULL);


--
-- Name: idx_organizer_scraping_configs_field; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_scraping_configs_field ON public.organizer_scraping_configs USING btree (event_field);


--
-- Name: idx_organizer_scraping_configs_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_scraping_configs_location ON public.organizer_scraping_configs USING btree (location_id);


--
-- Name: idx_organizer_scraping_configs_organizer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_scraping_configs_organizer ON public.organizer_scraping_configs USING btree (organizer_id);


--
-- Name: idx_organizer_scraping_configs_text_prefix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_scraping_configs_text_prefix ON public.organizer_scraping_configs USING btree (text_prefix) WHERE (text_prefix IS NOT NULL);


--
-- Name: idx_organizers_facebook; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizers_facebook ON public.organizers USING btree (facebook_url) WHERE (facebook_url IS NOT NULL);


--
-- Name: idx_organizers_facebook_page_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizers_facebook_page_id ON public.organizers USING btree (facebook_page_id) WHERE (facebook_page_id IS NOT NULL);


--
-- Name: idx_organizers_instagram; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizers_instagram ON public.organizers USING btree (instagram_url) WHERE (instagram_url IS NOT NULL);


--
-- Name: idx_organizers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizers_name ON public.organizers USING btree (name);


--
-- Name: idx_organizers_scraping_example_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizers_scraping_example_url ON public.organizers USING btree (scraping_example_url) WHERE (scraping_example_url IS NOT NULL);


--
-- Name: idx_organizers_website_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizers_website_url ON public.organizers USING btree (website_url) WHERE (website_url IS NOT NULL);


--
-- Name: idx_push_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_tokens_user_id ON public.user_push_tokens USING btree (user_id);


--
-- Name: idx_rooms_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rooms_location ON public.rooms USING btree (location_id);


--
-- Name: idx_rooms_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rooms_name ON public.rooms USING btree (name);


--
-- Name: idx_tags_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_name ON public.tags USING btree (name);


--
-- Name: idx_user_hidden_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_hidden_events_created_at ON public.user_hidden_events USING btree (created_at DESC);


--
-- Name: idx_user_hidden_events_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_hidden_events_event_id ON public.user_hidden_events USING btree (event_id);


--
-- Name: idx_user_hidden_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_hidden_events_user_id ON public.user_hidden_events USING btree (user_id);


--
-- Name: idx_user_notification_categories_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notification_categories_category_id ON public.user_notification_categories USING btree (category_id);


--
-- Name: idx_user_notification_categories_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notification_categories_user_id ON public.user_notification_categories USING btree (user_id);


--
-- Name: idx_user_notification_preferences_category_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notification_preferences_category_ids ON public.user_notification_preferences USING gin (category_ids);


--
-- Name: idx_user_notification_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notification_preferences_user_id ON public.user_notification_preferences USING btree (user_id);


--
-- Name: idx_user_push_tokens_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_push_tokens_platform ON public.user_push_tokens USING btree (platform);


--
-- Name: idx_user_push_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_push_tokens_token ON public.user_push_tokens USING btree (token);


--
-- Name: idx_user_push_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_push_tokens_user_id ON public.user_push_tokens USING btree (user_id);


--
-- Name: idx_user_requests_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_requests_event_type ON public.user_requests USING btree (request_type) WHERE (request_type = 'event_creation'::text);


--
-- Name: idx_user_requests_from_url_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_requests_from_url_type ON public.user_requests USING btree (request_type) WHERE (request_type = 'event_from_url'::text);


--
-- Name: idx_user_requests_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_requests_location_id ON public.user_requests USING btree (location_id) WHERE (location_id IS NOT NULL);


--
-- Name: idx_user_requests_request_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_requests_request_type ON public.user_requests USING btree (request_type);


--
-- Name: idx_user_requests_requested_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_requests_requested_at ON public.user_requests USING btree (requested_at DESC);


--
-- Name: idx_user_requests_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_requests_requested_by ON public.user_requests USING btree (requested_by) WHERE (requested_by IS NOT NULL);


--
-- Name: idx_user_requests_source_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_requests_source_url ON public.user_requests USING btree (source_url) WHERE (source_url IS NOT NULL);


--
-- Name: idx_user_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_requests_status ON public.user_requests USING btree (status);


--
-- Name: organizer_scraping_configs_location_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizer_scraping_configs_location_unique ON public.organizer_scraping_configs USING btree (location_id, event_field) WHERE (location_id IS NOT NULL);


--
-- Name: organizer_scraping_configs_organizer_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizer_scraping_configs_organizer_unique ON public.organizer_scraping_configs USING btree (organizer_id, event_field) WHERE (organizer_id IS NOT NULL);


--
-- Name: organizer_ai_fields organizer_ai_fields_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organizer_ai_fields_updated_at BEFORE UPDATE ON public.organizer_ai_fields FOR EACH ROW EXECUTE FUNCTION public.update_organizer_ai_fields_updated_at();


--
-- Name: categories update_categories_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_categories_updated_at_trigger BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_categories_updated_at();


--
-- Name: event_notifications update_event_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_event_notifications_updated_at BEFORE UPDATE ON public.event_notifications FOR EACH ROW EXECUTE FUNCTION public.update_notification_preferences_updated_at();


--
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: feedback_objects update_feedback_objects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_feedback_objects_updated_at BEFORE UPDATE ON public.feedback_objects FOR EACH ROW EXECUTE FUNCTION public.update_feedback_updated_at();


--
-- Name: feedbacks update_feedbacks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_feedbacks_updated_at BEFORE UPDATE ON public.feedbacks FOR EACH ROW EXECUTE FUNCTION public.update_feedback_updated_at();


--
-- Name: locations update_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_settings update_notification_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_notification_settings_updated_at BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_notification_preferences_updated_at();


--
-- Name: organizer_scraping_configs update_organizer_scraping_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_organizer_scraping_configs_updated_at BEFORE UPDATE ON public.organizer_scraping_configs FOR EACH ROW EXECUTE FUNCTION public.update_organizer_scraping_configs_updated_at();


--
-- Name: organizers update_organizers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_organizers_updated_at BEFORE UPDATE ON public.organizers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rooms update_rooms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_notification_preferences update_user_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_notification_preferences_updated_at BEFORE UPDATE ON public.user_notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_notification_preferences_updated_at();


--
-- Name: user_push_tokens update_user_push_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_push_tokens_updated_at BEFORE UPDATE ON public.user_push_tokens FOR EACH ROW EXECUTE FUNCTION public.update_notification_preferences_updated_at();


--
-- Name: user_requests update_user_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_requests_updated_at BEFORE UPDATE ON public.user_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: categories categories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_likes event_likes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_likes
    ADD CONSTRAINT event_likes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_likes event_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_likes
    ADD CONSTRAINT event_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_notifications event_notifications_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_notifications
    ADD CONSTRAINT event_notifications_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_notifications event_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_notifications
    ADD CONSTRAINT event_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_organizers event_organizers_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_organizers
    ADD CONSTRAINT event_organizers_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_organizers event_organizers_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_organizers
    ADD CONSTRAINT event_organizers_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: event_organizers event_organizers_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_organizers
    ADD CONSTRAINT event_organizers_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: events events_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: events events_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;


--
-- Name: feedbacks feedbacks_feedback_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedbacks
    ADD CONSTRAINT feedbacks_feedback_object_id_fkey FOREIGN KEY (feedback_object_id) REFERENCES public.feedback_objects(id) ON DELETE RESTRICT;


--
-- Name: feedbacks feedbacks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedbacks
    ADD CONSTRAINT feedbacks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notification_logs notification_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notification_settings notification_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: organizer_ai_fields organizer_ai_fields_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_ai_fields
    ADD CONSTRAINT organizer_ai_fields_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: organizer_ai_fields organizer_ai_fields_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_ai_fields
    ADD CONSTRAINT organizer_ai_fields_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: organizer_scraping_configs organizer_scraping_configs_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_scraping_configs
    ADD CONSTRAINT organizer_scraping_configs_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: organizer_scraping_configs organizer_scraping_configs_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_scraping_configs
    ADD CONSTRAINT organizer_scraping_configs_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: rooms rooms_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: user_hidden_events user_hidden_events_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_events
    ADD CONSTRAINT user_hidden_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: user_hidden_events user_hidden_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_events
    ADD CONSTRAINT user_hidden_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_notification_categories user_notification_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_categories
    ADD CONSTRAINT user_notification_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: user_notification_categories user_notification_categories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_categories
    ADD CONSTRAINT user_notification_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_notification_preferences user_notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_push_tokens user_push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_requests user_requests_converted_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_converted_event_id_fkey FOREIGN KEY (converted_event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: user_requests user_requests_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: user_requests user_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_requests user_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: categories Admins can create categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create categories" ON public.categories FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: events Admins can create events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create events" ON public.events FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: events Admins can delete all events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete all events" ON public.events FOR DELETE USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: categories Admins can delete categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete categories" ON public.categories FOR DELETE USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: feedbacks Admins can manage all feedbacks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all feedbacks" ON public.feedbacks USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: feedback_objects Admins can manage feedback objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage feedback objects" ON public.feedback_objects USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: events Admins can update all events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all events" ON public.events FOR UPDATE USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: categories Admins can update categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: notification_settings Admins can update notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update notification settings" ON public.notification_settings FOR UPDATE USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: categories Admins can view all categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all categories" ON public.categories FOR SELECT USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: events Admins can view all events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all events" ON public.events FOR SELECT USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: user_notification_categories Admins can view all notification categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all notification categories" ON public.user_notification_categories FOR SELECT USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: notification_logs Admins can view all notification logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all notification logs" ON public.notification_logs FOR SELECT USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: user_notification_preferences Admins can view all notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all notification preferences" ON public.user_notification_preferences FOR SELECT USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: user_push_tokens Admins can view all push tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all push tokens" ON public.user_push_tokens FOR SELECT USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: categories Anyone can view active categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active categories" ON public.categories FOR SELECT USING ((is_active = true));


--
-- Name: feedback_objects Anyone can view active feedback objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active feedback objects" ON public.feedback_objects FOR SELECT USING ((is_active = true));


--
-- Name: notification_settings Anyone can view notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view notification settings" ON public.notification_settings FOR SELECT USING (true);


--
-- Name: events Approved events are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved events are viewable by everyone" ON public.events FOR SELECT USING ((status = 'approved'::text));


--
-- Name: user_requests Authenticated admins can delete user requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated admins can delete user requests" ON public.user_requests FOR DELETE USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: user_requests Authenticated admins can insert user requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated admins can insert user requests" ON public.user_requests FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: organizer_scraping_configs Authenticated admins can manage scraping configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated admins can manage scraping configs" ON public.organizer_scraping_configs USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: user_requests Authenticated admins can update user requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated admins can update user requests" ON public.user_requests FOR UPDATE USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: user_requests Authenticated admins can view user requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated admins can view user requests" ON public.user_requests FOR SELECT USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: user_requests Authenticated users can create event from url requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create event from url requests" ON public.user_requests FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (request_type = 'event_from_url'::text) AND (requested_by = auth.uid())));


--
-- Name: user_requests Authenticated users can create event requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create event requests" ON public.user_requests FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (request_type = 'event_creation'::text) AND (requested_by = auth.uid())));


--
-- Name: events Authenticated users can create events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create events" ON public.events FOR INSERT WITH CHECK ((auth.uid() = created_by));


--
-- Name: feedbacks Authenticated users can create feedbacks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create feedbacks" ON public.feedbacks FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)));


--
-- Name: event_organizers Authenticated users can manage event organizers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage event organizers" ON public.event_organizers USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: locations Authenticated users can manage locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage locations" ON public.locations USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: organizers Authenticated users can manage organizers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage organizers" ON public.organizers USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: organizer_ai_fields Les administrateurs peuvent gérer les champs IA des organisate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Les administrateurs peuvent gérer les champs IA des organisate" ON public.organizer_ai_fields USING (public.is_user_admin());


--
-- Name: locations Locations are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Locations are viewable by everyone" ON public.locations FOR SELECT USING (true);


--
-- Name: tags Only admins can delete tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete tags" ON public.tags FOR DELETE USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: tags Only admins can insert tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can insert tags" ON public.tags FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: rooms Only admins can manage rooms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can manage rooms" ON public.rooms USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: tags Only admins can update tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update tags" ON public.tags FOR UPDATE USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));


--
-- Name: organizers Organizers are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers are viewable by everyone" ON public.organizers FOR SELECT USING (true);


--
-- Name: rooms Rooms are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Rooms are viewable by everyone" ON public.rooms FOR SELECT USING (true);


--
-- Name: organizer_scraping_configs Scraping configs are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Scraping configs are viewable by everyone" ON public.organizer_scraping_configs FOR SELECT USING (true);


--
-- Name: tags Tags are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tags are viewable by everyone" ON public.tags FOR SELECT USING (true);


--
-- Name: event_likes Users can create their own event likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own event likes" ON public.event_likes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_notifications Users can create their own event notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own event notifications" ON public.event_notifications FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_hidden_events Users can create their own hidden events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own hidden events" ON public.user_hidden_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_likes Users can delete their own event likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own event likes" ON public.event_likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: event_notifications Users can delete their own event notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own event notifications" ON public.event_notifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_hidden_events Users can delete their own hidden events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own hidden events" ON public.user_hidden_events FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_notification_categories Users can delete their own notification categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own notification categories" ON public.user_notification_categories FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_notification_preferences Users can delete their own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own notification preferences" ON public.user_notification_preferences FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_requests Users can delete their own pending event requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own pending event requests" ON public.user_requests FOR DELETE USING ((((request_type = 'event_creation'::text) OR (request_type = 'event_from_url'::text)) AND (requested_by = auth.uid()) AND (status = 'pending'::text)));


--
-- Name: events Users can delete their own pending events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own pending events" ON public.events FOR DELETE USING (((auth.uid() = created_by) AND (status = 'pending'::text)));


--
-- Name: user_push_tokens Users can delete their own push tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own push tokens" ON public.user_push_tokens FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_notification_categories Users can insert their own notification categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own notification categories" ON public.user_notification_categories FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_notification_preferences Users can insert their own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own notification preferences" ON public.user_notification_preferences FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_push_tokens Users can insert their own push tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own push tokens" ON public.user_push_tokens FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_requests Users can manage their own pending event requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own pending event requests" ON public.user_requests FOR UPDATE USING ((((request_type = 'event_creation'::text) OR (request_type = 'event_from_url'::text)) AND (requested_by = auth.uid()) AND (status = 'pending'::text))) WITH CHECK ((((request_type = 'event_creation'::text) OR (request_type = 'event_from_url'::text)) AND (requested_by = auth.uid()) AND (status = 'pending'::text)));


--
-- Name: event_notifications Users can update their own event notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own event notifications" ON public.event_notifications FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_notification_preferences Users can update their own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notification preferences" ON public.user_notification_preferences FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: events Users can update their own pending events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own pending events" ON public.events FOR UPDATE USING (((auth.uid() = created_by) AND (status = 'pending'::text))) WITH CHECK (((auth.uid() = created_by) AND (status = 'pending'::text)));


--
-- Name: feedbacks Users can update their own pending feedbacks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own pending feedbacks" ON public.feedbacks FOR UPDATE USING (((auth.uid() = user_id) AND (status = 'pending'::text))) WITH CHECK (((auth.uid() = user_id) AND (status = 'pending'::text)));


--
-- Name: user_push_tokens Users can update their own push tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own push tokens" ON public.user_push_tokens FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_likes Users can view all event likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all event likes" ON public.event_likes FOR SELECT USING (true);


--
-- Name: event_notifications Users can view their own event notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own event notifications" ON public.event_notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_requests Users can view their own event requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own event requests" ON public.user_requests FOR SELECT USING (((((request_type = 'event_creation'::text) OR (request_type = 'event_from_url'::text)) AND (requested_by = auth.uid())) OR ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))));


--
-- Name: events Users can view their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own events" ON public.events FOR SELECT USING ((auth.uid() = created_by));


--
-- Name: feedbacks Users can view their own feedbacks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own feedbacks" ON public.feedbacks FOR SELECT USING (((auth.uid() = user_id) OR (public.is_user_admin() = true)));


--
-- Name: user_hidden_events Users can view their own hidden events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own hidden events" ON public.user_hidden_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_notification_categories Users can view their own notification categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notification categories" ON public.user_notification_categories FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notification_logs Users can view their own notification logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notification logs" ON public.notification_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_notification_preferences Users can view their own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notification preferences" ON public.user_notification_preferences FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_push_tokens Users can view their own push tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own push tokens" ON public.user_push_tokens FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: event_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: event_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: event_organizers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_organizers ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: feedbacks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: organizer_ai_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizer_ai_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: organizer_scraping_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizer_scraping_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: organizers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: user_hidden_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_hidden_events ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notification_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notification_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: user_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_requests ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict dbBvoNyVPCGg7l1MttK6fxfWLof0q8xVhzISN1j5F3QMWNeB1a71xPFy9Cik6fL

