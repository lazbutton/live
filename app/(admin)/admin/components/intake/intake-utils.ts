"use client";

import {
  type EventOpportunity,
  type EventSource,
  type IntakeDuplicateCandidate,
  type OpportunityStatus,
  type SourcePriority,
  type SourceStatus,
  type SourceType,
  sourceTypeOptions,
  opportunityStatusOptions,
  sourceStatusOptions,
} from "./intake-types";
import { formatDateWithoutTimezone } from "@/lib/date-utils";

export const intakeUi = {
  panelCard: "flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm",
  panelHeader: "bg-muted/20 px-3 py-2.5",
  panelTitle: "text-sm font-semibold tracking-tight",
  panelBody: "min-h-0 flex-1 overflow-y-auto p-2",
  sectionCard: "rounded-xl border border-border/70 bg-muted/10 p-2",
  compactBadge: "h-5 px-1.5 py-0 text-[10px]",
  subtleMeta: "text-[11px] text-muted-foreground",
  controlButton: "h-8 px-2 text-[11px]",
  input: "h-9",
  inputStrong: "h-10 border-primary/20",
};

export function getEntityImageUrl(
  entity: { logo_url?: string | null; icon_url?: string | null; image_url?: string | null } | null | undefined,
) {
  return entity?.logo_url || entity?.icon_url || entity?.image_url || null;
}

export function getEntityInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function getSourcePrimaryEntity(source: EventSource) {
  if (source.organizer) {
    return { entity: source.organizer, label: "Organisateur" };
  }
  if (source.organizer_location) {
    return { entity: source.organizer_location, label: "Lieu organisateur" };
  }
  return null;
}

export function formatDateTime(value: string | null) {
  if (!value) return "Jamais";
  return formatDateWithoutTimezone(value, "dd MMM, HH:mm");
}

export function formatDateOnly(value: string | null) {
  if (!value) return "Non planifie";
  return formatDateWithoutTimezone(value, "dd MMM yyyy");
}

export function formatDurationShort(value: number | null | undefined) {
  if (value == null || Number.isNaN(value) || value < 0) return "0m";
  const totalSeconds = Math.round(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.max(1, totalSeconds)}s`;
}

export function toDatetimeIso(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function computeAverageScanMinutes(input: {
  currentAverageMinutes: number;
  currentScanCount: number;
  latestDurationSeconds: number;
}) {
  const latestMinutes = Math.max(1, Math.round(input.latestDurationSeconds / 60));
  if (input.currentScanCount <= 0) return latestMinutes;
  const weighted =
    (input.currentAverageMinutes * input.currentScanCount + latestMinutes) /
    (input.currentScanCount + 1);
  return Math.max(1, Math.round(weighted));
}

export function computeSourceNoveltyScore(input: {
  scanCount: number;
  discoveryCount: number;
  averageScanMinutes: number;
  lastFoundAt: string | null;
}) {
  if (input.scanCount <= 0) return 50;

  const discoveryRate = input.discoveryCount / Math.max(1, input.scanCount);
  let score = 20 + Math.round(discoveryRate * 60);

  if (input.lastFoundAt) {
    const daysSinceFound =
      (Date.now() - new Date(input.lastFoundAt).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceFound <= 7) score += 18;
    else if (daysSinceFound <= 30) score += 10;
    else if (daysSinceFound <= 90) score += 4;
    else score -= 8;
  }

  if (input.averageScanMinutes <= 3) score += 14;
  else if (input.averageScanMinutes <= 6) score += 8;
  else if (input.averageScanMinutes >= 12) score -= 10;
  else if (input.averageScanMinutes >= 8) score -= 4;

  return Math.max(0, Math.min(100, score));
}

export function isSourceDue(source: EventSource) {
  if (source.status !== "active") return false;
  if (!source.next_scan_at) return true;
  return new Date(source.next_scan_at).getTime() <= Date.now();
}

export function isSourceLate(source: EventSource) {
  if (!source.next_scan_at || source.status !== "active") return false;
  const nextScan = new Date(source.next_scan_at).getTime();
  return nextScan < Date.now() - 24 * 60 * 60 * 1000;
}

export function sourcePriorityWeight(priority: SourcePriority) {
  return { p0: 4, p1: 3, p2: 2, p3: 1 }[priority];
}

export function getSourcePrioritySuggestion(source: EventSource) {
  const noveltyScore =
    source.novelty_score ||
    computeSourceNoveltyScore({
      scanCount: source.scan_count,
      discoveryCount: source.discovery_count,
      averageScanMinutes: source.average_scan_minutes,
      lastFoundAt: source.last_found_at,
    });

  let priority: SourcePriority = "p3";
  let scanFrequencyDays = 14;

  if (noveltyScore >= 80) {
    priority = "p0";
    scanFrequencyDays = 1;
  } else if (noveltyScore >= 62) {
    priority = "p1";
    scanFrequencyDays = 3;
  } else if (noveltyScore >= 40) {
    priority = "p2";
    scanFrequencyDays = 7;
  }

  return {
    priority,
    scanFrequencyDays,
    noveltyScore,
    differs:
      priority !== source.priority || scanFrequencyDays !== source.scan_frequency_days,
    label: `Reco ${priority.toUpperCase()} · ${scanFrequencyDays}j`,
  };
}

export function computePriorityScore(input: {
  source?: EventSource;
  detectedDate: string;
  missingFields: string[];
  confidenceScore: number;
}) {
  let score = 35;
  if (input.source) {
    score += sourcePriorityWeight(input.source.priority) * 10;
  }
  if (input.detectedDate) {
    const eventDate = new Date(input.detectedDate);
    const daysUntilEvent = Math.ceil((eventDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysUntilEvent <= 7) score += 25;
    else if (daysUntilEvent <= 21) score += 12;
  }
  score += Math.round(input.confidenceScore / 10);
  score -= input.missingFields.length * 7;
  return Math.max(0, Math.min(100, score));
}

export function parseMissingFields(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getSourceTypeLabel(type: SourceType) {
  return sourceTypeOptions.find((option) => option.value === type)?.label ?? type;
}

export function getPriorityLabel(priority: SourcePriority) {
  return priority.toUpperCase();
}

export function getSourceStatusLabel(status: SourceStatus) {
  return sourceStatusOptions.find((option) => option.value === status)?.label ?? status;
}

export function getOpportunityStatusLabel(status: OpportunityStatus) {
  return opportunityStatusOptions.find((option) => option.value === status)?.label ?? status;
}

export function uniqueSelectOptions(options: Array<{ value: string; label: string }>) {
  return Array.from(new Map(options.map((option) => [option.value, option])).values());
}

export function scoreTone(score: number) {
  if (score >= 75) return "text-emerald-600";
  if (score >= 45) return "text-amber-600";
  return "text-destructive";
}

export function sourceSort(left: EventSource, right: EventSource) {
  const leftDue = isSourceDue(left);
  const rightDue = isSourceDue(right);
  if (leftDue !== rightDue) return leftDue ? -1 : 1;

  const priorityDelta = sourcePriorityWeight(right.priority) - sourcePriorityWeight(left.priority);
  if (priorityDelta !== 0) return priorityDelta;

  const leftNext = left.next_scan_at ? new Date(left.next_scan_at).getTime() : 0;
  const rightNext = right.next_scan_at ? new Date(right.next_scan_at).getTime() : 0;
  return leftNext - rightNext;
}

export function getSourceDomainLabel(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function getOpportunityMissingSummary(opportunity: EventOpportunity) {
  if (opportunity.missing_fields.length === 0) return "Complet";
  if (opportunity.missing_fields.length === 1) return `Manque ${opportunity.missing_fields[0]}`;
  return `${opportunity.missing_fields.length} champs manquants`;
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
      title: event.title || "Evenement existant",
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
