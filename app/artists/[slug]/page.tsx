import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Globe,
  Instagram,
  MapPin,
} from "lucide-react";

import { ArtistPageLogo } from "@/components/artists/artist-page-logo";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 300;

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type ArtistRow = {
  id: string;
  name: string;
  slug: string;
  artist_type_label: string | null;
  origin_city: string | null;
  tag_ids: string[] | null;
  short_description: string | null;
  image_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  soundcloud_url: string | null;
  deezer_url: string | null;
};

type ArtistTagRow = {
  id: string;
  name: string;
};

type CategoryRow = {
  id: string;
  name: string;
};

type EventLocationRow =
  | {
      id?: string | null;
      name?: string | null;
      address?: string | null;
      city?: { label?: string | null } | null;
    }
  | Array<{
      id?: string | null;
      name?: string | null;
      address?: string | null;
      city?: { label?: string | null } | null;
    }>
  | null;

type RawArtistEventRow = {
  id: string;
  title: string | null;
  description: string | null;
  date: string;
  end_date: string | null;
  category: string | null;
  price: number | string | null;
  presale_price: number | string | null;
  subscriber_price: number | string | null;
  image_url: string | null;
  external_url: string | null;
  external_url_label: string | null;
  is_full: boolean | null;
  location: EventLocationRow;
  event_artists:
    | Array<{
        artist_id?: string | null;
        sort_index?: number | null;
        role_label?: string | null;
      }>
    | null;
};

type ArtistEvent = {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  category: string | null;
  priceLabel: string;
  imageUrl: string | null;
  externalUrl: string | null;
  externalUrlLabel: string | null;
  isFull: boolean;
  roleLabel: string | null;
  locationLabel: string | null;
  startMs: number;
  endMs: number;
  sortIndex: number;
};

type ArtistPageData = {
  artist: ArtistRow;
  tags: ArtistTagRow[];
  events: ArtistEvent[];
};

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDatePreservingClock(dateString: string) {
  const timezoneMatch = dateString.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:[+-]\d{2}:\d{2}|Z)?$/,
  );

  if (timezoneMatch) {
    const [, year, month, day, hours, minutes, seconds = "0"] = timezoneMatch;

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
    );
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
    parsed.getHours(),
    parsed.getMinutes(),
    parsed.getSeconds(),
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function startOfLocalDayMs(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function normalizeLocationRow(location: EventLocationRow) {
  if (Array.isArray(location)) {
    return location[0] ?? null;
  }

  return location ?? null;
}

function toNumberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getEventEndMs(dateIso: string, endDateIso: string | null) {
  const fallbackStartMs = parseDatePreservingClock(dateIso).getTime();
  if (!endDateIso) return fallbackStartMs;

  const endMs = parseDatePreservingClock(endDateIso).getTime();
  return Number.isFinite(endMs) ? endMs : fallbackStartMs;
}

function formatPriceLabel(event: RawArtistEventRow) {
  if (event.is_full) return "Complet";

  const candidates = [
    toNumberOrNull(event.subscriber_price),
    toNumberOrNull(event.presale_price),
    toNumberOrNull(event.price),
  ].filter((value): value is number => value !== null && value >= 0);

  if (candidates.length === 0) return "Gratuit";

  const minPrice = Math.min(...candidates);
  if (minPrice === 0) return "Gratuit";

  return `Des ${minPrice.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} EUR`;
}

function buildLocationLabel(event: RawArtistEventRow) {
  const location = normalizeLocationRow(event.location);
  const parts = [
    normalizeText(location?.name),
    normalizeText(location?.city?.label),
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return normalizeText(location?.address) ?? null;
}

function getArtistInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatNaturalTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(":", "h");
}

function formatAbsoluteDay(date: Date, referenceDate: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== referenceDate.getFullYear() ? { year: "numeric" as const } : {}),
  }).format(date);
}

function formatRelativeDay(date: Date, referenceDate: Date) {
  const dayDiff = Math.round((startOfLocalDayMs(date) - startOfLocalDayMs(referenceDate)) / 86400000);

  if (dayDiff === 0) return "Aujourd'hui";
  if (dayDiff === 1) return "Demain";
  if (dayDiff === -1) return "Hier";

  return formatAbsoluteDay(date, referenceDate);
}

function formatEventDateLabel(dateIso: string, endDateIso: string | null) {
  const referenceDate = new Date();
  const start = parseDatePreservingClock(dateIso);
  const end = endDateIso ? parseDatePreservingClock(endDateIso) : null;

  const startDateLabel = formatRelativeDay(start, referenceDate);
  const startTimeLabel = formatNaturalTime(start);

  if (!end) {
    return `${startDateLabel} a ${startTimeLabel}`;
  }

  if (isSameLocalDay(start, end)) {
    const endTimeLabel = formatNaturalTime(end);
    return `${startDateLabel} de ${startTimeLabel} a ${endTimeLabel}`;
  }

  return `Du ${formatAbsoluteDay(start, referenceDate)} a ${startTimeLabel} au ${formatAbsoluteDay(end, referenceDate)} a ${formatNaturalTime(end)}`;
}

function formatDateBadge(dateIso: string) {
  const date = parseDatePreservingClock(dateIso);
  return {
    day: new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("fr-FR", { month: "short" })
      .format(date)
      .replace(".", "")
      .toUpperCase(),
  };
}

function buildArtistLinks(artist: ArtistRow) {
  return [
    artist.website_url
      ? {
          label: "Site",
          href: artist.website_url,
          kind: "website" as const,
        }
      : null,
    artist.instagram_url
      ? {
          label: "Instagram",
          href: artist.instagram_url,
          kind: "instagram" as const,
        }
      : null,
    artist.soundcloud_url
      ? {
          label: "SoundCloud",
          href: artist.soundcloud_url,
          kind: "generic" as const,
        }
      : null,
    artist.deezer_url
      ? {
          label: "Deezer",
          href: artist.deezer_url,
          kind: "generic" as const,
        }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    href: string;
    kind: "website" | "instagram" | "generic";
  }>;
}

const getArtistPageData = cache(async (slug: string): Promise<ArtistPageData | null> => {
  const supabase = await createClient();

  const { data: artistData, error: artistError } = await supabase
    .from("artists")
    .select(
      "id, name, slug, artist_type_label, origin_city, tag_ids, short_description, image_url, website_url, instagram_url, soundcloud_url, deezer_url",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (artistError) {
    throw artistError;
  }

  const artist = (artistData as ArtistRow | null) ?? null;
  if (!artist) {
    return null;
  }

  const tagsPromise =
    artist.tag_ids && artist.tag_ids.length > 0
      ? supabase.from("tags").select("id, name").in("id", artist.tag_ids)
      : Promise.resolve({ data: [] as ArtistTagRow[], error: null });

  const eventsPromise = supabase
    .from("events")
    .select(
      `
        id,
        title,
        description,
        date,
        end_date,
        category,
        price,
        presale_price,
        subscriber_price,
        image_url,
        external_url,
        external_url_label,
        is_full,
        location:locations(
          id,
          name,
          address,
          city:cities(label)
        ),
        event_artists!inner(
          artist_id,
          sort_index,
          role_label
        )
      `,
    )
    .eq("status", "approved")
    .eq("archived", false)
    .eq("event_artists.artist_id", artist.id)
    .order("date", { ascending: true });

  const [tagsResult, eventsResult] = await Promise.all([tagsPromise, eventsPromise]);

  if (tagsResult.error) {
    throw tagsResult.error;
  }

  if (eventsResult.error) {
    throw eventsResult.error;
  }

  const tagRows = ((tagsResult.data || []) as ArtistTagRow[]).slice();
  const tagsById = new Map(tagRows.map((tag) => [tag.id, tag]));
  const orderedTags = (artist.tag_ids || [])
    .map((tagId) => tagsById.get(tagId))
    .filter((tag): tag is ArtistTagRow => Boolean(tag));

  const rawEvents = ((eventsResult.data || []) as RawArtistEventRow[]).slice();
  const categoryIds = Array.from(
    new Set(
      rawEvents
        .map((event) => normalizeText(event.category))
        .filter((category): category is string => Boolean(category))
        .filter((category) => isUuid(category)),
    ),
  );

  const categoriesResult =
    categoryIds.length > 0
      ? await supabase.from("categories").select("id, name").in("id", categoryIds)
      : { data: [] as CategoryRow[], error: null };

  if (categoriesResult.error) {
    throw categoriesResult.error;
  }

  const categoryNameById = new Map(
    (((categoriesResult.data || []) as CategoryRow[]) ?? []).map((category) => [category.id, category.name]),
  );

  const normalizedEvents = rawEvents
    .map((event) => {
      const relation = Array.isArray(event.event_artists) ? event.event_artists[0] : null;
      const startMs = parseDatePreservingClock(event.date).getTime();
      const endMs = getEventEndMs(event.date, event.end_date);
      const rawCategory = normalizeText(event.category);

      return {
        id: event.id,
        title: normalizeText(event.title) ?? "Événement sans titre",
        date: event.date,
        endDate: event.end_date,
        category: rawCategory ? categoryNameById.get(rawCategory) ?? rawCategory : null,
        priceLabel: formatPriceLabel(event),
        imageUrl: normalizeText(event.image_url),
        externalUrl: normalizeText(event.external_url),
        externalUrlLabel: normalizeText(event.external_url_label),
        isFull: Boolean(event.is_full),
        roleLabel: normalizeText(relation?.role_label),
        locationLabel: buildLocationLabel(event),
        startMs,
        endMs,
        sortIndex: relation?.sort_index ?? 0,
      } satisfies ArtistEvent;
    })
    .sort((left, right) => {
      if (left.startMs !== right.startMs) {
        return left.startMs - right.startMs;
      }

      if (left.sortIndex !== right.sortIndex) {
        return left.sortIndex - right.sortIndex;
      }

      return left.title.localeCompare(right.title, "fr");
    });

  return {
    artist,
    tags: orderedTags,
    events: normalizedEvents,
  };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getArtistPageData(slug);

  if (!data) {
    return {
      title: "Artiste | OutLive",
      description: "Vitrine publique artiste sur OutLive.",
    };
  }

  return {
    title: `${data.artist.name} | OutLive`,
    description:
      normalizeText(data.artist.short_description) ||
      `Retrouvez les événements passés et à venir de ${data.artist.name} sur OutLive.`,
  };
}

function ArtistEventCard({ event, archived = false }: { event: ArtistEvent; archived?: boolean }) {
  const badge = formatDateBadge(event.date);

  const content = (
    <div
      className={[
        "group h-full overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.035] transition duration-300",
        "hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.05]",
        archived ? "opacity-80" : "",
      ].join(" ")}
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-[#171719]">
        {event.imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.04]"
            style={{ backgroundImage: `url(${event.imageUrl})` }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(222,51,51,0.35),_transparent_58%),linear-gradient(180deg,_#1a1a1d_0%,_#101012_100%)] text-2xl font-semibold tracking-[0.24em] text-white/35">
            {event.title
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() ?? "")
              .join("")}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0c] via-[#0b0b0c]/10 to-transparent" />

        <div className="absolute left-3.5 top-3.5 rounded-2xl border border-white/15 bg-black/40 px-2.5 py-1.5 text-white backdrop-blur-md">
          <div className="text-base font-semibold leading-none">{badge.day}</div>
          <div className="mt-1 text-[9px] font-medium tracking-[0.24em] text-white/70">
            {badge.month}
          </div>
        </div>

        {event.isFull ? (
          <div className="absolute right-3.5 top-3.5 rounded-full bg-[#de3333] px-2.5 py-1 text-[11px] font-semibold text-white">
            Complet
          </div>
        ) : null}
      </div>

      <div className="flex min-h-[190px] flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[11px] uppercase tracking-[0.22em] text-white/45">
              {event.locationLabel || "Lieu à confirmer"}
            </div>
          </div>
          {event.category ? (
            <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-white/55">
              {event.category}
            </div>
          ) : null}
        </div>

        <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-white">{event.title}</h2>

        <div className="flex items-start gap-2 text-[13px] text-white/70">
          <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{formatEventDateLabel(event.date, event.endDate)}</span>
        </div>

        {event.roleLabel ? (
          <div className="inline-flex w-fit rounded-full border border-[#de3333]/30 bg-[#de3333]/10 px-2.5 py-1 text-[11px] font-medium text-[#ff8b8b]">
            {event.roleLabel}
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-2 text-[13px]">
          <div className="font-medium text-white/92">{event.priceLabel}</div>
          {event.externalUrl ? (
            <div className="inline-flex items-center gap-1.5 text-white/60">
              <span>{event.externalUrlLabel || "Billetterie"}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </div>
          ) : (
            <div className="text-white/35">OutLive</div>
          )}
        </div>
      </div>
    </div>
  );

  if (!event.externalUrl) {
    return <div className="h-full">{content}</div>;
  }

  return (
    <a
      href={event.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-full cursor-pointer"
      aria-label={`Ouvrir la page de ${event.title}`}
    >
      {content}
    </a>
  );
}

export default async function ArtistPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getArtistPageData(slug);

  if (!data) {
    notFound();
  }

  const { artist, tags, events } = data;
  const now = Date.now();

  const upcomingEvents = events
    .filter((event) => event.endMs >= now)
    .sort((left, right) => {
      if (left.startMs !== right.startMs) {
        return left.startMs - right.startMs;
      }
      return left.sortIndex - right.sortIndex;
    });

  const pastEvents = events
    .filter((event) => event.endMs < now)
    .sort((left, right) => {
      if (left.endMs !== right.endMs) {
        return right.endMs - left.endMs;
      }
      return right.startMs - left.startMs;
    });

  const artistTypeLabel = normalizeText(artist.artist_type_label) ?? "Artiste";
  const artistLinks = buildArtistLinks(artist);
  const description =
    normalizeText(artist.short_description);

  return (
    <div className="min-h-screen overflow-hidden bg-[#0b0b0c] text-white">
      <Link
        href="/"
        className="fixed right-4 top-4 z-40 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/78 backdrop-blur-md transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white sm:right-6 sm:top-6 lg:right-8"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Link>

      <header className="relative z-30">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-4 sm:px-6 lg:px-8">
          <ArtistPageLogo />
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <section className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
          <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-[32px] border border-white/10 bg-[#141416] sm:max-w-[320px] lg:mx-0">
            {artist.image_url ? (
              <div
                className="aspect-square bg-cover bg-center"
                style={{ backgroundImage: `url(${artist.image_url})` }}
              />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(222,51,51,0.45),_transparent_55%),linear-gradient(180deg,_#1d1d21_0%,_#101012_100%)] text-7xl font-semibold tracking-[0.18em] text-white/40">
                {getArtistInitials(artist.name)}
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0c]/85 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="inline-flex rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-white/70 backdrop-blur-md">
                {artistTypeLabel}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="space-y-4">
              <div className="inline-flex w-fit rounded-full border border-[#de3333]/25 bg-[#de3333]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.26em] text-[#ff9b9b]">
                Profil artiste
              </div>

              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                  {artist.name}
                </h1>

                <div className="flex flex-wrap gap-2 text-sm text-white/60">
                  {normalizeText(artist.origin_city) ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                      <MapPin className="h-4 w-4" />
                      <span>{artist.origin_city}</span>
                    </div>
                  ) : null}

                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>{upcomingEvents.length} à venir</span>
                  </div>

                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>{pastEvents.length} passés</span>
                  </div>
                </div>
              </div>

              <p className="max-w-3xl text-base leading-8 text-white/72 sm:text-lg">{description}</p>
            </div>

            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/70"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : null}

            {artistLinks.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {artistLinks.map((link) => (
                  <a
                    key={`${link.label}-${link.href}`}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-white/[0.035] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:border-white/22 hover:bg-white/[0.06] hover:text-white"
                  >
                    {link.kind === "website" ? <Globe className="h-4 w-4" /> : null}
                    {link.kind === "instagram" ? <Instagram className="h-4 w-4" /> : null}
                    <span>{link.label}</span>
                    <ExternalLink className="h-4 w-4 text-white/45" />
                  </a>
                ))}
              </div>
            ) : null}

          </div>
        </section>

        <section className="mt-16">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.28em] text-white/40">Événements</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                À venir et en cours
              </h2>
            </div>

            <div className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/70">
              {upcomingEvents.length} événement{upcomingEvents.length > 1 ? "s" : ""}
            </div>
          </div>

          {upcomingEvents.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {upcomingEvents.map((event) => (
                <ArtistEventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.025] p-8 text-white/60">
              Aucun événement à venir n&apos;est actuellement rattaché à cet artiste.
            </div>
          )}
        </section>

        <section className="mt-16">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.28em] text-white/40">Mémoire</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Événements passés
              </h2>
            </div>

            <div className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/70">
              {pastEvents.length} événement{pastEvents.length > 1 ? "s" : ""}
            </div>
          </div>

          {pastEvents.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {pastEvents.map((event) => (
                <ArtistEventCard key={event.id} event={event} archived />
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.025] p-8 text-white/60">
              Aucun événement passé n&apos;est disponible pour cet artiste pour le moment.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
