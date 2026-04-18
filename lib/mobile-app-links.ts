export const APP_SCHEME = "com.lazbutton.live://";
export const IOS_TEAM_ID = "4U7FA9387Q";
export const IOS_BUNDLE_ID = "com.lazbutton.live";
export const ANDROID_PACKAGE_NAME = "com.lazbutton.live";
export const ANDROID_RELEASE_SHA256_FINGERPRINT =
  "0F:4A:51:B5:A6:2C:6E:BC:4C:D4:F0:69:8D:E2:1F:0A:11:42:24:6E:CC:61:4D:BE:B0:1D:AE:55:4F:25:4E:5B";

const DEFAULT_APP_STORE_URL =
  "https://apps.apple.com/fr/app/outlive/id6756211104";

const appStoreUrl =
  process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() || DEFAULT_APP_STORE_URL;
const playStoreUrl = process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AppOpenEntity = "artist" | "event" | "location" | "organizer" | "hub";

type DownloadPathOptions = {
  from?: string | null;
  name?: string | null;
  deepLink?: string | null;
};

function buildQueryString(options: DownloadPathOptions = {}) {
  const params = new URLSearchParams();

  if (options.from) {
    params.set("from", options.from);
  }

  if (options.name) {
    params.set("name", options.name);
  }

  const normalizedDeepLink = normalizeAppDeepLink(options.deepLink);
  if (normalizedDeepLink) {
    params.set("deepLink", normalizedDeepLink);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function slugifySegment(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "outlive";
}

export function buildEntityReference(id: string, label?: string | null) {
  const trimmedId = id.trim();
  if (!label?.trim()) {
    return trimmedId;
  }

  return `${trimmedId}-${slugifySegment(label)}`;
}

export function extractEntityId(reference: string | null | undefined) {
  const trimmed = reference?.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = trimmed.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:-|$)/i,
  );
  if (directMatch?.[1] && UUID_PATTERN.test(directMatch[1])) {
    return directMatch[1];
  }

  return null;
}

export function buildArtistDeepLink(artistId: string) {
  return `${APP_SCHEME}artist/${artistId}`;
}

export function buildEventDeepLink(eventId: string) {
  return `${APP_SCHEME}event/${eventId}`;
}

export function buildLocationDeepLink(reference: string) {
  return `${APP_SCHEME}location/${reference}`;
}

export function buildOrganizerDeepLink(reference: string) {
  return `${APP_SCHEME}organizer/${reference}`;
}

export function buildHubDeepLink(slug: string) {
  return `${APP_SCHEME}hub/${encodeURIComponent(slug.trim())}`;
}

export function normalizeAppDeepLink(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith(APP_SCHEME)) {
    return null;
  }

  return trimmed;
}

export function buildArtistPath(slug: string) {
  return `/artists/${encodeURIComponent(slug.trim())}`;
}

export function buildEventPath(eventId: string) {
  return `/event/${eventId.trim()}`;
}

export function buildLocationPath(locationId: string, locationName: string) {
  return `/location/${buildEntityReference(locationId, locationName)}`;
}

export function buildOrganizerPath(organizerId: string, organizerName: string) {
  return `/organizer/${buildEntityReference(organizerId, organizerName)}`;
}

export function buildHubPath(slug: string) {
  return `/hub/${encodeURIComponent(slug.trim())}`;
}

export function buildArtistOpenPath(
  artistId: string,
  options: DownloadPathOptions = {},
) {
  return `/open/artist/${artistId}${buildQueryString(options)}`;
}

export function buildEventOpenPath(
  eventId: string,
  options: DownloadPathOptions = {},
) {
  return `/open/event/${eventId}${buildQueryString(options)}`;
}

export function buildLocationOpenPath(
  reference: string,
  options: DownloadPathOptions = {},
) {
  return `/open/location/${reference}${buildQueryString(options)}`;
}

export function buildOrganizerOpenPath(
  reference: string,
  options: DownloadPathOptions = {},
) {
  return `/open/organizer/${reference}${buildQueryString(options)}`;
}

export function buildHubOpenPath(slug: string, options: DownloadPathOptions = {}) {
  return `/open/hub/${encodeURIComponent(slug.trim())}${buildQueryString(options)}`;
}

export function buildDownloadAppPath(options: DownloadPathOptions = {}) {
  return `/download-app${buildQueryString(options)}`;
}

export function getPublicStoreUrls() {
  return {
    appStoreUrl,
    playStoreUrl,
  };
}

export function getPreferredStoreUrl(platform: "ios" | "android" | null) {
  if (platform === "ios" && appStoreUrl) {
    return appStoreUrl;
  }

  if (platform === "android" && playStoreUrl) {
    return playStoreUrl;
  }

  return appStoreUrl || playStoreUrl || null;
}

export function detectMobilePlatform(userAgent: string | null | undefined) {
  const value = (userAgent || "").toLowerCase();

  if (/iphone|ipad|ipod/.test(value)) {
    return "ios" as const;
  }

  if (/android/.test(value)) {
    return "android" as const;
  }

  return null;
}

export function normalizeInternalPath(path: string | null | undefined) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }

  return path;
}
