export type EventStatus = "pending" | "approved" | "rejected";

export type AdminEvent = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  end_time: string | null;
  status: EventStatus;
  category: string;
  price: number | null;
  presale_price: number | null;
  subscriber_price: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  is_full: boolean | null;
  location_id: string | null;
  room_id: string | null;
  door_opening_time: string | null;
  external_url: string | null;
  external_url_label: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  scraping_url: string | null;
  image_url: string | null;
  tag_ids?: string[];
  archived?: boolean;
  created_at?: string;

  location?: { id: string; name: string } | null;
  event_organizers?: Array<{
    organizer?: { id: string; name: string } | null;
    location?: { id: string; name: string } | null;
  }>;
};

export type LocationData = {
  id: string;
  name: string;
  address: string | null;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type OrganizerOption = {
  id: string;
  name: string;
  instagram_url: string | null;
  facebook_url: string | null;
  type: "organizer" | "location";
};

export type TagOption = { id: string; name: string };
export type CategoryOption = { id: string; name: string };
export type RoomOption = { id: string; name: string };

export type EventFormData = {
  title: string;
  description: string;
  date: string; // datetime-local: YYYY-MM-DDTHH:mm
  end_date: string; // datetime-local ou ""
  category: string;
  price: string;
  presale_price: string;
  subscriber_price: string;
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
};

