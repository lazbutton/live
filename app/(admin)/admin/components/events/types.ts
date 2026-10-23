import type { Tables } from "@/lib/supabase/database.types";

export type EventStatus = "pending" | "approved" | "rejected";

/** Colonnes de `events` reprises telles quelles du type généré. */
type AdminEventColumns = Pick<
  Tables<"events">,
  | "id"
  | "title"
  | "description"
  | "date"
  | "end_date"
  | "end_time"
  | "category"
  | "price"
  | "price_min"
  | "price_max"
  | "is_pay_what_you_want"
  | "address"
  | "latitude"
  | "longitude"
  | "capacity"
  | "is_full"
  | "location_id"
  | "room_id"
  | "door_opening_time"
  | "external_url"
  | "external_url_label"
  | "instagram_url"
  | "facebook_url"
  | "scraping_url"
  | "image_url"
>;

// Le reste dépend des requêtes (colonnes pas toujours lues, relations jointes) ;
// status est un text + CHECK en base, restreint ici aux statuts de l'admin.
export type AdminEvent = AdminEventColumns & {
  status: EventStatus;
  is_featured?: boolean | null;
  hide_from_home?: boolean | null;
  show_on_app?: boolean | null;
  is_young_audience?: boolean | null;
  agenda_types?: string[] | null;
  tag_ids?: string[];
  archived?: boolean;
  created_at?: string;
  /** Le festival dont l'événement fait partie (`events.festival_id`). */
  festival_id?: string | null;

  location?: { id: string; name: string } | null;
  event_organizers?: Array<{
    organizer?: { id: string; name: string } | null;
    location?: { id: string; name: string } | null;
  }>;
  event_artists?: Array<{
    artist?: {
      id: string;
      name: string;
      slug: string;
      image_url?: string | null;
      origin_city?: string | null;
    } | null;
    role_label?: string | null;
    sort_index?: number | null;
  }>;
  // Relation 1-1 (event_id unique dans major_event_events) : PostgREST renvoie un objet ou null.
  major_event_events?: {
    major_event_id: string;
    major_event?: { id: string; title: string; slug: string } | null;
  } | null;
};

export type LocationData = {
  id: string;
  name: string;
  address: string | null;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
  city_id?: string | null;
  city?: {
    id: string;
    label: string;
  } | null;
};

export type OrganizerOption = {
  id: string;
  name: string;
  instagram_url: string | null;
  facebook_url: string | null;
  type: "organizer" | "location";
};

export type ArtistOption = Pick<Tables<"artists">, "id" | "name" | "slug" | "image_url"> & {
  origin_city?: string | null;
};

export type TagOption = Pick<Tables<"tags">, "id" | "name">;
export type CategoryOption = Pick<Tables<"categories">, "id" | "name">;
export type RoomOption = Pick<Tables<"rooms">, "id" | "name">;

export type EventFormData = {
  title: string;
  description: string;
  date: string; // datetime-local: YYYY-MM-DDTHH:mm
  end_date: string; // datetime-local ou ""
  category: string;
  price_min: string;
  price_max: string;
  is_pay_what_you_want: boolean;
  capacity: string;
  is_full: boolean;
  location_id: string;
  room_id: string;
  door_opening_time: string;
  external_url: string;
  external_url_label: string;
  instagram_url: string;
  facebook_url: string;
  scraping_url: string;
  image_url: string;
  status: EventStatus;
  is_featured: boolean;
  hide_from_home: boolean;
  show_on_app: boolean;
  is_young_audience: boolean;
  agenda_types: string[];
  major_event_id: string;
  /** « Fait partie du festival » : l'id du festival, ou "". */
  festival_id: string;
};

export type EventFormPrefill = Partial<{
  form: Partial<EventFormData>;
  organizerIds: string[];
  artistIds: string[];
  tagIds: string[];
  /**
   * Autres séances (format datetime-local) : un événement par date à l'enregistrement, avec le lien de
   * billetterie de la séance quand la page en donne un par séance.
   */
  additionalDates: Array<{ date: string; end_date?: string; external_url?: string }>;
}>;
