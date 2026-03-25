import { cache } from "react";

import { formatDateWithoutTimezone } from "@/lib/date-utils";
import {
  buildArtistPath,
  buildEntityReference,
  buildEventPath,
  buildHubPath,
  buildLocationPath,
  buildOrganizerPath,
  extractEntityId,
} from "@/lib/mobile-app-links";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Nullable<T> = T | null | undefined;

type SingleOrArray<T> = T | T[] | null;

type CategoryRow = {
  id: string;
  name: string;
};

type RawCityRow =
  | {
      label?: string | null;
    }
  | null;

type RawLocationRelation =
  | {
      id?: string | null;
      name?: string | null;
      address?: string | null;
      image_url?: string | null;
      city?: SingleOrArray<RawCityRow>;
      is_organizer?: boolean | null;
    }
  | null;

type RawArtistRelation =
  | {
      id?: string | null;
      name?: string | null;
      slug?: string | null;
      image_url?: string | null;
      artist_type_label?: string | null;
      origin_city?: string | null;
    }
  | null;

type RawOrganizerRelation =
  | {
      id?: string | null;
      name?: string | null;
      logo_url?: string | null;
      icon_url?: string | null;
    }
  | null;

type RawEventRow = {
  id: string;
  title: string | null;
  description: string | null;
  date: string;
  end_date: string | null;
  category: string | null;
  image_url: string | null;
  external_url: string | null;
  external_url_label: string | null;
  is_full: boolean | null;
  price: number | string | null;
  presale_price: number | string | null;
  subscriber_price: number | string | null;
  location: SingleOrArray<RawLocationRelation>;
};

type RawEventArtistRow = {
  sort_index?: number | null;
  role_label?: string | null;
  artist?: SingleOrArray<RawArtistRelation>;
};

type RawEventOrganizerRow = {
  sort_index?: number | null;
  organizer?: SingleOrArray<RawOrganizerRelation>;
  location?: SingleOrArray<RawLocationRelation>;
};

type RawMajorEventRelation =
  | {
      id?: string | null;
      slug?: string | null;
      title?: string | null;
      short_description?: string | null;
      hero_image_url?: string | null;
      start_at?: string | null;
      end_at?: string | null;
      city_name?: string | null;
      status?: string | null;
    }
  | null;

type RawEventHubLinkRow = {
  major_event?: SingleOrArray<RawMajorEventRelation>;
};

type RawLocationRow = {
  id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  short_description: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  is_organizer: boolean | null;
  city: SingleOrArray<RawCityRow>;
};

type RawOrganizerRow = {
  id: string;
  name: string;
  logo_url: string | null;
  icon_url: string | null;
  short_description: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
};

type RawMajorEventRow = {
  id: string;
  slug: string;
  title: string | null;
  short_description: string | null;
  long_description: string | null;
  hero_image_url: string | null;
  logo_url: string | null;
  start_at: string;
  end_at: string;
  city_name: string | null;
  ticketing_url: string | null;
  official_url: string | null;
  major_event_events:
    | Array<{
        sort_index?: number | null;
        program_label_override?: string | null;
        event?: SingleOrArray<RawEventRow>;
      }>
    | null;
  major_event_locations:
    | Array<{
        sort_index?: number | null;
        label_override?: string | null;
        location?: SingleOrArray<RawLocationRelation>;
      }>
    | null;
  major_event_organizers:
    | Array<{
        sort_index?: number | null;
        role_label?: string | null;
        organizer?: SingleOrArray<RawOrganizerRelation>;
        location?: SingleOrArray<RawLocationRelation>;
      }>
    | null;
};

export type PublicLinkItem = {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
  imageUrl: string | null;
};

export type PublicEventListItem = {
  id: string;
  title: string;
  href: string;
  dateLabel: string;
  locationLabel: string | null;
  categoryLabel: string | null;
  imageUrl: string | null;
};

export type EventSharePageData = {
  id: string;
  sharePath: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  dateLabel: string;
  locationLabel: string | null;
  categoryLabel: string | null;
  priceLabel: string | null;
  ticketUrl: string | null;
  ticketLabel: string | null;
  locationLink: PublicLinkItem | null;
  artists: PublicLinkItem[];
  organizers: PublicLinkItem[];
  hub: PublicLinkItem | null;
};

export type LocationSharePageData = {
  id: string;
  reference: string;
  sharePath: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  address: string | null;
  cityLabel: string | null;
  isOrganizer: boolean;
  websiteUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  upcomingEvents: PublicEventListItem[];
  hubs: PublicLinkItem[];
};

export type OrganizerSharePageData = {
  id: string;
  reference: string;
  sharePath: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  upcomingEvents: PublicEventListItem[];
  hubs: PublicLinkItem[];
};

export type HubSharePageData = {
  id: string;
  slug: string;
  sharePath: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  dateLabel: string;
  cityLabel: string | null;
  ticketUrl: string | null;
  officialUrl: string | null;
  events: PublicEventListItem[];
  locations: PublicLinkItem[];
  organizers: PublicLinkItem[];
};

function normalizeText(value: Nullable<string>) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSingle<T>(value: SingleOrArray<T>) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeLookupValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && UUID_PATTERN.test(value));
}

function buildLocationLabel(location: SingleOrArray<RawLocationRelation>) {
  const normalizedLocation = normalizeSingle(location);
  if (!normalizedLocation) {
    return null;
  }

  const city = normalizeSingle(normalizedLocation.city);
  const parts = [
    normalizeText(normalizedLocation.name),
    normalizeText(city?.label),
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return normalizeText(normalizedLocation.address);
}

function formatEventDateLabel(date: string, endDate: string | null) {
  const startLabel = formatDateWithoutTimezone(date, "EEE d MMM • HH:mm");
  if (!endDate) {
    return startLabel;
  }

  const sameDay =
    date.slice(0, 10) === endDate.slice(0, 10);

  if (sameDay) {
    return `${startLabel} -> ${formatDateWithoutTimezone(endDate, "HH:mm")}`;
  }

  return `${startLabel} -> ${formatDateWithoutTimezone(endDate, "EEE d MMM • HH:mm")}`;
}

function formatHubDateLabel(startAt: string, endAt: string) {
  const startLabel = formatDateWithoutTimezone(startAt, "EEE d MMM");
  const endLabel = formatDateWithoutTimezone(endAt, "EEE d MMM");

  if (startAt.slice(0, 10) === endAt.slice(0, 10)) {
    return startLabel;
  }

  return `${startLabel} -> ${endLabel}`;
}

function toNumberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPriceLabel(event: RawEventRow) {
  if (event.is_full) {
    return "Complet";
  }

  const candidates = [
    toNumberOrNull(event.subscriber_price),
    toNumberOrNull(event.presale_price),
    toNumberOrNull(event.price),
  ].filter((value): value is number => value !== null && value >= 0);

  if (candidates.length === 0) {
    return null;
  }

  const minPrice = Math.min(...candidates);
  if (minPrice <= 0) {
    return "Gratuit";
  }

  return `À partir de ${minPrice.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} EUR`;
}

async function resolveCategoryNames(categoryValues: Array<string | null | undefined>) {
  const supabase = await createClient();
  const categoryIds = Array.from(
    new Set(
      categoryValues
        .map((value) => normalizeText(value))
        .filter((value): value is string => Boolean(value))
        .filter((value) => isUuid(value)),
    ),
  );

  if (categoryIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .in("id", categoryIds);

  if (error) {
    throw error;
  }

  return new Map(
    ((data || []) as CategoryRow[]).map((category) => [category.id, category.name]),
  );
}

function resolveCategoryLabel(
  rawCategory: string | null | undefined,
  categoryNameById: Map<string, string>,
) {
  const normalizedCategory = normalizeText(rawCategory);
  if (!normalizedCategory) {
    return null;
  }

  if (isUuid(normalizedCategory)) {
    return categoryNameById.get(normalizedCategory) ?? null;
  }

  return normalizedCategory;
}

function toPublicEventListItem(
  event: RawEventRow,
  categoryNameById: Map<string, string>,
): PublicEventListItem {
  return {
    id: event.id,
    title: normalizeText(event.title) ?? "Événement sans titre",
    href: buildEventPath(event.id),
    dateLabel: formatEventDateLabel(event.date, event.end_date),
    locationLabel: buildLocationLabel(event.location),
    categoryLabel: resolveCategoryLabel(event.category, categoryNameById),
    imageUrl: normalizeText(event.image_url),
  };
}

function toPublicHubLinkItem(majorEvent: RawMajorEventRelation) {
  const normalizedHub = normalizeSingle(majorEvent);
  const slug = normalizeText(normalizedHub?.slug);

  if (!normalizedHub?.id || !slug) {
    return null;
  }

  return {
    id: normalizedHub.id,
    title: normalizeText(normalizedHub.title) ?? "Hub OutLive",
    href: buildHubPath(slug),
    subtitle:
      normalizeText(normalizedHub.city_name) ||
      (normalizedHub.start_at && normalizedHub.end_at
        ? formatHubDateLabel(normalizedHub.start_at, normalizedHub.end_at)
        : null),
    imageUrl: normalizeText(normalizedHub.hero_image_url),
  } satisfies PublicLinkItem;
}

async function findLocationByReference(reference: string) {
  const supabase = await createClient();
  const locationId = extractEntityId(reference);

  if (locationId) {
    const { data, error } = await supabase
      .from("locations")
      .select(
        `
          id,
          name,
          address,
          image_url,
          short_description,
          website_url,
          instagram_url,
          facebook_url,
          tiktok_url,
          is_organizer,
          city:cities(label)
        `,
      )
      .eq("id", locationId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as RawLocationRow | null) ?? null;
  }

  const fallbackName = decodeURIComponent(reference).replace(/-/g, " ").trim();
  if (!fallbackName) {
    return null;
  }

  const { data, error } = await supabase
    .from("locations")
    .select(
      `
        id,
        name,
        address,
        image_url,
        short_description,
        website_url,
        instagram_url,
        facebook_url,
        tiktok_url,
        is_organizer,
        city:cities(label)
      `,
    )
    .ilike("name", `%${fallbackName}%`)
    .limit(20);

  if (error) {
    throw error;
  }

  const rows = ((data || []) as RawLocationRow[]).slice();
  const target = normalizeLookupValue(fallbackName);

  return (
    rows.find((row) => normalizeLookupValue(row.name) === target) ||
    rows.find((row) => normalizeLookupValue(row.name).includes(target)) ||
    null
  );
}

async function findOrganizerByReference(reference: string) {
  const supabase = await createClient();
  const organizerId = extractEntityId(reference);

  if (organizerId) {
    const { data, error } = await supabase
      .from("organizers")
      .select(
        `
          id,
          name,
          logo_url,
          icon_url,
          short_description,
          website_url,
          instagram_url,
          facebook_url,
          tiktok_url
        `,
      )
      .eq("id", organizerId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as RawOrganizerRow | null) ?? null;
  }

  const fallbackName = decodeURIComponent(reference).replace(/-/g, " ").trim();
  if (!fallbackName) {
    return null;
  }

  const { data, error } = await supabase
    .from("organizers")
    .select(
      `
        id,
        name,
        logo_url,
        icon_url,
        short_description,
        website_url,
        instagram_url,
        facebook_url,
        tiktok_url
      `,
    )
    .ilike("name", `%${fallbackName}%`)
    .limit(20);

  if (error) {
    throw error;
  }

  const rows = ((data || []) as RawOrganizerRow[]).slice();
  const target = normalizeLookupValue(fallbackName);

  return (
    rows.find((row) => normalizeLookupValue(row.name) === target) ||
    rows.find((row) => normalizeLookupValue(row.name).includes(target)) ||
    null
  );
}

export const getEventSharePageData = cache(
  async (eventId: string): Promise<EventSharePageData | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("events")
      .select(
        `
          id,
          title,
          description,
          date,
          end_date,
          category,
          image_url,
          external_url,
          external_url_label,
          is_full,
          price,
          presale_price,
          subscriber_price,
          location:locations(
            id,
            name,
            address,
            image_url,
            city:cities(label),
            is_organizer
          ),
          event_artists:event_artists(
            sort_index,
            role_label,
            artist:artists(
              id,
              name,
              slug,
              image_url,
              artist_type_label,
              origin_city
            )
          ),
          event_organizers:event_organizers(
            sort_index,
            organizer:organizers(
              id,
              name,
              logo_url,
              icon_url
            ),
            location:locations(
              id,
              name,
              address,
              image_url,
              city:cities(label),
              is_organizer
            )
          ),
          major_event_events(
            major_event:major_events(
              id,
              slug,
              title,
              short_description,
              hero_image_url,
              start_at,
              end_at,
              city_name,
              status
            )
          )
        `,
      )
      .eq("status", "approved")
      .eq("archived", false)
      .eq("id", eventId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const event = (data as (RawEventRow & {
      event_artists?: RawEventArtistRow[] | null;
      event_organizers?: RawEventOrganizerRow[] | null;
      major_event_events?: RawEventHubLinkRow[] | null;
    }) | null) ?? null;

    if (!event) {
      return null;
    }

    const categoryNameById = await resolveCategoryNames([event.category]);
    const location = normalizeSingle(event.location);
    const canonicalLocation =
      location?.id && location?.name
        ? {
            id: location.id,
            title: location.name,
            href: buildLocationPath(location.id, location.name),
            subtitle: buildLocationLabel(event.location),
            imageUrl: normalizeText(location.image_url),
          }
        : null;

    const artists = ((event.event_artists || []) as RawEventArtistRow[])
      .map((row) => {
        const artist = normalizeSingle(row.artist);
        if (!artist?.id || !artist?.slug || !normalizeText(artist.name)) {
          return null;
        }

        return {
          id: artist.id,
          title: artist.name!.trim(),
          href: buildArtistPath(artist.slug),
          subtitle: normalizeText(row.role_label) || normalizeText(artist.artist_type_label),
          imageUrl: normalizeText(artist.image_url),
        } satisfies PublicLinkItem;
      })
      .filter((item): item is PublicLinkItem => Boolean(item))
      .sort((left, right) => left.title.localeCompare(right.title, "fr"));

    const organizers = ((event.event_organizers || []) as RawEventOrganizerRow[])
      .map((row) => {
        const organizer = normalizeSingle(row.organizer);
        if (organizer?.id && normalizeText(organizer.name)) {
          return {
            id: organizer.id,
            title: organizer.name!.trim(),
            href: buildOrganizerPath(organizer.id, organizer.name!),
            subtitle: "Organisateur",
            imageUrl: normalizeText(organizer.logo_url) || normalizeText(organizer.icon_url),
          } satisfies PublicLinkItem;
        }

        const organizerLocation = normalizeSingle(row.location);
        if (organizerLocation?.id && normalizeText(organizerLocation.name)) {
          return {
            id: organizerLocation.id,
            title: organizerLocation.name!.trim(),
            href: buildLocationPath(organizerLocation.id, organizerLocation.name!),
            subtitle: "Lieu organisateur",
            imageUrl: normalizeText(organizerLocation.image_url),
          } satisfies PublicLinkItem;
        }

        return null;
      })
      .filter((item): item is PublicLinkItem => Boolean(item));

    const hub =
      ((event.major_event_events || []) as RawEventHubLinkRow[])
        .map((row) => toPublicHubLinkItem(normalizeSingle(row.major_event)))
        .find((item): item is PublicLinkItem => Boolean(item)) ?? null;

    return {
      id: event.id,
      sharePath: buildEventPath(event.id),
      title: normalizeText(event.title) ?? "Événement OutLive",
      description: normalizeText(event.description),
      imageUrl: normalizeText(event.image_url),
      dateLabel: formatEventDateLabel(event.date, event.end_date),
      locationLabel: buildLocationLabel(event.location),
      categoryLabel: resolveCategoryLabel(event.category, categoryNameById),
      priceLabel: formatPriceLabel(event),
      ticketUrl: normalizeText(event.external_url),
      ticketLabel: normalizeText(event.external_url_label),
      locationLink: canonicalLocation,
      artists,
      organizers,
      hub,
    };
  },
);

export const getLocationSharePageData = cache(
  async (reference: string): Promise<LocationSharePageData | null> => {
    const location = await findLocationByReference(reference);
    if (!location) {
      return null;
    }

    const supabase = await createClient();
    const [eventsResult, hubsResult] = await Promise.all([
      supabase
        .from("events")
        .select(
          `
            id,
            title,
            description,
            date,
            end_date,
            category,
            image_url,
            external_url,
            external_url_label,
            is_full,
            price,
            presale_price,
            subscriber_price,
            location:locations(
              id,
              name,
              address,
              image_url,
              city:cities(label),
              is_organizer
            )
          `,
        )
        .eq("status", "approved")
        .eq("archived", false)
        .eq("location_id", location.id)
        .order("date", { ascending: true }),
      supabase
        .from("major_event_locations")
        .select(
          `
            sort_index,
            major_event:major_events(
              id,
              slug,
              title,
              short_description,
              hero_image_url,
              start_at,
              end_at,
              city_name,
              status
            )
          `,
        )
        .eq("location_id", location.id)
        .order("sort_index", { ascending: true }),
    ]);

    if (eventsResult.error) {
      throw eventsResult.error;
    }

    if (hubsResult.error) {
      throw hubsResult.error;
    }

    const rawEvents = ((eventsResult.data || []) as RawEventRow[]).slice();
    const categoryNameById = await resolveCategoryNames(rawEvents.map((event) => event.category));
    const hubs = ((hubsResult.data || []) as Array<{ major_event?: SingleOrArray<RawMajorEventRelation> }>)
      .map((row) => toPublicHubLinkItem(normalizeSingle(row.major_event)))
      .filter((item): item is PublicLinkItem => Boolean(item));

    return {
      id: location.id,
      reference: buildEntityReference(location.id, location.name),
      sharePath: buildLocationPath(location.id, location.name),
      title: location.name,
      description: normalizeText(location.short_description),
      imageUrl: normalizeText(location.image_url),
      address: normalizeText(location.address),
      cityLabel: normalizeText(normalizeSingle(location.city)?.label),
      isOrganizer: Boolean(location.is_organizer),
      websiteUrl: normalizeText(location.website_url),
      instagramUrl: normalizeText(location.instagram_url),
      facebookUrl: normalizeText(location.facebook_url),
      tiktokUrl: normalizeText(location.tiktok_url),
      upcomingEvents: rawEvents.map((event) => toPublicEventListItem(event, categoryNameById)),
      hubs,
    };
  },
);

export const getOrganizerSharePageData = cache(
  async (reference: string): Promise<OrganizerSharePageData | null> => {
    const organizer = await findOrganizerByReference(reference);
    if (!organizer) {
      return null;
    }

    const supabase = await createClient();
    const [eventsResult, hubsResult] = await Promise.all([
      supabase
        .from("events")
        .select(
          `
            id,
            title,
            description,
            date,
            end_date,
            category,
            image_url,
            external_url,
            external_url_label,
            is_full,
            price,
            presale_price,
            subscriber_price,
            location:locations(
              id,
              name,
              address,
              image_url,
              city:cities(label),
              is_organizer
            ),
            event_organizers:event_organizers!inner(
              organizer_id,
              organizer:organizers(
                id,
                name
              )
            )
          `,
        )
        .eq("status", "approved")
        .eq("archived", false)
        .eq("event_organizers.organizer_id", organizer.id)
        .order("date", { ascending: true }),
      supabase
        .from("major_event_organizers")
        .select(
          `
            sort_index,
            major_event:major_events(
              id,
              slug,
              title,
              short_description,
              hero_image_url,
              start_at,
              end_at,
              city_name,
              status
            )
          `,
        )
        .eq("organizer_id", organizer.id)
        .order("sort_index", { ascending: true }),
    ]);

    if (eventsResult.error) {
      throw eventsResult.error;
    }

    if (hubsResult.error) {
      throw hubsResult.error;
    }

    const rawEvents = ((eventsResult.data || []) as Array<RawEventRow>).slice();
    const categoryNameById = await resolveCategoryNames(rawEvents.map((event) => event.category));
    const hubs = ((hubsResult.data || []) as Array<{ major_event?: SingleOrArray<RawMajorEventRelation> }>)
      .map((row) => toPublicHubLinkItem(normalizeSingle(row.major_event)))
      .filter((item): item is PublicLinkItem => Boolean(item));

    return {
      id: organizer.id,
      reference: buildEntityReference(organizer.id, organizer.name),
      sharePath: buildOrganizerPath(organizer.id, organizer.name),
      title: organizer.name,
      description: normalizeText(organizer.short_description),
      imageUrl: normalizeText(organizer.logo_url) || normalizeText(organizer.icon_url),
      websiteUrl: normalizeText(organizer.website_url),
      instagramUrl: normalizeText(organizer.instagram_url),
      facebookUrl: normalizeText(organizer.facebook_url),
      tiktokUrl: normalizeText(organizer.tiktok_url),
      upcomingEvents: rawEvents.map((event) => toPublicEventListItem(event, categoryNameById)),
      hubs,
    };
  },
);

export const getHubSharePageData = cache(
  async (slug: string): Promise<HubSharePageData | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("major_events")
      .select(
        `
          id,
          slug,
          title,
          short_description,
          long_description,
          hero_image_url,
          logo_url,
          start_at,
          end_at,
          city_name,
          ticketing_url,
          official_url,
          major_event_events(
            sort_index,
            program_label_override,
            event:events(
              id,
              title,
              description,
              date,
              end_date,
              category,
              image_url,
              external_url,
              external_url_label,
              is_full,
              price,
              presale_price,
              subscriber_price,
              location:locations(
                id,
                name,
                address,
                image_url,
                city:cities(label),
                is_organizer
              )
            )
          ),
          major_event_locations(
            sort_index,
            label_override,
            location:locations(
              id,
              name,
              address,
              image_url,
              city:cities(label),
              is_organizer
            )
          ),
          major_event_organizers(
            sort_index,
            role_label,
            organizer:organizers(
              id,
              name,
              logo_url,
              icon_url
            ),
            location:locations(
              id,
              name,
              address,
              image_url,
              city:cities(label),
              is_organizer
            )
          )
        `,
      )
      .eq("slug", slug)
      .eq("status", "approved")
      .maybeSingle();

    if (error) {
      throw error;
    }

    const hub = (data as RawMajorEventRow | null) ?? null;
    if (!hub) {
      return null;
    }

    const rawEvents = ((hub.major_event_events || []) as Array<{
      sort_index?: number | null;
      event?: SingleOrArray<RawEventRow>;
    }>)
      .map((row) => normalizeSingle(row.event))
      .filter((event): event is RawEventRow => Boolean(event));

    const categoryNameById = await resolveCategoryNames(rawEvents.map((event) => event.category));
    const locations = ((hub.major_event_locations || []) as Array<{
      sort_index?: number | null;
      label_override?: string | null;
      location?: SingleOrArray<RawLocationRelation>;
    }>)
      .map((row) => {
        const location = normalizeSingle(row.location);
        if (!location?.id || !normalizeText(location.name)) {
          return null;
        }

        return {
          id: location.id,
          title: normalizeText(row.label_override) || location.name!.trim(),
          href: buildLocationPath(location.id, location.name!),
          subtitle: buildLocationLabel(location),
          imageUrl: normalizeText(location.image_url),
        } satisfies PublicLinkItem;
      })
      .filter((item): item is PublicLinkItem => Boolean(item));

    const organizers = ((hub.major_event_organizers || []) as Array<{
      sort_index?: number | null;
      role_label?: string | null;
      organizer?: SingleOrArray<RawOrganizerRelation>;
      location?: SingleOrArray<RawLocationRelation>;
    }>)
      .map((row) => {
        const organizer = normalizeSingle(row.organizer);
        if (organizer?.id && normalizeText(organizer.name)) {
          return {
            id: organizer.id,
            title: organizer.name!.trim(),
            href: buildOrganizerPath(organizer.id, organizer.name!),
            subtitle: normalizeText(row.role_label) || "Organisateur",
            imageUrl: normalizeText(organizer.logo_url) || normalizeText(organizer.icon_url),
          } satisfies PublicLinkItem;
        }

        const organizerLocation = normalizeSingle(row.location);
        if (organizerLocation?.id && normalizeText(organizerLocation.name)) {
          return {
            id: organizerLocation.id,
            title: organizerLocation.name!.trim(),
            href: buildLocationPath(organizerLocation.id, organizerLocation.name!),
            subtitle: normalizeText(row.role_label) || "Lieu organisateur",
            imageUrl: normalizeText(organizerLocation.image_url),
          } satisfies PublicLinkItem;
        }

        return null;
      })
      .filter((item): item is PublicLinkItem => Boolean(item));

    return {
      id: hub.id,
      slug: hub.slug,
      sharePath: buildHubPath(hub.slug),
      title: normalizeText(hub.title) ?? "Hub OutLive",
      description: normalizeText(hub.short_description) || normalizeText(hub.long_description),
      imageUrl: normalizeText(hub.hero_image_url) || normalizeText(hub.logo_url),
      dateLabel: formatHubDateLabel(hub.start_at, hub.end_at),
      cityLabel: normalizeText(hub.city_name),
      ticketUrl: normalizeText(hub.ticketing_url),
      officialUrl: normalizeText(hub.official_url),
      events: rawEvents.map((event) => toPublicEventListItem(event, categoryNameById)),
      locations,
      organizers,
    };
  },
);
