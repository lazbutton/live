/*
 * Nature d'une source de collecte, déduite de son adresse (le type enregistré
 * n'est pas fiable : des sources « site » pointent vers Instagram ou Facebook).
 */

export type SourceKind = "website" | "instagram" | "facebook";

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function getSourceKind(url: string): SourceKind {
  const host = hostOf(url);
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return "facebook";
  return "website";
}

/** Adresse lisible : « le108.org/agenda », « @chafouin_orleans »… */
export function getAddressLabel(url: string, kind: SourceKind = getSourceKind(url)) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (kind === "instagram") return segments[0] && segments[0] !== "p" ? `@${segments[0]}` : "instagram.com";
    if (kind === "facebook") return segments[0] ? `facebook.com/${segments[0]}` : "facebook.com";
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

/** Identifiant d'un compte Instagram ou d'une page Facebook (« chafouin_orleans »). */
export function getSocialHandle(url: string) {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean)[0] || "";
    return ["p", "reel", "events", "profile.php", "pages"].includes(segment) ? "" : segment.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Billetteries et réseaux partagés par de nombreuses structures : leur domaine seul
 * ne désigne pas une source (les sous-domaines Mapado, eux, sont propres à un lieu).
 */
export function isSharedHost(host: string) {
  return /(^|\.)(billetweb\.fr|weezevent\.com|helloasso\.com|shotgun\.live|eventbrite\.(fr|com)|yurplan\.com|festik\.net|dice\.fm|fnacspectacles\.com|ticketmaster\.fr|seetickets\.com|instagram\.com|facebook\.com)$/.test(
    host,
  ) || host === "mapado.com";
}

/** Domaine principal : « billetterie.lastrolabe.org » → « lastrolabe.org ». */
export function baseDomain(host: string) {
  return host.split(".").slice(-2).join(".");
}
