"use client";

import * as React from "react";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { flushSync } from "react-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  Palette,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase/client";
import {
  formatDateWithoutTimezone,
  fromDatetimeLocal,
  parseDateWithoutTimezone,
} from "@/lib/date-utils";
import { fetchAdminProxiedImageObjectUrl, isHttpImageUrl } from "@/lib/events/remote-image";
import { cn } from "@/lib/utils";
import {
  createPosterData,
  defaultPosterTheme,
  EventPoster,
  exportPosterAsImage,
  extractDominantColors,
} from "@/lib/social-visuals/reference-poster";
import type { PosterData } from "@/lib/social-visuals/reference-poster";

type CategoryOption = {
  id: string;
  name: string;
};

type TagOption = {
  id: string;
  name: string;
};

type ShareLocation = {
  id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  city?: { id: string; label: string } | null;
};

type ShareRoom = {
  id: string;
  name: string;
};

type ShareOrganizerLink = {
  organizer?: { id: string; name: string } | null;
  location?: { id: string; name: string } | null;
};

type ShareEvent = {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  category: string | null;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  is_pay_what_you_want: boolean;
  image_url: string | null;
  tag_ids?: string[] | null;
  location?: ShareLocation | null;
  room?: ShareRoom | null;
  event_organizers?: ShareOrganizerLink[];
};

type RawNestedRelation<T> = T | T[] | null | undefined;

type RawShareLocation = Omit<ShareLocation, "city"> & {
  city?: RawNestedRelation<{ id: string; label: string }>;
};

type RawShareOrganizerLink = {
  organizer?: RawNestedRelation<{ id: string; name: string }>;
  location?: RawNestedRelation<{ id: string; name: string }>;
};

type RawShareEvent = Omit<ShareEvent, "location" | "room" | "event_organizers"> & {
  location?: RawNestedRelation<RawShareLocation>;
  room?: RawNestedRelation<ShareRoom>;
  event_organizers?: RawShareOrganizerLink[] | null;
};

type EventAssetsState = {
  failed: boolean;
  isLoading: boolean;
  palette: string[];
  resolvedImageSrc: string;
};

type ExportPosterPayload = {
  backgroundColor: string;
  posterData: PosterData;
  signature: string;
};

type WeekOption = {
  label: string;
  value: string;
};

type ViewFilter = "all" | "selected" | "ready" | "attention";

const POSTER_WIDTH = 960;
const PREVIEW_SCALE = 0.2;
const ASSET_CONCURRENCY = 4;
const WEEK_OPTIONS_RADIUS = 10;
const FIXED_BACKGROUND_SWATCHES = ["#ffffff", "#000000"] as const;

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function normalizeSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return values.filter((value, index, array): value is string => {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return (
      array.findIndex(
        (candidate) => candidate?.trim().toLowerCase() === trimmed.toLowerCase(),
      ) === index
    );
  });
}

function wrapPosterTitle(title: string) {
  const clean = title.replace(/\s+/g, " ").trim();
  if (!clean) return "OUTLIVE";

  const words = clean.split(" ");
  if (words.length <= 3 && clean.length <= 28) {
    return clean;
  }

  const lines: string[] = [];
  let currentLine = "";
  const maxCharsPerLine = clean.length > 40 ? 16 : 18;
  let nextWordIndex = 0;

  while (nextWordIndex < words.length && lines.length < 3) {
    const word = words[nextWordIndex] ?? "";
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxCharsPerLine || currentLine.length === 0) {
      currentLine = candidate;
      nextWordIndex += 1;
      continue;
    }

    lines.push(currentLine);
    currentLine = "";
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  const remainingWords = words.slice(nextWordIndex);
  if (remainingWords.length > 0 && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1]} ${remainingWords.join(" ")}`.trim();
  }

  return lines
    .slice(0, 3)
    .map((line) => line.trim())
    .join("\n");
}

function capitalizeFirst(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatPosterDisplayDate(date: Date) {
  const weekday = capitalizeFirst(format(date, "EEEE", { locale: fr }));
  const month = capitalizeFirst(format(date, "MMMM", { locale: fr }));
  return `${weekday} ${format(date, "d", { locale: fr })} ${month} ${format(date, "yyyy", {
    locale: fr,
  })}`;
}

function formatPosterPriceNumber(value: number) {
  if (value === Math.round(value)) {
    return value.toFixed(0);
  }

  return value
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
}

function formatPosterPriceLabel(event: ShareEvent) {
  if (event.is_pay_what_you_want) {
    return "Prix libre";
  }

  const explicitMin = event.price_min;
  const explicitMax = event.price_max;
  const legacyPrice = event.price;
  const minValue =
    typeof explicitMin === "number"
      ? explicitMin
      : typeof legacyPrice === "number"
        ? legacyPrice
        : null;
  const maxValue =
    typeof explicitMax === "number" && minValue !== null && explicitMax > minValue
      ? explicitMax
      : null;

  if (minValue === null || minValue <= 0) {
    return "Gratuit";
  }

  if (maxValue !== null) {
    return `${formatPosterPriceNumber(minValue)} à ${formatPosterPriceNumber(maxValue)}€`;
  }

  return `${formatPosterPriceNumber(minValue)}€`;
}

function formatCompactPosterDate(date: Date) {
  const month = format(date, "MMM", { locale: fr }).replace(/\.$/, "");
  return `${format(date, "d", { locale: fr })} ${month}.`;
}

function formatCompactPosterTime(date: Date, options?: { trimLeadingZero?: boolean }) {
  return format(date, options?.trimLeadingZero ? "H'h'mm" : "HH'h'mm", { locale: fr });
}

function formatPosterTopDate(event: ShareEvent) {
  const start = parseDateWithoutTimezone(event.date);

  if (!start) {
    return "Date a confirmer";
  }

  return formatPosterDisplayDate(start);
}

function formatDoorTime(event: ShareEvent) {
  const start = parseDateWithoutTimezone(event.date);
  const end = parseDateWithoutTimezone(event.end_date);

  if (!start) {
    return "Horaires a venir";
  }

  if (!end) {
    return `${formatCompactPosterDate(start)} · ${formatCompactPosterTime(start)}`;
  }

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const durationMs = end.getTime() - start.getTime();

  if (sameDay) {
    return `${formatCompactPosterDate(start)} · ${formatCompactPosterTime(start)}-${formatCompactPosterTime(end)}`;
  }

  if (durationMs > 0 && durationMs < 24 * 60 * 60 * 1000) {
    return `${formatCompactPosterDate(start)} · ${formatCompactPosterTime(start)} - ${formatCompactPosterTime(end, {
      trimLeadingZero: true,
    })}`;
  }

  return `${formatCompactPosterDate(start)} · ${formatCompactPosterTime(start)}\n${formatCompactPosterDate(end)} · ${formatCompactPosterTime(end)}`;
}

function resolveCategoryLabel(event: ShareEvent, categories: CategoryOption[]) {
  if (!event.category) {
    return "Evenement";
  }

  const match = categories.find(
    (category) =>
      category.id === event.category ||
      category.name.trim().toLowerCase() === event.category?.trim().toLowerCase(),
  );

  return match?.name ?? event.category;
}

function resolveVenueAddress(event: ShareEvent) {
  const cityLabel = event.location?.city?.label?.trim();
  const addressLines = (event.location?.address ?? "")
    .split(/\n|,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const hasCityInAddress =
    cityLabel !== undefined &&
    cityLabel.length > 0 &&
    addressLines.some((line) => line.toLowerCase().includes(cityLabel.toLowerCase()));

  const lines = hasCityInAddress ? addressLines : [...addressLines, cityLabel].filter(Boolean);
  return lines.join("\n") || "Adresse a confirmer";
}

function resolveFooterSignature(event: ShareEvent) {
  const venueName = event.location?.name?.trim().toLowerCase();
  const organizerNames = uniqueStrings(
    (event.event_organizers ?? []).map((entry) => entry.organizer?.name ?? entry.location?.name),
  ).filter((name) => {
    if (!venueName) {
      return true;
    }
    return name.trim().toLowerCase() !== venueName;
  });

  if (organizerNames.length > 0) {
    return organizerNames.slice(0, 3).join(" · ");
  }
  return "";
}

function getEventImageSource(event: ShareEvent) {
  return event.image_url || event.location?.image_url || "";
}

function resolveTagSummary(event: ShareEvent, tags: TagOption[]) {
  const tagNames = uniqueStrings(
    (event.tag_ids ?? []).map((tagId) => tags.find((tag) => tag.id === tagId)?.name),
  );
  return tagNames.join(", ");
}

function isShareEventPast(event: ShareEvent, referenceDate: Date) {
  const endDate = parseDateWithoutTimezone(event.end_date);
  if (endDate) {
    return endDate.getTime() < referenceDate.getTime();
  }

  const startDate = parseDateWithoutTimezone(event.date);
  if (!startDate) {
    return false;
  }

  return startDate.getTime() < referenceDate.getTime();
}

function buildPosterData(
  event: ShareEvent,
  categories: CategoryOption[],
  tags: TagOption[],
): PosterData {
  const categoryLabel = resolveCategoryLabel(event, categories);
  const priceLabel = formatPosterPriceLabel(event);
  const tagsLabel = resolveTagSummary(event, tags);

  return createPosterData({
    topDate: formatPosterTopDate(event),
    eventTitle: wrapPosterTitle(event.title),
    heroImage: {
      alt: event.title,
      focusX: 50,
      focusY: 50,
      src: "",
    },
    venue: {
      name: event.location?.name?.trim() || "Lieu a confirmer",
      address: resolveVenueAddress(event),
    },
    door: {
      label: "Horaires",
      time: formatDoorTime(event),
    },
    details: [
      {
        left: categoryLabel,
        leftSecondary: priceLabel,
        right: tagsLabel,
        leftStyle: "pill",
        rightStyle: "plain",
      },
    ],
    footer: resolveFooterSignature(event),
  });
}

function buildPosterFileName(event: ShareEvent) {
  const normalized = `${formatDateWithoutTimezone(event.date, "yyyy-MM-dd")}-${event.title}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "visuel-outlive";
}

async function runTasksWithConcurrency(
  tasks: Array<() => Promise<void>>,
  concurrency: number,
) {
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < tasks.length) {
      const taskIndex = currentIndex;
      currentIndex += 1;
      const task = tasks[taskIndex];
      if (!task) {
        return;
      }
      await task();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker(),
  );

  await Promise.all(workers);
}

function getCurrentWeekRange() {
  const today = startOfLocalDay(new Date());
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const nextWeekStart = addDays(weekStart, 7);
  return { nextWeekStart, weekStart };
}

function buildWeekValue(weekStart: Date) {
  return format(weekStart, "yyyy-MM-dd");
}

function buildWeekRange(weekStart: Date) {
  const normalizedWeekStart = startOfWeek(startOfLocalDay(weekStart), { weekStartsOn: 1 });
  return {
    nextWeekStart: addDays(normalizedWeekStart, 7),
    weekStart: normalizedWeekStart,
  };
}

function parseWeekValue(value: string) {
  return buildWeekRange(parseDateWithoutTimezone(value) ?? new Date()).weekStart;
}

function formatWeekRangeLabel(weekStart: Date, nextWeekStart: Date) {
  const weekEnd = addDays(nextWeekStart, -1);
  return `${format(weekStart, "d MMM", { locale: fr })} - ${format(weekEnd, "d MMM yyyy", {
    locale: fr,
  })}`;
}

function buildWeekOptions(centerWeekStart: Date, currentWeekStart: Date): WeekOption[] {
  return Array.from({ length: WEEK_OPTIONS_RADIUS * 2 + 1 }, (_, index) => {
    const offset = index - WEEK_OPTIONS_RADIUS;
    const range = buildWeekRange(addWeeks(centerWeekStart, offset));
    const isCurrent = buildWeekValue(range.weekStart) === buildWeekValue(currentWeekStart);

    return {
      label: `${formatWeekRangeLabel(range.weekStart, range.nextWeekStart)}${
        isCurrent ? " · actuelle" : ""
      }`,
      value: buildWeekValue(range.weekStart),
    };
  });
}

function resolveBackgroundSwatches(palette: string[]) {
  return uniqueStrings([...palette, ...FIXED_BACKGROUND_SWATCHES]);
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildSearchIndex(event: ShareEvent, categories: CategoryOption[], tags: TagOption[]) {
  return normalizeSearchValue(
    [
      event.title,
      resolveCategoryLabel(event, categories),
      resolveTagSummary(event, tags),
      event.location?.name,
      event.location?.address,
      event.location?.city?.label,
      resolveFooterSignature(event),
      formatDateWithoutTimezone(event.date, "EEEE d MMM yyyy HH:mm"),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const role = target.getAttribute("role");
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    role === "textbox" ||
    role === "combobox"
  );
}

function toStoredDateBoundary(date: Date) {
  return fromDatetimeLocal(format(date, "yyyy-MM-dd'T'HH:mm"));
}

function normalizeExportColorToken(color: string) {
  return color.trim().toLowerCase();
}

function buildExportRenderSignature(eventId: string, backgroundColor: string, posterData: PosterData) {
  return JSON.stringify([
    eventId,
    normalizeExportColorToken(backgroundColor),
    posterData.topDate,
    posterData.eventTitle,
    posterData.heroImage.src,
  ]);
}

async function waitForAnimationFrames(frameCount = 2) {
  await new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      requestAnimationFrame(() => {
        if (remaining <= 1) {
          resolve();
          return;
        }
        step(remaining - 1);
      });
    };

    step(Math.max(frameCount, 1));
  });
}

async function waitForPosterCaptureReady(options?: {
  expectedBackgroundColor?: string;
  expectedHeroImageSrc?: string;
  expectedSignature?: string;
  getElement?: () => HTMLElement | null;
  timeoutMs?: number;
}) {
  const {
    expectedBackgroundColor,
    expectedHeroImageSrc,
    expectedSignature,
    getElement,
    timeoutMs = 2500,
  } = options ?? {};

  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font loading errors and let html2canvas use the current fallback.
    }
  }

  const normalizedExpectedBackground = expectedBackgroundColor
    ? normalizeExportColorToken(expectedBackgroundColor)
    : undefined;
  const deadline =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) + timeoutMs;

  while (true) {
    const element = getElement?.() ?? null;
    const signatureMatches =
      expectedSignature === undefined ||
      element?.getAttribute("data-export-signature") === expectedSignature;
    const backgroundMatches =
      normalizedExpectedBackground === undefined ||
      normalizeExportColorToken(element?.getAttribute("data-export-bg-card") ?? "") ===
        normalizedExpectedBackground;
    const heroImageMatches =
      expectedHeroImageSrc === undefined ||
      (element?.getAttribute("data-export-hero-src") ?? "") === expectedHeroImageSrc;

    if (element && signatureMatches && backgroundMatches && heroImageMatches) {
      await waitForAnimationFrames(3);
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 40);
      });
      await waitForAnimationFrames(2);
      return element;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now >= deadline) {
      break;
    }

    await waitForAnimationFrames(1);
  }

  await waitForAnimationFrames(3);
  return getElement?.() ?? null;
}

async function preloadImageSource(src: string) {
  if (!src) {
    return;
  }

  await new Promise<void>((resolve) => {
    const image = new Image();

    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }

    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;

    if ("decode" in image) {
      image
        .decode()
        .then(() => resolve())
        .catch(() => {
          // Fall back to onload/onerror for browsers that reject decode().
        });
    }
  });
}

function WeeklyPosterCard(props: {
  assets: EventAssetsState | undefined;
  backgroundColor: string;
  categoryLabel: string;
  event: ShareEvent;
  isSelected: boolean;
  onBackgroundChange: (eventId: string, color: string) => void;
  onToggleSelection: (eventId: string) => void;
  posterData: PosterData;
}) {
  const {
    assets,
    backgroundColor,
    categoryLabel,
    event,
    isSelected,
    onBackgroundChange,
    onToggleSelection,
    posterData,
  } = props;

  const previewWidth = Math.round(POSTER_WIDTH * PREVIEW_SCALE);
  const previewHeight = Math.round(((POSTER_WIDTH * 4) / 3) * PREVIEW_SCALE);
  const palette = assets?.palette ?? [];
  const backgroundSwatches = resolveBackgroundSwatches(palette);

  const hasSourceImage = Boolean(getEventImageSource(event));
  const dateLabel = formatDateWithoutTimezone(event.date, "EEE d MMM • HH:mm");
  const venueLabel = event.location?.name?.trim();
  const showImageWarning = !hasSourceImage || assets?.failed;
  const isAssetLoading = assets?.isLoading === true;

  return (
    <Card
      className={cn(
        "cursor-pointer overflow-hidden border-border/60 bg-card/90 shadow-none transition-colors hover:border-primary/40 hover:bg-primary/[0.02]",
        isSelected && "border-primary/70 bg-primary/[0.03]",
      )}
      onClick={() => onToggleSelection(event.id)}
    >
      <CardHeader className="space-y-1 px-2.5 pb-2 pt-2.5">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(event.id)}
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            aria-label={`Selectionner ${event.title}`}
            className="mt-0.5 h-6 w-6 border-2 shadow-md data-[state=unchecked]:border-foreground/25 data-[state=unchecked]:bg-muted/90 dark:data-[state=unchecked]:border-white/45 dark:data-[state=unchecked]:bg-white/[0.14] dark:data-[state=checked]:border-white dark:data-[state=checked]:bg-white dark:data-[state=checked]:text-black dark:data-[state=indeterminate]:border-white dark:data-[state=indeterminate]:bg-white dark:data-[state=indeterminate]:text-black"
          />
          <div className="min-w-0 flex-1">
            <CardTitle className="line-clamp-2 text-[13px] leading-[1.15]">
              {event.title}
            </CardTitle>
            <CardDescription className="mt-0.5 line-clamp-2 text-[11px] leading-tight">
              {dateLabel}
              {venueLabel ? ` · ${venueLabel}` : ""}
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="max-w-[8.5rem] truncate px-1.5 py-0 text-[10px]">
            {categoryLabel}
          </Badge>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {isAssetLoading ? (
              <>
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Chargement</span>
              </>
            ) : showImageWarning ? (
              <>
                <ImageIcon className="h-3 w-3" />
                <span>Placeholder</span>
              </>
            ) : (
              <span>Pret</span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 px-2.5 pb-2.5 pt-0">
        <div className="rounded-lg border border-border/50 bg-transparent p-0">
          <div
            className="mx-auto overflow-hidden rounded-lg"
            style={{
              height: `${previewHeight}px`,
              width: `${previewWidth}px`,
            }}
          >
            <div
              style={{
                height: `${Math.round((POSTER_WIDTH * 4) / 3)}px`,
                transformOrigin: "top left",
                transform: `scale(${PREVIEW_SCALE})`,
                width: `${POSTER_WIDTH}px`,
              }}
            >
              <EventPoster
                data={{
                  ...posterData,
                  heroImage: {
                    ...posterData.heroImage,
                    src: assets?.resolvedImageSrc ?? "",
                  },
                }}
                theme={{ bgCard: backgroundColor }}
                width={POSTER_WIDTH}
              />
            </div>
          </div>
        </div>

        <div className="flex min-h-7 items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Palette className="h-3 w-3 text-muted-foreground" />
            {backgroundSwatches.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {backgroundSwatches.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded-full transition hover:scale-105"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onBackgroundChange(event.id, color);
                    }}
                    aria-label={`Choisir ${color} pour ${event.title}`}
                    aria-pressed={backgroundColor.toLowerCase() === color.toLowerCase()}
                    title={`Fond ${color}`}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 rounded-full border",
                        backgroundColor.toLowerCase() === color.toLowerCase()
                          ? "border-foreground ring-2 ring-foreground/20"
                          : "border-border",
                      )}
                      style={{ backgroundColor: color }}
                    />
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground">
                {isAssetLoading ? "Palette..." : "Sans palette"}
              </span>
            )}
          </div>

          {showImageWarning ? (
            <span className="text-[10px] text-muted-foreground">
              {!hasSourceImage ? "Sans image" : "Image indispo"}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function SocialVisualStudio() {
  const currentWeekRange = React.useMemo(() => getCurrentWeekRange(), []);
  const imageCacheRef = React.useRef(new Map<string, string>());
  const imagePromiseCacheRef = React.useRef(new Map<string, Promise<string>>());
  const paletteCacheRef = React.useRef(new Map<string, string[]>());
  const palettePromiseCacheRef = React.useRef(new Map<string, Promise<string[]>>());
  const exportPosterRef = React.useRef<HTMLDivElement | null>(null);
  const loadedWeekValueRef = React.useRef<string | null>(null);

  const [accessToken, setAccessToken] = React.useState<string | null>(null);
  const [backgroundByEventId, setBackgroundByEventId] = React.useState<Record<string, string>>({});
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [eventAssets, setEventAssets] = React.useState<Record<string, EventAssetsState>>({});
  const [events, setEvents] = React.useState<ShareEvent[]>([]);
  const [exportProgressCount, setExportProgressCount] = React.useState(0);
  const [exportPayload, setExportPayload] = React.useState<ExportPosterPayload | null>(null);
  const [exportingEventTitle, setExportingEventTitle] = React.useState<string | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedWeekValue, setSelectedWeekValue] = React.useState(() =>
    buildWeekValue(currentWeekRange.weekStart),
  );
  const [selectedEventIds, setSelectedEventIds] = React.useState<string[]>([]);
  const [tags, setTags] = React.useState<TagOption[]>([]);
  const [viewFilter, setViewFilter] = React.useState<ViewFilter>("all");

  const weekRange = React.useMemo(
    () => buildWeekRange(parseWeekValue(selectedWeekValue)),
    [selectedWeekValue],
  );
  const weekOptions = React.useMemo(
    () => buildWeekOptions(weekRange.weekStart, currentWeekRange.weekStart),
    [currentWeekRange.weekStart, weekRange.weekStart],
  );

  React.useEffect(() => {
    const cachedImageUrls = imageCacheRef.current;
    return () => {
      for (const url of cachedImageUrls.values()) {
        if (url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      }
    };
  }, []);

  const resolveEventImage = React.useCallback(
    async (source: string) => {
      if (!source) return "";

      if (!isHttpImageUrl(source)) {
        return source;
      }

      const cached = imageCacheRef.current.get(source);
      if (cached) {
        return cached;
      }

      const pending = imagePromiseCacheRef.current.get(source);
      if (pending) {
        return pending;
      }

      if (!accessToken) {
        throw new Error("Missing admin session for remote image proxy.");
      }

      const promise = fetchAdminProxiedImageObjectUrl({
        source,
        accessToken,
      })
        .then((objectUrl) => {
          imageCacheRef.current.set(source, objectUrl);
          return objectUrl;
        })
        .finally(() => {
          imagePromiseCacheRef.current.delete(source);
        });

      imagePromiseCacheRef.current.set(source, promise);
      return promise;
    },
    [accessToken],
  );

  const resolvePalette = React.useCallback(
    async (cacheKey: string, resolvedImageSrc: string) => {
      if (!resolvedImageSrc) {
        return [];
      }

      const cached = paletteCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      const pending = palettePromiseCacheRef.current.get(cacheKey);
      if (pending) {
        return pending;
      }

      const promise = extractDominantColors(resolvedImageSrc, {
        colorCount: 6,
        sampleSize: 140,
      })
        .then((palette) => {
          paletteCacheRef.current.set(cacheKey, palette);
          return palette;
        })
        .finally(() => {
          palettePromiseCacheRef.current.delete(cacheKey);
        });

      palettePromiseCacheRef.current.set(cacheKey, promise);
      return promise;
    },
    [],
  );

  const loadWeekData = React.useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [sessionResult, eventsRes, categoriesRes, tagsRes] = await Promise.all([
          supabase.auth.getSession(),
          supabase
            .from("events")
            .select(
              `
                id,
                title,
                date,
                end_date,
                category,
                price,
                price_min,
                price_max,
                is_pay_what_you_want,
                image_url,
                tag_ids,
                location:locations(
                  id,
                  name,
                  address,
                  image_url,
                  city:cities(id, label)
                ),
                room:rooms(id, name),
                event_organizers:event_organizers(
                  organizer:organizers(id, name),
                  location:locations(id, name)
                )
              `,
            )
            .eq("status", "approved")
            .gte("date", toStoredDateBoundary(weekRange.weekStart))
            .lt("date", toStoredDateBoundary(weekRange.nextWeekStart))
            .order("date", { ascending: true }),
          supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
          supabase.from("tags").select("id, name").order("name"),
        ]);

        if (eventsRes.error) throw eventsRes.error;
        if (categoriesRes.error) throw categoriesRes.error;
        if (tagsRes.error) throw tagsRes.error;

        const nextAccessToken = sessionResult.data.session?.access_token ?? null;
        const nextCategories = (categoriesRes.data ?? []) as CategoryOption[];
        const nextTags = (tagsRes.data ?? []) as TagOption[];
        const rawEvents = (eventsRes.data ?? []) as RawShareEvent[];
        const referenceNow = new Date();
        const loadedWeekValue = buildWeekValue(weekRange.weekStart);
        const isWeekChanged = loadedWeekValueRef.current !== loadedWeekValue;
        const nextEvents = rawEvents
          .map<ShareEvent>((event) => ({
            ...event,
            location: (() => {
              const location = normalizeSingleRelation(event.location);
              if (!location) return null;
              return {
                ...location,
                city: normalizeSingleRelation(location.city),
              };
            })(),
            room: normalizeSingleRelation(event.room),
            event_organizers: (event.event_organizers ?? []).map((entry) => ({
              organizer: normalizeSingleRelation(entry.organizer),
              location: normalizeSingleRelation(entry.location),
            })),
          }))
          .filter((event) => !isShareEventPast(event, referenceNow));

        setAccessToken(nextAccessToken);
        setCategories(nextCategories);
        setTags(nextTags);
        setEvents(nextEvents);
        setEventAssets((previous) => {
          const next: Record<string, EventAssetsState> = {};
          for (const event of nextEvents) {
            if (previous[event.id]) {
              next[event.id] = previous[event.id];
            }
          }
          return next;
        });
        setBackgroundByEventId((previous) => {
          const next: Record<string, string> = {};
          for (const event of nextEvents) {
            if (previous[event.id]) {
              next[event.id] = previous[event.id];
            }
          }
          return next;
        });
        setSelectedEventIds((previous) => {
          if (isWeekChanged) {
            return [];
          }

          const validIds = new Set(nextEvents.map((event) => event.id));
          return previous.filter((id) => validIds.has(id));
        });
        loadedWeekValueRef.current = loadedWeekValue;
      } catch (error) {
        console.error("Erreur chargement visuels hebdo:", error);
        toast({
          title: "Impossible de charger les visuels",
          description: "Réessaie dans un instant.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [weekRange.nextWeekStart, weekRange.weekStart],
  );

  React.useEffect(() => {
    void loadWeekData({ silent: loadedWeekValueRef.current !== null });
  }, [loadWeekData]);

  React.useEffect(() => {
    if (events.length === 0) {
      return;
    }

    let isCancelled = false;

    setEventAssets((previous) => {
      const next = { ...previous };
      for (const event of events) {
        next[event.id] = next[event.id] ?? {
          failed: false,
          isLoading: true,
          palette: [],
          resolvedImageSrc: "",
        };
      }
      return next;
    });

    const tasks = events.map((event) => async () => {
      const source = getEventImageSource(event);

      if (!source) {
        if (isCancelled) return;
        setEventAssets((previous) => ({
          ...previous,
          [event.id]: {
            failed: false,
            isLoading: false,
            palette: [],
            resolvedImageSrc: "",
          },
        }));
        return;
      }

      try {
        const resolvedImageSrc = await resolveEventImage(source);
        const palette = await resolvePalette(source, resolvedImageSrc);

        if (isCancelled) {
          return;
        }

        setEventAssets((previous) => ({
          ...previous,
          [event.id]: {
            failed: false,
            isLoading: false,
            palette,
            resolvedImageSrc,
          },
        }));
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error(`Erreur chargement assets visuel ${event.id}:`, error);
        setEventAssets((previous) => ({
          ...previous,
          [event.id]: {
            failed: true,
            isLoading: false,
            palette: [],
            resolvedImageSrc: "",
          },
        }));
      }
    });

    void runTasksWithConcurrency(tasks, ASSET_CONCURRENCY);

    return () => {
      isCancelled = true;
    };
  }, [accessToken, events, resolveEventImage, resolvePalette]);

  const normalizedSearchQuery = React.useMemo(
    () => normalizeSearchValue(searchQuery),
    [searchQuery],
  );
  const selectedIdSet = React.useMemo(() => new Set(selectedEventIds), [selectedEventIds]);
  const selectedWeekLabel = formatWeekRangeLabel(weekRange.weekStart, weekRange.nextWeekStart);
  const currentWeekValue = buildWeekValue(currentWeekRange.weekStart);
  const selectedEvents = React.useMemo(
    () => events.filter((event) => selectedIdSet.has(event.id)),
    [events, selectedIdSet],
  );
  const readyCount = React.useMemo(
    () => events.filter((event) => eventAssets[event.id] && !eventAssets[event.id]?.isLoading).length,
    [eventAssets, events],
  );
  const attentionCount = React.useMemo(
    () =>
      events.filter((event) => {
        const assets = eventAssets[event.id];
        return !getEventImageSource(event) || assets?.failed === true;
      }).length,
    [eventAssets, events],
  );
  const visibleEvents = React.useMemo(
    () =>
      events.filter((event) => {
        const assets = eventAssets[event.id];
        const matchesSearch =
          normalizedSearchQuery.length === 0 ||
          buildSearchIndex(event, categories, tags).includes(normalizedSearchQuery);

        if (!matchesSearch) {
          return false;
        }

        switch (viewFilter) {
          case "selected":
            return selectedIdSet.has(event.id);
          case "ready":
            return Boolean(assets) && !assets.isLoading;
          case "attention":
            return !getEventImageSource(event) || assets?.failed === true;
          default:
            return true;
        }
      }),
    [categories, eventAssets, events, normalizedSearchQuery, selectedIdSet, tags, viewFilter],
  );
  const visibleEventIds = React.useMemo(() => visibleEvents.map((event) => event.id), [visibleEvents]);
  const visibleIdSet = React.useMemo(() => new Set(visibleEventIds), [visibleEventIds]);
  const visibleSelectedCount = React.useMemo(
    () => visibleEvents.filter((event) => selectedIdSet.has(event.id)).length,
    [selectedIdSet, visibleEvents],
  );
  const hiddenSelectedCount = selectedEventIds.length - visibleSelectedCount;
  const readySelectedCount = selectedEvents.filter(
    (event) => eventAssets[event.id] && !eventAssets[event.id]?.isLoading,
  ).length;
  const canExport = selectedEvents.length > 0 && readySelectedCount === selectedEvents.length;
  const allVisibleSelected = visibleEvents.length > 0 && visibleSelectedCount === visibleEvents.length;
  const assetProgressValue = events.length > 0 ? Math.round((readyCount / events.length) * 100) : 0;
  const exportProgressValue =
    selectedEvents.length > 0 ? Math.round((exportProgressCount / selectedEvents.length) * 100) : 0;
  const hasActiveQuickFilter = viewFilter !== "all" || searchQuery.trim().length > 0;
  const quickFilters: Array<{ count: number; label: string; value: ViewFilter }> = [
    { count: events.length, label: "Tous", value: "all" },
    { count: selectedEventIds.length, label: "Selectionnes", value: "selected" },
    { count: readyCount, label: "Prets", value: "ready" },
    { count: attentionCount, label: "A verifier", value: "attention" },
  ];
  const toolbarProgressLabel = isExporting
    ? `Export ${exportProgressCount}/${selectedEvents.length}${
        exportingEventTitle ? ` · ${exportingEventTitle}` : ""
      }`
    : isRefreshing
      ? "Actualisation des visuels..."
      : events.length === 0
        ? "Aucun visuel sur cette semaine"
        : readyCount === events.length
          ? "Tous les visuels sont prets"
          : `Preparation des visuels ${readyCount}/${events.length}`;
  const toolbarProgressMeta = isExporting
    ? `${selectedEvents.length} selectionne(s)`
    : `${visibleSelectedCount}/${visibleEvents.length} visibles selectionne(s)`;
  const toolbarProgressValue = isExporting ? exportProgressValue : assetProgressValue;

  function toggleSelection(eventId: string) {
    setSelectedEventIds((previous) => {
      if (previous.includes(eventId)) {
        return previous.filter((id) => id !== eventId);
      }
      return [...previous, eventId];
    });
  }

  const toggleSelectVisible = React.useCallback(() => {
    setSelectedEventIds((previous) => {
      if (visibleEventIds.length === 0) {
        return previous;
      }

      if (allVisibleSelected) {
        return previous.filter((eventId) => !visibleIdSet.has(eventId));
      }

      const next = new Set(previous);
      for (const eventId of visibleEventIds) {
        next.add(eventId);
      }
      return Array.from(next);
    });
  }, [allVisibleSelected, visibleEventIds, visibleIdSet]);

  function clearSelection() {
    setSelectedEventIds([]);
  }

  const resetQuickFilters = React.useCallback(() => {
    setSearchQuery("");
    setViewFilter("all");
  }, []);

  function setEventBackground(eventId: string, color: string) {
    setBackgroundByEventId((previous) => ({
      ...previous,
      [eventId]: color,
    }));
  }

  const goToPreviousWeek = React.useCallback(() => {
    setSelectedWeekValue(buildWeekValue(subWeeks(weekRange.weekStart, 1)));
  }, [weekRange.weekStart]);

  const goToNextWeek = React.useCallback(() => {
    setSelectedWeekValue(buildWeekValue(addWeeks(weekRange.weekStart, 1)));
  }, [weekRange.weekStart]);

  const renderExportPoster = React.useCallback(async (payload: ExportPosterPayload) => {
    flushSync(() => {
      setExportPayload(payload);
    });

    return waitForPosterCaptureReady({
      expectedBackgroundColor: payload.backgroundColor,
      expectedHeroImageSrc: payload.posterData.heroImage.src,
      expectedSignature: payload.signature,
      getElement: () => exportPosterRef.current,
    });
  }, []);

  const handleExportSelected = React.useCallback(async () => {
    if (selectedEvents.length === 0) {
      toast({
        title: "Aucune selection",
        description: "Selectionne au moins un evenement avant l'export.",
        variant: "destructive",
      });
      return;
    }

    if (!canExport) {
      toast({
        title: "Visuels encore en preparation",
        description: "Attends que toutes les images et palettes soient chargees avant l'export.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    setExportProgressCount(0);
    setExportingEventTitle(null);

    try {
      for (const [index, event] of selectedEvents.entries()) {
        const assets = eventAssets[event.id];
        const palette = assets?.palette ?? [];
        const backgroundColor =
          backgroundByEventId[event.id] ?? palette[0] ?? defaultPosterTheme.bgCard;
        const posterData = buildPosterData(event, categories, tags);
        const resolvedImageSrc = assets?.resolvedImageSrc ?? "";
        const exportPosterData = {
          ...posterData,
          heroImage: {
            ...posterData.heroImage,
            src: resolvedImageSrc,
          },
        };
        const exportSignature = buildExportRenderSignature(
          event.id,
          backgroundColor,
          exportPosterData,
        );

        setExportingEventTitle(event.title);
        await preloadImageSource(resolvedImageSrc);
        const posterElement = await renderExportPoster({
          backgroundColor,
          posterData: exportPosterData,
          signature: exportSignature,
        });

        if (!posterElement) {
          setExportProgressCount(index + 1);
          continue;
        }

        await exportPosterAsImage(posterElement, {
          backgroundColor,
          fileName: `${buildPosterFileName(event)}.png`,
        });
        setExportProgressCount(index + 1);
      }

      toast({
        title: "Export termine",
        description: `${selectedEvents.length} visuel(x) telecharge(s).`,
        variant: "success",
      });
    } catch (error) {
      console.error("Erreur export batch visuels:", error);
      toast({
        title: "Export impossible",
        description: "Un ou plusieurs PNG n'ont pas pu etre generes.",
        variant: "destructive",
      });
    } finally {
      flushSync(() => {
        setExportPayload(null);
      });
      setIsExporting(false);
      setExportProgressCount(0);
      setExportingEventTitle(null);
    }
  }, [
    backgroundByEventId,
    canExport,
    categories,
    eventAssets,
    renderExportPoster,
    selectedEvents,
    tags,
  ]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        if (event.key === "Escape" && searchQuery) {
          setSearchQuery("");
        }
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "a") {
        event.preventDefault();
        toggleSelectVisible();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "e") {
        event.preventDefault();
        if (!isExporting && canExport) {
          void handleExportSelected();
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousWeek();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextWeek();
        return;
      }

      if (event.key === "Escape" && hasActiveQuickFilter) {
        event.preventDefault();
        resetQuickFilters();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canExport,
    goToNextWeek,
    goToPreviousWeek,
    handleExportSelected,
    hasActiveQuickFilter,
    isExporting,
    resetQuickFilters,
    searchQuery,
    toggleSelectVisible,
  ]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="ml-auto h-4 w-28" />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <Card key={index}>
              <CardHeader className="space-y-2 px-2.5 pb-2 pt-2.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </CardHeader>
              <CardContent className="space-y-2 px-2.5 pb-2.5 pt-0">
                <Skeleton className="mx-auto h-[250px] w-[190px]" />
                <Skeleton className="h-5 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-4 z-10 space-y-3 rounded-xl border border-border/70 bg-background/90 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="h-8 w-8 px-0"
              onClick={goToPreviousWeek}
              aria-label="Semaine precedente"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            <Select value={selectedWeekValue} onValueChange={setSelectedWeekValue}>
              <SelectTrigger className="h-8 w-[210px] px-3 text-xs sm:w-[240px]">
                <SelectValue placeholder="Choisir une semaine" />
              </SelectTrigger>
              <SelectContent>
                {weekOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              className="h-8 w-8 px-0"
              onClick={goToNextWeek}
              aria-label="Semaine suivante"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>

            {selectedWeekValue !== currentWeekValue ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => setSelectedWeekValue(currentWeekValue)}
              >
                Actuelle
              </Button>
            ) : null}
          </div>

          <div className="relative min-w-[220px] flex-1 xl:max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher un event, lieu ou tag"
              aria-label="Rechercher un visuel"
              className="h-8 pl-8 pr-8 text-xs"
            />
            {searchQuery ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                style={{ transform: "translateY(-50%)" }}
                onClick={() => setSearchQuery("")}
                aria-label="Effacer la recherche"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-8 px-2.5 text-xs"
              onClick={() => void loadWeekData({ silent: true })}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              Actualiser
            </Button>

            {selectedEventIds.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2.5 text-xs"
                onClick={clearSelection}
              >
                Vider ({selectedEventIds.length})
              </Button>
            ) : null}

            <Button
              type="button"
              className="h-8 px-3 text-xs"
              onClick={() => void handleExportSelected()}
              disabled={isExporting || !canExport}
            >
              <Download className="h-3.5 w-3.5" />
              {isExporting ? "Export..." : `Exporter (${selectedEventIds.length})`}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {quickFilters.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                size="sm"
                variant={viewFilter === filter.value ? "secondary" : "outline"}
                className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
                onClick={() => setViewFilter(filter.value)}
              >
                {filter.label}
                <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] leading-none">
                  {filter.count}
                </span>
              </Button>
            ))}

            {hasActiveQuickFilter ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={resetQuickFilters}
              >
                Reinitialiser
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant={allVisibleSelected ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={toggleSelectVisible}
              disabled={visibleEvents.length === 0}
            >
              {allVisibleSelected
                ? `Deselectionner visibles (${visibleSelectedCount})`
                : `Selectionner visibles (${visibleEvents.length})`}
            </Button>

            <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[10px]">
              <CalendarDays className="h-3 w-3" />
              {selectedWeekLabel}
            </Badge>
            <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
              {events.length} total
            </Badge>
            <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
              {visibleEvents.length} visibles
            </Badge>
            <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
              {selectedEventIds.length} sel.
            </Badge>
            {hiddenSelectedCount > 0 ? (
              <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
                +{hiddenSelectedCount} hors vue
              </Badge>
            ) : null}
            {attentionCount > 0 ? (
              <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
                A verifier {attentionCount}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span className="truncate">{toolbarProgressLabel}</span>
              <span className="shrink-0">{toolbarProgressMeta}</span>
            </div>
            <Progress value={toolbarProgressValue} className="h-1.5 bg-secondary/80" />
          </div>

          <div className="text-[11px] text-muted-foreground">
            Astuces: clic carte = selection rapide • Ctrl/Cmd+A = visibles • Ctrl/Cmd+Maj+E =
            exporter
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center">
          <div className="text-sm font-medium">Aucun evenement a venir sur cette semaine</div>
          <div className="mt-1 text-sm text-muted-foreground">{selectedWeekLabel}</div>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center">
          <div className="text-sm font-medium">Aucun visuel ne correspond a ta recherche</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Ajuste les filtres ou reinitialise l'affichage.
          </div>
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="outline" size="sm" onClick={resetQuickFilters}>
              Reinitialiser
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleEvents.map((event) => {
            const assets = eventAssets[event.id];
            const palette = assets?.palette ?? [];
            const backgroundColor =
              backgroundByEventId[event.id] ?? palette[0] ?? defaultPosterTheme.bgCard;
            const posterData = buildPosterData(event, categories, tags);
            const categoryLabel = resolveCategoryLabel(event, categories);

            return (
              <WeeklyPosterCard
                key={event.id}
                assets={assets}
                backgroundColor={backgroundColor}
                categoryLabel={categoryLabel}
                event={event}
                isSelected={selectedIdSet.has(event.id)}
                onBackgroundChange={setEventBackground}
                onToggleSelection={toggleSelection}
                posterData={posterData}
              />
            );
          })}
        </div>
      )}

      <div
        aria-hidden="true"
        style={{
          left: -20000,
          pointerEvents: "none",
          position: "fixed",
          top: 0,
        }}
      >
        {exportPayload ? (
          <EventPoster
            key={exportPayload.signature}
            ref={exportPosterRef}
            data-export-bg-card={normalizeExportColorToken(exportPayload.backgroundColor)}
            data-export-hero-src={exportPayload.posterData.heroImage.src}
            data-export-signature={exportPayload.signature}
            data={exportPayload.posterData}
            theme={{ bgCard: exportPayload.backgroundColor }}
            width={POSTER_WIDTH}
          />
        ) : null}
      </div>
    </div>
  );
}
