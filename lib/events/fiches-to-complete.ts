import { genresOfCategory, type EventGenreOption } from "@/lib/events/event-details";

/*
 * « Fiches à compléter » (../live/docs/chantiers/pour-toi.md, « Des fiches plus riches ») : les événements à venir
 * dont la fiche ne dit pas son genre (quand sa catégorie en a), pour qui ou la réservation, ou dont ce qui a été lu
 * par la collecte n'est pas encore confirmé. Les séances d'un même spectacle (même titre, même catégorie) font une
 * ligne ; les plus proches d'abord.
 */

export type FicheGap = "confirm" | "genre" | "audience" | "booking";

export type FicheEventRow = {
  id: string;
  title: string | null;
  date: string | null;
  status: string | null;
  category: string | null;
  genre_ids: string[] | null;
  audience: string | null;
  min_age: number | null;
  booking: string | null;
  details_to_confirm: boolean | null;
  scraping_url?: string | null;
  external_url?: string | null;
  location?: { name: string | null } | null;
};

export type FicheGroup = {
  key: string;
  title: string;
  categoryId: string;
  categoryName: string | null;
  eventIds: string[];
  nextDate: string | null;
  venue: string | null;
  pendingCount: number;
  sourceUrl: string | null;
  gaps: FicheGap[];
  /** Ce que porte la première séance. */
  value: { genreIds: string[]; audience: string; minAge: string; booking: string };
};

/** Ce qui manque à une séance (ou ce qui y attend une confirmation), dans l'ordre des filtres. */
export function ficheGaps(event: FicheEventRow, genres: EventGenreOption[]): FicheGap[] {
  const offered = genresOfCategory(genres, event.category);
  return [
    event.details_to_confirm ? ("confirm" as const) : null,
    offered.length > 0 && !(event.genre_ids || []).some((id) => offered.some((genre) => genre.id === id))
      ? ("genre" as const)
      : null,
    event.audience ? null : ("audience" as const),
    event.booking ? null : ("booking" as const),
  ].filter((gap): gap is FicheGap => gap !== null);
}

function titleKey(title: string) {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Les lignes de la vue, dans l'ordre des dates (les événements arrivent triés par date) ; `ignored` : les titres
 * écartés sur ce navigateur (« la source ne le dit pas »).
 */
export function groupFichesToComplete(
  events: FicheEventRow[],
  categories: Array<{ id: string; name: string }>,
  genres: EventGenreOption[],
  ignored: Set<string> = new Set(),
): FicheGroup[] {
  const groups = new Map<string, FicheGroup>();
  for (const event of events) {
    const title = event.title?.trim();
    if (!title || ignored.has(title)) continue;
    const gaps = ficheGaps(event, genres);
    if (gaps.length === 0) continue;
    const categoryId = event.category || "";
    const key = `${titleKey(title)}|${categoryId}`;
    const group = groups.get(key) ?? {
      key,
      title,
      categoryId,
      categoryName: categories.find((category) => category.id === categoryId)?.name ?? null,
      eventIds: [],
      nextDate: event.date,
      venue: event.location?.name ?? null,
      pendingCount: 0,
      sourceUrl: event.scraping_url || event.external_url || null,
      gaps: [],
      value: {
        genreIds: event.genre_ids || [],
        audience: event.audience || "",
        minAge: event.min_age != null ? String(event.min_age) : "",
        booking: event.booking || "",
      },
    };
    group.eventIds.push(event.id);
    if (event.status === "pending") group.pendingCount += 1;
    for (const gap of gaps) if (!group.gaps.includes(gap)) group.gaps.push(gap);
    groups.set(key, group);
  }
  const order: FicheGap[] = ["confirm", "genre", "audience", "booking"];
  return [...groups.values()].map((group) => ({
    ...group,
    gaps: order.filter((gap) => group.gaps.includes(gap)),
  }));
}
