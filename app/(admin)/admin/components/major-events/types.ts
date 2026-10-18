import type { Tables } from "@/lib/supabase/database.types";

export type MajorEventStatus = "draft" | "pending" | "approved" | "archived";

// status est un text + CHECK en base : restreint ici à l'union des statuts.
export type AdminMajorEvent = Omit<Tables<"major_events">, "status"> & {
  status: MajorEventStatus;
  events_count?: number;
  locations_count?: number;
  organizers_count?: number;
};

export type MajorEventFormData = {
  title: string;
  slug: string;
  short_description: string;
  long_description: string;
  hero_image_url: string;
  logo_url: string;
  start_at: string;
  end_at: string;
  timezone: string;
  city_name: string;
  primary_category: string;
  status: MajorEventStatus;
  is_featured: boolean;
  map_center_latitude: string;
  map_center_longitude: string;
  default_map_zoom: string;
  ticketing_url: string;
  official_url: string;
};
