"use client";

import type { EventOpportunity, EventSource, IntakeDuplicateCandidate } from "./intake-types";

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Source active dont la revue est échue (ou jamais planifiée). */
export function isSourceDue(source: EventSource) {
  if (source.status !== "active") return false;
  if (!source.next_scan_at) return true;
  return new Date(source.next_scan_at).getTime() <= Date.now();
}

function normalizeDuplicateText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeDuplicateText(value: string | null | undefined) {
  const stopWords = new Set([
    "le",
    "la",
    "les",
    "de",
    "du",
    "des",
    "d",
    "a",
    "au",
    "aux",
    "en",
    "et",
    "the",
    "and",
    "with",
    "pour",
    "sur",
    "live",
    "event",
    "events",
    "soiree",
    "soirée",
    "concert",
    "festival",
    "party",
    "edition",
    "night",
    "club",
  ]);
  return normalizeDuplicateText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function getCharacterTrigramSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  const build = (value: string) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length < 3) return new Set([normalized]);
    const grams = new Set<string>();
    for (let i = 0; i <= normalized.length - 3; i += 1) {
      grams.add(normalized.slice(i, i + 3));
    }
    return grams;
  };
  const leftSet = build(left);
  const rightSet = build(right);
  let common = 0;
  for (const gram of leftSet) {
    if (rightSet.has(gram)) common += 1;
  }
  const denom = leftSet.size + rightSet.size;
  if (denom === 0) return 0;
  return (2 * common) / denom;
}

function getTokenOverlapRatio(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function getNumericTokens(value: string | null | undefined) {
  const matches = normalizeDuplicateText(value).match(/\b\d{1,4}\b/g) || [];
  return Array.from(new Set(matches));
}

function getNumericOverlap(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return null;
  const rightSet = new Set(right);
  let common = 0;
  for (const token of left) {
    if (rightSet.has(token)) common += 1;
  }
  return common / Math.max(left.length, right.length);
}

function computeTitleSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.88;
  const leftTokens = tokenizeDuplicateText(left);
  const rightTokens = tokenizeDuplicateText(right);
  const tokenOverlap = getTokenOverlapRatio(leftTokens, rightTokens);
  const trigramSimilarity = getCharacterTrigramSimilarity(left, right);
  const prefixBonus =
    left.slice(0, 24) === right.slice(0, 24) && left.length > 8 && right.length > 8 ? 0.08 : 0;
  const tokenScore = tokenOverlap + prefixBonus;
  return Math.max(0, Math.min(1, Math.max(tokenScore, trigramSimilarity * 0.92)));
}

function normalizeComparableUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    const usefulParams = ["id", "event_id", "eid"];
    const params = new URLSearchParams(parsed.search);
    const kept = usefulParams
      .map((key) => [key, params.get(key)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = kept.map(([key, val]) => `${key}=${val}`).join("&");
    return `${host}${pathname}${query ? `?${query}` : ""}` || null;
  } catch {
    return null;
  }
}

function getUrlIdentity(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    const facebookEventMatch = path.match(/\/events\/(\d+)/);
    if (facebookEventMatch?.[1]) {
      return `${host}:event:${facebookEventMatch[1]}`;
    }
    const pathParts = path.split("/").filter(Boolean).slice(0, 3);
    return `${host}:${pathParts.join("/")}`;
  } catch {
    return null;
  }
}

function getUrlDomain(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function getSourceOwnerNames(source?: EventSource) {
  return Array.from(
    new Set(
      [source?.organizer?.name, source?.organizer_location?.name]
        .filter(Boolean)
        .map((value) => normalizeDuplicateText(value)),
    ),
  ).filter(Boolean);
}

function getEventOwnerNames(event: {
  event_organizers?: Array<{
    organizer?: { name?: string | null } | null;
    location?: { name?: string | null } | null;
  }> | null;
}) {
  return Array.from(
    new Set(
      (event.event_organizers || [])
        .flatMap((item) => [item.organizer?.name, item.location?.name])
        .filter(Boolean)
        .map((value) => normalizeDuplicateText(value)),
    ),
  ).filter(Boolean);
}

function getDayDistance(left: string | null, right: string | null) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(leftDate.getTime() - rightDate.getTime()) / (24 * 60 * 60 * 1000);
}

function buildTimeRange(input: {
  start: string | null | undefined;
  end?: string | null | undefined;
  fallbackDurationMs: number;
}) {
  if (!input.start) return null;
  const startDate = new Date(input.start);
  if (Number.isNaN(startDate.getTime())) return null;
  const endDate = input.end ? new Date(input.end) : null;
  if (endDate && !Number.isNaN(endDate.getTime()) && endDate >= startDate) {
    return { start: startDate, end: endDate };
  }
  return { start: startDate, end: new Date(startDate.getTime() + input.fallbackDurationMs) };
}

function rangesOverlap(left: { start: Date; end: Date }, right: { start: Date; end: Date }) {
  return left.start <= right.end && right.start <= left.end;
}

export function findOpportunityDuplicateCandidate(
  opportunity: EventOpportunity,
  events: Array<{
    id: string;
    title: string | null;
    date: string | null;
    end_date?: string | null;
    location_id: string | null;
    external_url?: string | null;
    instagram_url?: string | null;
    facebook_url?: string | null;
    location?: { name?: string | null } | null;
    event_organizers?: Array<{
      organizer?: { name?: string | null } | null;
      location?: { name?: string | null } | null;
    }> | null;
  }>,
  context?: { source?: EventSource; sourceUrl?: string | null },
): IntakeDuplicateCandidate | null {
  const opportunityTitle = normalizeDuplicateText(opportunity.raw_title);
  if (!opportunityTitle) return null;

  const opportunityLocation = normalizeDuplicateText(opportunity.detected_location);
  const opportunityLocationTokens = tokenizeDuplicateText(opportunity.detected_location);
  const opportunityNumericTokens = getNumericTokens(opportunity.raw_title);
  const sourceOwners = getSourceOwnerNames(context?.source);
  const sourceComparableUrl = normalizeComparableUrl(context?.sourceUrl || opportunity.source_url || context?.source?.url);
  const sourceDomain = getUrlDomain(context?.sourceUrl || opportunity.source_url || context?.source?.url);
  const sourceUrlIdentity = getUrlIdentity(context?.sourceUrl || opportunity.source_url || context?.source?.url);
  let best: IntakeDuplicateCandidate | null = null;

  for (const event of events) {
    const eventTitle = normalizeDuplicateText(event.title);
    if (!eventTitle) continue;
    const opportunityRange = buildTimeRange({
      start: opportunity.detected_date,
      fallbackDurationMs: 2 * 60 * 60 * 1000,
    });
    const eventRange = buildTimeRange({
      start: event.date,
      end: event.end_date ?? null,
      fallbackDurationMs: 4 * 60 * 60 * 1000,
    });
    if (!opportunityRange || !eventRange || !rangesOverlap(opportunityRange, eventRange)) {
      continue;
    }

    let score = 0;
    const reasons: string[] = [];
    const titleSimilarity = computeTitleSimilarity(opportunityTitle, eventTitle);
    if (titleSimilarity >= 0.95) {
      score += 62;
      reasons.push("titre");
    } else if (titleSimilarity >= 0.8) {
      score += 50;
      reasons.push("titre");
    } else if (titleSimilarity >= 0.65) {
      score += 36;
      reasons.push("titre");
    } else if (titleSimilarity >= 0.5) {
      score += 24;
      reasons.push("titre");
    } else {
      continue;
    }

    const days = getDayDistance(opportunity.detected_date, event.date);
    if (days <= 1) {
      score += 28;
      reasons.push("date");
    } else if (days <= 3) {
      score += 22;
      reasons.push("date");
    } else if (days <= 7) {
      score += 14;
      reasons.push("date");
    } else if (days <= 14) {
      score += 8;
      reasons.push("date");
    } else if (days > 45 && days < Number.POSITIVE_INFINITY) {
      score -= 12;
    }

    const eventLocation = normalizeDuplicateText(event.location?.name);
    const eventLocationTokens = tokenizeDuplicateText(event.location?.name);
    const eventOrganizerLocationTokens = tokenizeDuplicateText(
      (event.event_organizers || [])
        .map((entry) => entry.location?.name)
        .filter(Boolean)
        .join(" "),
    );
    if (opportunityLocation && eventLocation) {
      if (opportunityLocation === eventLocation) {
        score += 20;
        reasons.push("lieu");
      } else {
        const locationSimilarity = getTokenOverlapRatio(opportunityLocationTokens, eventLocationTokens);
        if (locationSimilarity >= 0.75) {
          score += 15;
          reasons.push("lieu");
        } else if (locationSimilarity >= 0.45) {
          score += 9;
          reasons.push("lieu");
        } else if (locationSimilarity <= 0.15) {
          score -= 8;
        }
      }
    }
    if (opportunityLocationTokens.length > 0 && eventOrganizerLocationTokens.length > 0) {
      const organizerLocationSimilarity = getTokenOverlapRatio(
        opportunityLocationTokens,
        eventOrganizerLocationTokens,
      );
      if (organizerLocationSimilarity >= 0.75) {
        score += 10;
        reasons.push("lieu");
      } else if (organizerLocationSimilarity >= 0.45) {
        score += 6;
        reasons.push("lieu");
      }
    }

    const eventNumericTokens = getNumericTokens(event.title);
    const numericOverlap = getNumericOverlap(opportunityNumericTokens, eventNumericTokens);
    if (numericOverlap !== null) {
      if (numericOverlap === 0) {
        score -= 20;
      } else if (numericOverlap >= 0.5) {
        score += 10;
        reasons.push("edition");
      } else if (numericOverlap >= 0.25) {
        score += 4;
        reasons.push("edition");
      }
    }

    const eventComparableUrls = [
      normalizeComparableUrl(event.external_url),
      normalizeComparableUrl(event.instagram_url),
      normalizeComparableUrl(event.facebook_url),
    ].filter(Boolean) as string[];
    const eventUrlIdentities = [
      getUrlIdentity(event.external_url),
      getUrlIdentity(event.instagram_url),
      getUrlIdentity(event.facebook_url),
    ].filter(Boolean) as string[];
    const eventDomains = [
      getUrlDomain(event.external_url),
      getUrlDomain(event.instagram_url),
      getUrlDomain(event.facebook_url),
    ].filter(Boolean) as string[];

    const exactUrlMatch =
      Boolean(sourceComparableUrl) && eventComparableUrls.includes(sourceComparableUrl as string);
    const identityUrlMatch =
      Boolean(sourceUrlIdentity) && eventUrlIdentities.includes(sourceUrlIdentity as string);

    if (exactUrlMatch) {
      score += 35;
      reasons.push("url");
    } else if (identityUrlMatch) {
      score += 28;
      reasons.push("url");
    } else if (sourceDomain && eventDomains.includes(sourceDomain)) {
      score += 10;
      reasons.push("domaine");
    }

    const eventOwners = getEventOwnerNames(event);
    if (sourceOwners.length > 0 && eventOwners.length > 0) {
      const exactOwner = sourceOwners.some((owner) => eventOwners.includes(owner));
      const ownerSimilarity = sourceOwners.reduce((bestSimilarity, owner) => {
        const ownerTokens = tokenizeDuplicateText(owner);
        const current = eventOwners.reduce((bestForOwner, eventOwner) => {
          const eventOwnerTokens = tokenizeDuplicateText(eventOwner);
          return Math.max(bestForOwner, getTokenOverlapRatio(ownerTokens, eventOwnerTokens));
        }, 0);
        return Math.max(bestSimilarity, current);
      }, 0);
      if (exactOwner) {
        score += 18;
        reasons.push("orga");
      } else if (ownerSimilarity >= 0.7) {
        score += 13;
        reasons.push("orga");
      } else if (ownerSimilarity >= 0.45) {
        score += 7;
        reasons.push("orga");
      } else {
        score -= 8;
      }
    }

    if (
      days > 120 &&
      days < Number.POSITIVE_INFINITY &&
      !exactUrlMatch &&
      !identityUrlMatch &&
      titleSimilarity < 0.9
    ) {
      score -= 18;
    }

    if (
      titleSimilarity < 0.65 &&
      !exactUrlMatch &&
      !identityUrlMatch &&
      !(sourceDomain && eventDomains.includes(sourceDomain))
    ) {
      continue;
    }

    const minimalScore =
      exactUrlMatch || identityUrlMatch
        ? 44
        : titleSimilarity >= 0.9 && days <= 7
          ? 52
          : 62;
    if (score < minimalScore) continue;

    const candidate: IntakeDuplicateCandidate = {
      eventId: event.id,
      title: event.title || "Événement existant",
      date: event.date || "",
      locationName: event.location?.name || null,
      score,
      reasons,
    };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}
