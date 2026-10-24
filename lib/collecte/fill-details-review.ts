import { audienceLabel, bookingLabel, minAgeLabel } from "@/lib/events/event-details";
import { normalizeName } from "@/lib/events/import-prefill";

import type { DetailsProposal } from "./fill-existing-details";

/*
 * La page de relecture de la reprise des fiches (scripts/fill-event-details.mjs) : ce que l'écriture poserait,
 * spectacle par spectacle, avec ce que dit chaque source ; d'abord ce qui demande l'œil de l'utilisateur (« En
 * famille » qui change, tags à retirer, genres qui manquent aux listes). Une page autonome, aux couleurs de l'app
 * (noir et blanc, le rouge du direct pour ce qui change « En famille »), lisible sans script.
 */

export type ReviewMeta = {
  /** « 24 octobre 2026 ». */
  readOn: string;
  /** Événements à venir lus en base. */
  eventsRead: number;
  /** Ceux qui avaient encore quelque chose à remplir. */
  eventsToFill: number;
  /** Sources lues (une par spectacle). */
  sourcesRead: number;
};

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string | null | undefined) => (value ?? "").replace(/[&<>"']/g, (character) => ESCAPES[character]);

/** Heure murale de Paris étiquetée UTC : lue telle quelle. */
function shortDay(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(iso),
  );
}

type Show = {
  key: string;
  title: string;
  categoryName: string;
  locationName: string | null;
  sourceUrl: string | null;
  dates: string[];
  proposals: DetailsProposal[];
};

/** Les séances d'un même spectacle (même titre, même catégorie, même lieu), dans l'ordre des dates. */
function showsOf(proposals: DetailsProposal[]) {
  const shows = new Map<string, Show>();
  for (const proposal of proposals) {
    const key = [normalizeName(proposal.title), proposal.categoryName ?? "", proposal.locationName ?? ""].join("|");
    const show = shows.get(key) ?? {
      key,
      title: proposal.title,
      categoryName: proposal.categoryName ?? "Sans catégorie",
      locationName: proposal.locationName,
      sourceUrl: proposal.sourceUrl,
      dates: [],
      proposals: [],
    };
    show.dates.push(proposal.date);
    show.proposals.push(proposal);
    shows.set(key, show);
  }
  return [...shows.values()];
}

function datesLabel(dates: string[]) {
  if (dates.length === 1) return shortDay(dates[0]);
  return `${dates.length} dates, du ${shortDay(dates[0])} au ${shortDay(dates[dates.length - 1])}`;
}

function chips(proposal: DetailsProposal) {
  const fill = proposal.fill;
  const items = [
    ...(fill.genres || []).map((genre) => ({ label: genre, kind: "genre" })),
    fill.audience ? { label: audienceLabel(fill.audience) ?? fill.audience, kind: "public" } : null,
    fill.min_age ? { label: minAgeLabel(fill.min_age) ?? "", kind: "age" } : null,
    fill.booking ? { label: bookingLabel(fill.booking) ?? fill.booking, kind: "resa" } : null,
  ].filter((item): item is { label: string; kind: string } => Boolean(item));
  if (items.length === 0) return `<span class="none">rien de plus</span>`;
  return items.map((item) => `<span class="chip chip-${item.kind}">${esc(item.label)}</span>`).join("");
}

const methodLabels: Record<DetailsProposal["reading"]["method"], string> = {
  page: "la page",
  texte: "le texte en base",
  "page+texte": "la page et le texte en base",
};

function evidence(proposal: DetailsProposal) {
  const reading = proposal.reading;
  const lines = reading.evidence.map((line) => `<li>${esc(line)}</li>`).join("");
  const error = reading.pageError ? `<p class="note">Page illisible (${esc(reading.pageError)}) : lu sur le texte en base.</p>` : "";
  return `<div class="source"><p class="note">Lu sur ${esc(methodLabels[reading.method])}</p>${error}${
    lines ? `<ul class="evidence">${lines}</ul>` : `<p class="note">Aucune phrase sur l'âge, le public ou la réservation.</p>`
  }</div>`;
}

function showRow(show: Show) {
  const first = show.proposals[0];
  const title = show.sourceUrl
    ? `<a href="${esc(show.sourceUrl)}" target="_blank" rel="noreferrer noopener">${esc(show.title)}</a>`
    : esc(show.title);
  const search = esc(normalizeName(`${show.title} ${show.locationName ?? ""} ${show.categoryName}`));
  return `<tr data-search="${search}">
<td><div class="title">${title}</div><div class="meta">${esc(datesLabel(show.dates))}${show.locationName ? ` · ${esc(show.locationName)}` : ""}</div></td>
<td class="chips">${chips(first)}</td>
<td>${evidence(first)}</td>
</tr>`;
}

function table(rows: string, head = "<th>Spectacle</th><th>L'écriture pose</th><th>La source</th>") {
  return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function formatDetailsReview(proposals: DetailsProposal[], meta: ReviewMeta) {
  const shows = showsOf(proposals);
  const filled = proposals.filter((proposal) => Object.keys(proposal.fill).length > 0);
  const count = (key: keyof DetailsProposal["fill"]) => proposals.filter((proposal) => proposal.fill[key] !== undefined).length;
  const family = shows.filter((show) => show.proposals[0].youngAudience);
  const tagShows = shows.filter((show) => show.proposals[0].tagsToRemove.length > 0);
  const unmatched = new Map<string, Show[]>();
  for (const show of shows) {
    for (const name of show.proposals[0].genresUnmatched) {
      const key = `${show.categoryName} · ${name}`;
      unmatched.set(key, [...(unmatched.get(key) || []), show]);
    }
  }
  const withoutGenre = shows.filter(
    (show) => !show.proposals[0].fill.genres && show.proposals[0].before.genre_ids.length === 0 && show.categoryName !== "Sans catégorie",
  );
  const unreadable = shows.filter((show) => show.proposals[0].reading.pageError);
  const categories = [...new Set(shows.map((show) => show.categoryName))].sort((left, right) => left.localeCompare(right, "fr"));

  const familyRows = family
    .map((show) => {
      const change = show.proposals[0].youngAudience!;
      const verdict = change.after ? "entre dans « En famille »" : "quitte « En famille »";
      return `<tr data-search="${esc(normalizeName(show.title))}"><td><div class="title">${esc(show.title)}</div><div class="meta">${esc(
        datesLabel(show.dates),
      )}${show.locationName ? ` · ${esc(show.locationName)}` : ""}</div></td><td class="chips">${chips(show.proposals[0])}</td><td><span class="flag">${verdict}</span>${evidence(
        show.proposals[0],
      )}</td></tr>`;
    })
    .join("");
  const tagRows = tagShows
    .map((show) => {
      const proposal = show.proposals[0];
      return `<tr><td><div class="title">${esc(show.title)}</div><div class="meta">${esc(datesLabel(show.dates))}${
        show.locationName ? ` · ${esc(show.locationName)}` : ""
      }</div></td><td class="chips">${proposal.tagsToRemove
        .map((tag) => `<span class="chip chip-drop">#${esc(tag.name)}</span>`)
        .join("")}</td><td class="chips">${chips(proposal)}${evidence(proposal)}</td></tr>`;
    })
    .join("");
  const unmatchedItems = [...unmatched.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "fr"))
    .map(([key, list]) => `<li><strong>${esc(key)}</strong> : ${list.map((show) => esc(show.title)).join(", ")}</li>`)
    .join("");
  const withoutGenreItems = withoutGenre
    .map((show) => `<li>${esc(show.title)} <span class="meta">(${esc(show.categoryName)}, ${esc(datesLabel(show.dates))})</span></li>`)
    .join("");
  const byCategory = categories
    .map((category) => {
      const rows = shows.filter((show) => show.categoryName === category);
      return `<section class="category" data-category="${esc(category)}"><h3>${esc(category)} <span class="count">${rows.length}</span></h3>${table(
        rows.map(showRow).join(""),
      )}</section>`;
    })
    .join("");

  return `<title>Reprise des fiches</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* Une feuille de relecture : un en-tête qui résume, puis ce qui demande l'œil, puis tout, par catégorie. */
:root {
  --bg: #ffffff; --surface: #f2f2f2; --chip: #ebebeb; --line: rgba(0,0,0,0.09);
  --ink: #111111; --ink-2: #525252; --ink-3: #666666; --live: #c42b2b; --live-bg: rgba(224,51,51,0.10);
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif;
  --font-data: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #111111; --surface: #1b1b1b; --chip: #262626; --line: rgba(255,255,255,0.10);
  --ink: #f5f5f5; --ink-2: #adadad; --ink-3: #8f8f8f; --live: #ff6b6b; --live-bg: rgba(224,51,51,0.22); color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #111111; --surface: #1b1b1b; --chip: #262626; --line: rgba(255,255,255,0.10);
  --ink: #f5f5f5; --ink-2: #adadad; --ink-3: #8f8f8f; --live: #ff6b6b; --live-bg: rgba(224,51,51,0.22); color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 15px/1.5 var(--font); -webkit-font-smoothing: antialiased; }
.wrap { max-width: 1080px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 0; }
header.wrap { padding-block: 40px 8px; display: grid; gap: 12px; }
.eyebrow { margin: 0; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); font-weight: 600; }
h1 { margin: 0; font-size: clamp(30px, 5vw, 44px); line-height: 1.05; letter-spacing: -0.02em; font-weight: 800; text-wrap: balance; }
h2 { margin: 0; font-size: 22px; letter-spacing: -0.01em; font-weight: 750; text-wrap: balance; }
h3 { margin: 0; font-size: 16px; font-weight: 700; display: flex; gap: 8px; align-items: baseline; }
.lede { margin: 0; max-width: 68ch; color: var(--ink-2); }
.totals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin: 8px 0 0; background: var(--line); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
@media (max-width: 560px) { .totals { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.totals div { background: var(--bg); padding: 12px 14px; display: grid; gap: 2px; }
.totals dt { font-size: 12px; color: var(--ink-3); }
.totals dd { margin: 0; font: 600 22px/1.2 var(--font-data); font-variant-numeric: tabular-nums; }
main.wrap { display: grid; gap: 40px; padding-block: 24px 64px; }
section { display: grid; gap: 12px; min-width: 0; }
section > p { margin: 0; max-width: 72ch; color: var(--ink-2); }
.count { font: 500 13px var(--font-data); color: var(--ink-3); }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
table { width: 100%; border-collapse: collapse; min-width: 640px; }
th { text-align: left; font-size: 12px; font-weight: 600; color: var(--ink-3); padding: 10px 14px; border-bottom: 1px solid var(--line); background: var(--surface); }
td { padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; min-width: 0; }
tr:last-child td { border-bottom: 0; }
td:first-child { width: 40%; }
.title { font-weight: 650; }
.title a { color: inherit; text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
.title a:hover { text-decoration-color: var(--ink-3); }
.meta { font-size: 13px; color: var(--ink-3); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; }
.chip { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 13px; background: var(--chip); font-size: 13px; font-weight: 600; white-space: nowrap; }
.chip-genre { background: var(--ink); color: var(--bg); }
.chip-drop { text-decoration: line-through; color: var(--ink-2); }
.none { font-size: 13px; color: var(--ink-3); }
.flag { display: inline-block; margin-bottom: 6px; padding: 2px 8px; border-radius: 6px; background: var(--live-bg); color: var(--live); font-size: 13px; font-weight: 650; }
.source { font-size: 13px; color: var(--ink-2); display: grid; gap: 4px; }
a:focus-visible, input:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; border-radius: 4px; }
.evidence { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.note { margin: 0; color: var(--ink-3); }
ul.plain { margin: 0; padding-left: 18px; display: grid; gap: 6px; max-width: 80ch; }
.filter { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.filter input { font: inherit; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); min-width: 0; flex: 1 1 240px; max-width: 420px; }
.category { gap: 8px; }
@media (max-width: 640px) { td:first-child { width: auto; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
</style>
<header class="wrap">
  <p class="eyebrow">OutLive · « Pour toi », étape 3 · essai à blanc du ${esc(meta.readOn)}</p>
  <h1>Reprise des fiches</h1>
  <p class="lede">Ce que l'écriture poserait sur les fiches à venir : le genre, pour qui, l'âge et la réservation, quand la source les dit. Elle ne remplit que ce qui est vide et ne touche à rien d'autre, sauf les tags que tu valides plus bas. Rien n'est écrit tant que tu n'as pas dit oui.</p>
  <dl class="totals">
    <div><dt>Fiches à venir lues</dt><dd>${meta.eventsRead}</dd></div>
    <div><dt>À compléter</dt><dd>${meta.eventsToFill}</dd></div>
    <div><dt>Remplies par la reprise</dt><dd>${filled.length}</dd></div>
    <div><dt>Genre</dt><dd>${count("genres")}</dd></div>
    <div><dt>Pour qui</dt><dd>${count("audience")}</dd></div>
    <div><dt>Âge</dt><dd>${count("min_age")}</dd></div>
    <div><dt>Réservation</dt><dd>${count("booking")}</dd></div>
    <div><dt>Sources lues</dt><dd>${meta.sourcesRead}</dd></div>
  </dl>
</header>
<main class="wrap">
  <section id="en-famille">
    <h2>« En famille » : ce qui change <span class="count">${family.length}</span></h2>
    <p>Connu, « Pour qui » décide du jeune public : « En famille » et « Ados » en sont, « Tout public » et « Adultes » non. Un spectacle « tout public dès 6 ans » quitte donc « En famille » et rejoint les goûts des adultes dans « Pour toi ».</p>
    ${family.length ? table(familyRows, "<th>Spectacle</th><th>L'écriture pose</th><th>Effet</th>") : `<p>Aucun changement.</p>`}
  </section>
  <section id="tags">
    <h2>Tags à retirer <span class="count">${tagShows.length}</span></h2>
    <p>Des tags de goût (Théâtre, Humour, Cirque, Danse…) que la lecture ne confirme pas : ils font entrer l'événement dans de mauvaises bulles de « Pour toi ». Retirés seulement si tu le valides.</p>
    ${tagShows.length ? table(tagRows, "<th>Spectacle</th><th>Tags retirés</th><th>Ce que dit la source</th>") : `<p>Aucun.</p>`}
  </section>
  <section id="hors-liste">
    <h2>Genres lus hors des listes <span class="count">${unmatched.size}</span></h2>
    <p>La source nomme un genre qui n'est pas dans la liste de sa catégorie : il n'est pas repris. S'il manque, ajoute-le dans les réglages du back-office avant l'écriture.</p>
    ${unmatched.size ? `<ul class="plain">${unmatchedItems}</ul>` : `<p>Aucun.</p>`}
  </section>
  <section id="sans-genre">
    <h2>Sans genre trouvé <span class="count">${withoutGenre.length}</span></h2>
    <p>Leur catégorie a des genres, mais la source n'en dit aucun de la liste.</p>
    ${withoutGenre.length ? `<ul class="plain">${withoutGenreItems}</ul>` : `<p>Aucun.</p>`}
  </section>
  <section id="tout">
    <h2>Tout, par catégorie <span class="count">${shows.length} spectacles</span></h2>
    <div class="filter"><input id="filtre" type="search" placeholder="Chercher un titre, un lieu…" aria-label="Chercher un titre, un lieu"></div>
    ${byCategory}
  </section>
  ${
    unreadable.length
      ? `<section id="illisibles"><h2>Pages illisibles <span class="count">${unreadable.length}</span></h2><p>Lues sur le titre et la description gardés en base.</p><ul class="plain">${unreadable
          .map((show) => `<li>${esc(show.title)} <span class="meta">${esc(show.proposals[0].reading.pageError)}</span></li>`)
          .join("")}</ul></section>`
      : ""
  }
</main>
<script>
(function () {
  var input = document.getElementById("filtre");
  if (!input) return;
  var fold = function (value) { return value.normalize("NFD").replace(/\\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); };
  input.addEventListener("input", function () {
    var query = fold(input.value);
    document.querySelectorAll("#tout tr[data-search]").forEach(function (row) {
      row.hidden = Boolean(query) && row.getAttribute("data-search").indexOf(query) === -1;
    });
    document.querySelectorAll("#tout .category").forEach(function (section) {
      section.hidden = !section.querySelector("tbody tr:not([hidden])");
    });
  });
})();
</script>
`;
}
