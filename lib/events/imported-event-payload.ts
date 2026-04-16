export type ImportedEventPayload = {
  title?: string;
  description?: string;
  date?: string;
  end_date?: string;
  category?: string;
  is_pay_what_you_want?: boolean;
  price?: string | number;
  price_min?: string | number;
  price_max?: string | number;
  capacity?: string | number;
  door_opening_time?: string;
  external_url?: string;
  external_url_label?: string;
  scraping_url?: string;
  image_url?: string;
  is_full?: boolean;
  location?: string;
  location_id?: string;
  location_organizer_id?: string;
  address?: string;
  organizer?: string;
  organizer_id?: string;
  instagram_url?: string;
  facebook_url?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ImportedEventWarning = {
  field: string;
  message: string;
  value?: string;
};

export type ImportedEventAnalysisResult = {
  data: ImportedEventPayload;
  metadata?: Record<string, unknown>;
  warnings?: ImportedEventWarning[];
};

export const IMPORTED_EVENT_FIELD_LABELS: Partial<
  Record<keyof ImportedEventPayload, string>
> = {
  title: "Titre",
  description: "Description",
  date: "Date de début",
  end_date: "Date de fin",
  category: "Catégorie",
  is_pay_what_you_want: "Prix libre",
  price: "Prix",
  price_min: "Prix min",
  price_max: "Prix max",
  capacity: "Capacité",
  door_opening_time: "Ouverture des portes",
  external_url: "URL externe",
  external_url_label: "Label URL",
  scraping_url: "URL scraping",
  image_url: "Image",
  is_full: "Complet",
  location: "Lieu",
  location_id: "Lieu",
  address: "Adresse",
  organizer: "Organisateur",
  organizer_id: "Organisateur",
  location_organizer_id: "Organisateur du lieu",
  instagram_url: "Instagram",
  facebook_url: "Facebook",
  tags: "Tags",
};
