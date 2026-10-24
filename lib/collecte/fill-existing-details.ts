import * as cheerio from "cheerio";

import { matchGenreIds, readEventDetails, type EventGenreOption } from "@/lib/events/event-details";
import { normalizeName } from "@/lib/events/import-prefill";
import { isFacebookEventUrl } from "@/lib/facebook/event-url";
import { isInstagramPostUrl } from "@/lib/instagram/post-url";
import { fetchHtml } from "@/lib/scraping/fetch-html";
import { onSortEventUid } from "@/lib/scraping/on-sort";
import { scrapeEventPage, type ScrapedEventData } from "@/lib/scraping/scrape-event-page";

/*
 * La reprise des fiches à venir (étape 3 de « Pour toi », ../live/docs/chantiers/pour-toi.md, « Des fiches plus
 * riches ») : genre, pour qui, âge et réservation, lus par la même lecture que la collecte (scrapeEventPage : la page
 * de l'événement, l'IA avec les genres de sa catégorie), à défaut sur le titre et la description gardés en base (post
 * Instagram, page morte). Ne remplit que ce qui est vide ; ce que la source ne dit pas reste vide.
 *
 * En deux temps (scripts/fill-event-details.mjs) : la simulation lit les sources et écrit un plan, avec ce qui a été
 * lu et pourquoi (les phrases de la source), pour la relecture de l'utilisateur ; l'écriture applique ce plan tel quel
 * (pas une nouvelle lecture), seulement aux événements qui n'ont pas changé depuis, et le trace dans le journal
 * d'audit. Le plan garde l'état d'avant : le retour arrière le remet.
 */

export type DetailsEventRow = {
  id: string;
  title: string;
  description: string | null;
  /** Heure de Paris étiquetée UTC (events.date). */
  date: string;
  status: string | null;
  categoryId: string | null;
  categoryName: string | null;
  locationName: string | null;
  sourceUrl: string | null;
  tagIds: string[];
  genreIds: string[];
  audience: string | null;
  minAge: number | null;
  booking: string | null;
  isYoungAudience: boolean;
  updatedAt: string | null;
};

/** Ce qu'une source dit de l'événement. */
export type DetailsReading = {
  /** page : la page lue ; texte : le titre et la description en base ; page+texte : les deux. */
  method: "page" | "texte" | "page+texte";
  url: string | null;
  genres: string[];
  audience: string | null;
  minAge: number | null;
  booking: string | null;
  /** Les phrases de la source qui parlent d'âge, de public ou de réservation (pour la relecture). */
  evidence: string[];
  /** Page illisible (404, bloquée…) : lu sur le texte en base. */
  pageError?: string;
};

export type TagOption = { id: string; name: string };

export type DetailsProposal = {
  id: string;
  title: string;
  date: string;
  status: string | null;
  categoryName: string | null;
  locationName: string | null;
  sourceUrl: string | null;
  /** events.updated_at à la lecture : l'écriture saute un événement modifié depuis. */
  updatedAt: string | null;
  before: {
    genre_ids: string[];
    audience: string | null;
    min_age: number | null;
    booking: string | null;
    tag_ids: string[];
    is_young_audience: boolean;
  };
  /** Seulement les champs vides que la source remplit. Les genres par leur nom (rapprochés à l'écriture). */
  fill: { genres?: string[]; audience?: string; min_age?: number; booking?: string };
  /** Genres lus hors de la liste de la catégorie : non repris (un genre qui manque ?). */
  genresUnmatched: string[];
  /** Tags de goût que la lecture ne confirme pas (« Zigo Comedy Club » porte Cirque et Danse) : à retirer ? */
  tagsToRemove: TagOption[];
  /** Effet sur « En famille » (is_young_audience, recalculé en base depuis audience : events_sync_details). */
  youngAudience?: { before: boolean; after: boolean };
  reading: Pick<DetailsReading, "method" | "url" | "evidence" | "pageError">;
};

type Client = { from: (table: string) => any };

async function readAll<T>(query: () => any, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

/** Événements à venir (à partir de `today`, AAAA-MM-JJ), publiés ou en attente, et les référentiels. */
export async function loadDetailsRows(supabase: Client, today: string) {
  const [events, categories, tags, genres] = await Promise.all([
    readAll<any>(() =>
      supabase
        .from("events")
        .select(
          "id, title, description, date, end_date, status, category, tag_ids, genre_ids, audience, min_age, booking, is_young_audience, scraping_url, external_url, instagram_url, facebook_url, updated_at, location:locations(name)",
        )
        .eq("archived", false)
        .in("status", ["approved", "pending"])
        .or(`date.gte.${today}T00:00:00,end_date.gte.${today}T00:00:00`)
        .order("date", { ascending: true }),
    ),
    readAll<{ id: string; name: string }>(() => supabase.from("categories").select("id, name")),
    readAll<TagOption>(() => supabase.from("tags").select("id, name")),
    readAll<EventGenreOption>(() =>
      supabase.from("event_genres").select("id, category_id, name, phrase, display_order, is_active"),
    ),
  ]);
  const categoryNames = new Map(categories.map((row) => [row.id, row.name]));
  const rows: DetailsEventRow[] = events.map((event) => ({
    id: event.id,
    title: (event.title || "").trim(),
    description: event.description ?? null,
    date: event.date,
    status: event.status ?? null,
    categoryId: event.category ?? null,
    categoryName: event.category ? (categoryNames.get(event.category) ?? null) : null,
    locationName: event.location?.name ?? null,
    sourceUrl: event.scraping_url || event.external_url || event.instagram_url || event.facebook_url || null,
    tagIds: event.tag_ids || [],
    genreIds: event.genre_ids || [],
    audience: event.audience ?? null,
    minAge: event.min_age ?? null,
    booking: event.booking ?? null,
    isYoungAudience: Boolean(event.is_young_audience),
    updatedAt: event.updated_at ?? null,
  }));
  return { rows, tags, genres, categories };
}

/** Ce qui reste à remplir : un champ vide (et des genres seulement si la catégorie en a). */
export function needsDetails(row: DetailsEventRow, genres: EventGenreOption[]) {
  const categoryHasGenres = genres.some((genre) => genre.category_id === row.categoryId && genre.is_active);
  return (categoryHasGenres && row.genreIds.length === 0) || !row.audience || row.minAge === null || !row.booking;
}

/**
 * Séances lues ensemble : même page source et même titre (une page d'agenda qui annonce plusieurs événements n'en
 * dit rien d'un seul ; sans page, chaque titre est lu sur son texte).
 */
export function readingGroups(rows: DetailsEventRow[]) {
  const groups = new Map<string, DetailsEventRow[]>();
  for (const row of rows) {
    const key = `${row.sourceUrl ?? ""}|${normalizeName(row.title)}|${row.categoryId ?? ""}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.entries()].map(([key, members]) => ({ key, rows: members }));
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (character) => ESCAPES[character]);

/** Le titre et la description gardés en base, en page, pour la même lecture. */
function storedTextPage(row: DetailsEventRow) {
  const paragraphs = (row.description || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");
  return `<!doctype html><html><head><title>${escapeHtml(row.title)}</title></head><body><main><h1>${escapeHtml(row.title)}</h1>\n${paragraphs}</main></body></html>`;
}

/** Ce qui, dans un texte, parle d'âge, de public ou de réservation. */
const CUE =
  /(dès|des|à partir de|a partir de)\s+\d{1,2}\s*(ans?|mois)|\d{1,2}\s*[-–à]\s*\d{1,2}\s*ans|tout public|tous publics|jeune public|en famille|pour les enfants|ados|adolescents|adultes?|déconseillé|r[ée]serv|billet|inscri|entr[ée]e libre|sur place/i;

export function evidenceOf(text: string, max = 4) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?•|])\s+|\s+[•|]\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 3 && CUE.test(sentence));
  return [...new Set(sentences.map((sentence) => (sentence.length > 180 ? `${sentence.slice(0, 177)}…` : sentence)))].slice(0, max);
}

function pageText(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header").remove();
  $("br").replaceWith("\n");
  $("p, div, li, h1, h2, h3, h4, td, dd").append("\n");
  return $("main").text() || $("body").text();
}

function detailsOf(data: ScrapedEventData | undefined) {
  return {
    genres: data?.genres ?? [],
    ...readEventDetails({ audience: data?.audience, min_age: data?.min_age, booking: data?.booking }),
  };
}

/**
 * Lit ce que la source dit d'un groupe de séances : sa page par la lecture de la collecte ; une page qui ne passe pas
 * par l'IA (On sort !) ou qui ne dit pas tout est complétée par le texte en base ; un post Instagram, un événement
 * Facebook, une page morte : le texte en base seul.
 */
export async function readDetails(supabase: Client, row: DetailsEventRow): Promise<DetailsReading> {
  const known = { title: row.title, date: row.date.slice(0, 16), category: row.categoryName ?? undefined };
  const fromText = async () => {
    // Une adresse neutre : celle de la source enverrait vers sa lecture propre (On sort !, billetteries).
    const textUrl = `https://outlive.fr/fiche/${row.id}`;
    const result = await scrapeEventPage({
      url: textUrl,
      supabase,
      prefetched: { html: storedTextPage(row), finalUrl: textUrl },
      known,
    });
    return { details: detailsOf(result.ok ? result.data : undefined), evidence: evidenceOf(`${row.title}. ${row.description || ""}`) };
  };

  const url = row.sourceUrl && /^https?:\/\//.test(row.sourceUrl) ? row.sourceUrl : null;
  const readable = url && !isInstagramPostUrl(url) && !isFacebookEventUrl(url);
  if (!readable) {
    const text = await fromText();
    return { method: "texte", url, ...text.details, evidence: text.evidence };
  }

  let pageError: string | undefined;
  let page: { details: ReturnType<typeof detailsOf>; evidence: string[]; ai: boolean } | null = null;
  try {
    // On sort ! se lit par son API (pas de page) ; les autres pages une fois, pour la lecture et les phrases.
    const prefetched = onSortEventUid(url) ? undefined : await fetchHtml(url);
    const result = await scrapeEventPage({ url, supabase, prefetched, known });
    if (!result.ok) throw new Error(result.error);
    page = {
      details: detailsOf(result.data),
      evidence: evidenceOf(prefetched ? pageText(prefetched.html) : result.data.description || ""),
      ai: result.metadata.ai_processed,
    };
  } catch (error) {
    pageError = error instanceof Error ? error.message : "Page illisible";
  }

  if (!page) {
    const text = await fromText();
    return { method: "texte", url, ...text.details, evidence: text.evidence, pageError };
  }
  const complete =
    page.details.genres.length > 0 && page.details.audience !== null && page.details.booking !== null;
  if (page.ai || complete) return { method: "page", url, ...page.details, evidence: page.evidence };

  // La page lue sans IA ne dit pas tout : le texte en base complète, la page passe d'abord.
  const text = await fromText();
  return {
    method: "page+texte",
    url,
    genres: page.details.genres.length ? page.details.genres : text.details.genres,
    audience: page.details.audience ?? text.details.audience,
    minAge: page.details.minAge ?? text.details.minAge,
    booking: page.details.booking ?? text.details.booking,
    evidence: [...new Set([...page.evidence, ...text.evidence])].slice(0, 4),
  };
}

/**
 * Tags de goût (ceux des bulles de « Pour toi ») et ce qui les confirme : un genre lu, ou la catégorie de
 * l'événement. Un tag qu'aucun ne confirme, alors que la lecture a trouvé des genres, est proposé au retrait.
 */
const TASTE_TAGS: Record<string, { genres: string[]; categories: string[] }> = {
  theatre: { genres: ["theatre"], categories: [] },
  humour: { genres: ["humour"], categories: [] },
  cirque: { genres: ["cirque"], categories: [] },
  acrobaties: { genres: ["cirque"], categories: [] },
  danse: { genres: ["contemporaine", "hip hop", "classique", "traditionnelle"], categories: ["danse"] },
  electro: { genres: ["electro"], categories: ["dj set"] },
  conference: { genres: [], categories: ["rencontre"] },
};

/** Le plan de la reprise : pour chaque événement, ce que sa source remplit, sans rien écrire. */
export function planDetails(
  rows: DetailsEventRow[],
  readings: Map<string, DetailsReading>,
  { genres, tags }: { genres: EventGenreOption[]; tags: TagOption[] },
): DetailsProposal[] {
  const proposals: DetailsProposal[] = [];
  for (const row of rows) {
    const reading = readings.get(row.id);
    if (!reading) continue;
    const match = matchGenreIds(reading.genres, genres, row.categoryId);
    const genreNames = genres.filter((genre) => match.ids.includes(genre.id)).map((genre) => genre.name);
    const fill: DetailsProposal["fill"] = {};
    if (row.genreIds.length === 0 && genreNames.length) fill.genres = genreNames;
    if (!row.audience && reading.audience) fill.audience = reading.audience;
    if (row.minAge === null && reading.minAge !== null) fill.min_age = reading.minAge;
    if (!row.booking && reading.booking) fill.booking = reading.booking;

    const readGenres = new Set(genreNames.map(normalizeName));
    const category = normalizeName(row.categoryName || "");
    const tagsToRemove = readGenres.size
      ? tags
          .filter((tag) => row.tagIds.includes(tag.id))
          .filter((tag) => {
            const taste = TASTE_TAGS[normalizeName(tag.name)];
            return taste && !taste.categories.includes(category) && !taste.genres.some((genre) => readGenres.has(genre));
          })
      : [];

    const audience = fill.audience ?? row.audience;
    // La règle du trigger events_sync_details, pour dire l'effet sur « En famille » à la relecture.
    const youngAfter = audience ? audience === "family" || audience === "teens" : row.isYoungAudience;
    if (Object.keys(fill).length === 0 && tagsToRemove.length === 0 && match.unmatched.length === 0) continue;
    proposals.push({
      id: row.id,
      title: row.title,
      date: row.date,
      status: row.status,
      categoryName: row.categoryName,
      locationName: row.locationName,
      sourceUrl: row.sourceUrl,
      updatedAt: row.updatedAt,
      before: {
        genre_ids: row.genreIds,
        audience: row.audience,
        min_age: row.minAge,
        booking: row.booking,
        tag_ids: row.tagIds,
        is_young_audience: row.isYoungAudience,
      },
      fill,
      genresUnmatched: match.unmatched,
      tagsToRemove,
      youngAudience: youngAfter !== row.isYoungAudience ? { before: row.isYoungAudience, after: youngAfter } : undefined,
      reading: { method: reading.method, url: reading.url, evidence: reading.evidence, pageError: reading.pageError },
    });
  }
  return proposals;
}

/** Ce que l'écriture fait d'une proposition : les colonnes à poser, rien d'autre. */
export function patchOf(proposal: DetailsProposal, genres: EventGenreOption[], categoryId: string | null) {
  const patch: Record<string, unknown> = {};
  if (proposal.fill.genres?.length) {
    const ids = matchGenreIds(proposal.fill.genres, genres, categoryId).ids;
    if (ids.length) patch.genre_ids = ids;
  }
  if (proposal.fill.audience) patch.audience = proposal.fill.audience;
  if (proposal.fill.min_age) patch.min_age = proposal.fill.min_age;
  if (proposal.fill.booking) patch.booking = proposal.fill.booking;
  if (proposal.tagsToRemove.length) {
    const removed = new Set(proposal.tagsToRemove.map((tag) => tag.id));
    patch.tag_ids = proposal.before.tag_ids.filter((id) => !removed.has(id));
  }
  return patch;
}

const sameList = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/**
 * Écrit le plan relu : un événement à la fois, seulement s'il est tel qu'à la lecture (updated_at, champs encore
 * vides, mêmes tags), avec une ligne du journal d'audit (event.details_fill, l'avant et l'après).
 */
export async function applyDetailsPlan(supabase: Client, proposals: DetailsProposal[], actor: string) {
  const { data: genreRows, error: genreError } = await supabase
    .from("event_genres")
    .select("id, category_id, name, phrase, display_order, is_active");
  if (genreError) throw new Error(genreError.message);
  const genres = (genreRows || []) as EventGenreOption[];
  let updated = 0;
  const skipped: Array<{ id: string; title: string; reason: string }> = [];
  const errors: Array<{ id: string; error: string }> = [];
  for (const proposal of proposals) {
    const { data: current, error: readError } = await supabase
      .from("events")
      .select("id, category, tag_ids, genre_ids, audience, min_age, booking, updated_at")
      .eq("id", proposal.id)
      .maybeSingle();
    if (readError || !current) {
      errors.push({ id: proposal.id, error: readError?.message || "Événement introuvable" });
      continue;
    }
    const changed =
      (proposal.updatedAt && current.updated_at !== proposal.updatedAt) ||
      !sameList(current.tag_ids || [], proposal.before.tag_ids);
    if (changed) {
      skipped.push({ id: proposal.id, title: proposal.title, reason: "modifié depuis la lecture" });
      continue;
    }
    const patch = patchOf(proposal, genres, current.category);
    // Ne jamais remplacer ce qui a été rempli entre-temps.
    if ((current.genre_ids || []).length) delete patch.genre_ids;
    for (const field of ["audience", "min_age", "booking"] as const) if (current[field] !== null) delete patch[field];
    if (Object.keys(patch).length === 0) {
      skipped.push({ id: proposal.id, title: proposal.title, reason: "rien à écrire" });
      continue;
    }
    const { error } = await supabase.from("events").update(patch).eq("id", proposal.id);
    if (error) {
      errors.push({ id: proposal.id, error: error.message });
      continue;
    }
    updated += 1;
    const { error: auditError } = await supabase.from("admin_audit_log").insert({
      actor_user_id: null,
      actor_email: actor,
      action: "event.details_fill",
      entity_type: "event",
      entity_id: proposal.id,
      entity_label: proposal.title,
      metadata: { before: proposal.before, after: patch, source: proposal.reading.url, method: proposal.reading.method, via: "script" },
    });
    if (auditError) console.warn(`Journal d'audit non enregistré pour ${proposal.id} : ${auditError.message}`);
  }
  return { updated, skipped, errors };
}

/**
 * Retour arrière : remet l'état d'avant (`before` du plan) sur les événements que la reprise a écrits, s'ils n'ont
 * pas été modifiés depuis par quelqu'un d'autre (les champs portent encore ce qui a été écrit).
 */
export async function rollbackDetailsPlan(supabase: Client, proposals: DetailsProposal[], actor: string) {
  const { data: genreRows } = await supabase.from("event_genres").select("id, category_id, name, phrase, display_order, is_active");
  const genres = (genreRows || []) as EventGenreOption[];
  let restored = 0;
  const skipped: Array<{ id: string; title: string; reason: string }> = [];
  for (const proposal of proposals) {
    const { data: current } = await supabase
      .from("events")
      .select("id, category, tag_ids, genre_ids, audience, min_age, booking, is_young_audience")
      .eq("id", proposal.id)
      .maybeSingle();
    if (!current) continue;
    const written = patchOf(proposal, genres, current.category);
    const restore: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(written)) {
      const now = current[field];
      const same = Array.isArray(value) ? sameList(now || [], value as string[]) : now === value;
      if (!same) continue;
      restore[field] = (proposal.before as Record<string, unknown>)[field];
    }
    if (Object.keys(restore).length === 0) {
      skipped.push({ id: proposal.id, title: proposal.title, reason: "rien de la reprise à défaire" });
      continue;
    }
    // Le jeune public d'avant, une fois audience remise à vide (sinon le trigger le garde).
    if ("audience" in restore) restore.is_young_audience = proposal.before.is_young_audience;
    const { error } = await supabase.from("events").update(restore).eq("id", proposal.id);
    if (error) {
      skipped.push({ id: proposal.id, title: proposal.title, reason: error.message });
      continue;
    }
    restored += 1;
    await supabase.from("admin_audit_log").insert({
      actor_user_id: null,
      actor_email: actor,
      action: "event.details_fill_undo",
      entity_type: "event",
      entity_id: proposal.id,
      entity_label: proposal.title,
      metadata: { restored: restore, via: "script" },
    });
  }
  return { restored, skipped };
}
