/*
 * Radio : lecture de ce que publient Radio Campus Orléans et Labomedia (lib/radio/rco-site.ts, rss.ts,
 * icecast.ts, tracks.ts, text.ts), sur les fixtures enregistrées le 2026-10-23 (lib/radio/fixtures/),
 * sans réseau.
 *   node --test lib/radio/parsers.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const site = await jiti.import(path.join(root, "lib/radio/rco-site.ts"));
const rss = await jiti.import(path.join(root, "lib/radio/rss.ts"));
const icecast = await jiti.import(path.join(root, "lib/radio/icecast.ts"));
const tracks = await jiti.import(path.join(root, "lib/radio/tracks.ts"));
const text = await jiti.import(path.join(root, "lib/radio/text.ts"));

const fixture = (name) => fs.readFileSync(path.join(root, "lib/radio/fixtures", name), "utf8");
const NATION_GROOVE = "https://orleans.radiocampus.org/emission/nation-groove/";

// Page d'une émission -------------------------------------------------------------------------------

test("page d'émission : style, créneau, flux et présentation (Nation Groove)", () => {
  const page = site.parseRcoShowPage(fixture("rco-show-nation-groove.html"), NATION_GROOVE);
  assert.equal(page.style, "Drum'n bass, jungle, dubstep, electro");
  // « Jeudi 22h00 • 00h00 » : minuit s'écrit 24:00.
  assert.deepEqual(page.slots, [{ weekday: 4, start: "22:00", end: "24:00" }]);
  assert.deepEqual(page.unreadSlots, []);
  assert.equal(page.feedUrl, "https://orleans.radiocampus.org/podcasts/nation-groove/itunes/feed/");
  // En texte : un paragraphe par bloc, les <br> en retours à la ligne ; ni image ni « Partager sur ».
  const paragraphs = page.description.split("\n\n");
  assert.equal(paragraphs[0], "À propos de l’émission");
  assert.match(paragraphs[1], /^Ready Massive \? Nation Groove, c’est l’émission Jungle\/Drum’N’Bass/);
  assert.match(paragraphs[1], /à partir de 22h !\nNation Groove fait également partie du Collectif Jungle Assault/);
  assert.equal(paragraphs[2], "DJ K.NOBEE – DJ Slika – Soupapat\nFacebook – Soundcloud\nContact : nation.groove.rco@hotmail.com");
  assert.equal(paragraphs.length, 3);
  assert.doesNotMatch(page.description, /Partager|<|wp-image| {2}|\n{3}/);
});

test("page d'émission : une page qui n'en est pas une ne rend rien ; un style en minuscules prend sa capitale", () => {
  assert.equal(site.parseRcoShowPage("<html><body><h1>Page introuvable</h1></body></html>", NATION_GROOVE), null);
  const minimal = `<article class="rco-show"><p class="rco-show-style"><span> groove du monde </span></p>
    <div class="rco-show-infos-dates-time"><ul><li><span>Mercredi</span> 21h00 &#8226; 00h00</li>
    <li><span>Mercredi</span> 21h00 &#8226; 00h00</li><li>Tous les jours</li></ul></div>
    <a href="/podcasts/la-classe-internationale/itunes/feed/">RSS</a></article>`;
  const page = site.parseRcoShowPage(minimal, "https://orleans.radiocampus.org/emission/la-classe-internationale/");
  assert.equal(page.style, "Groove du monde");
  assert.deepEqual(page.slots, [{ weekday: 3, start: "21:00", end: "24:00" }]);
  assert.deepEqual(page.unreadSlots, ["Tous les jours"]);
  assert.equal(page.feedUrl, "https://orleans.radiocampus.org/podcasts/la-classe-internationale/itunes/feed/");
  assert.equal(page.description, null);
});

test("créneaux : les 91 émissions du 2026-10-23 se lisent toutes", () => {
  const lines = JSON.parse(fixture("rco-slots-2026-10-23.json"));
  assert.ok(lines.length >= 60);
  assert.deepEqual(lines.filter((line) => !site.parseSlotLine(line)), []);
  assert.deepEqual(site.parseSlotLine("Jeudi 22h00 • 00h00"), { weekday: 4, start: "22:00", end: "24:00" });
  assert.deepEqual(site.parseSlotLine("Lundi 15h00 • 15h30"), { weekday: 1, start: "15:00", end: "15:30" });
  assert.deepEqual(site.parseSlotLine("Vendredi 17h30 • 18h00"), { weekday: 5, start: "17:30", end: "18:00" });
  assert.deepEqual(site.parseSlotLine("Mercredi 08h30 • 08h45"), { weekday: 3, start: "08:30", end: "08:45" });
  assert.deepEqual(site.parseSlotLine("Dimanche 18h00 • 18h30"), { weekday: 7, start: "18:00", end: "18:30" });
});

test("créneaux : fin le lendemain, heures sans minutes ; formes refusées", () => {
  assert.deepEqual(site.parseSlotLine("Samedi 23h00 • 02h00"), { weekday: 6, start: "23:00", end: "02:00" });
  assert.deepEqual(site.parseSlotLine("dimanche 22h - 0h"), { weekday: 7, start: "22:00", end: "24:00" });
  assert.deepEqual(site.parseSlotLine("Mardi 7h à 9h"), { weekday: 2, start: "07:00", end: "09:00" });
  for (const line of ["Jeudi 22h00", "Jeudy 22h00 • 23h00", "Jeudi 25h00 • 26h00", "Jeudi 22h00 • 22h00", "Jeudi 22h75 • 23h00", ""]) {
    assert.equal(site.parseSlotLine(line), null, line);
  }
});

// API WordPress ---------------------------------------------------------------------------------------

test("API des émissions : id, slug, nom décodé, page ; entrées illisibles sautées", () => {
  const shows = site.parseWpShows(JSON.parse(fixture("rco-wp-shows.json")));
  assert.deepEqual(
    shows.map((show) => [show.sourceId, show.slug, show.name]),
    [
      [36, "nation-groove", "Nation Groove"],
      [41896, "la-mag-culturel", "Le Mag Culturel"],
      [51557, "kawai-campus-club", "Kawaï Campus Club"],
      [63765, "dominicalite", "L’Enfer du Dimanche"],
    ],
  );
  assert.equal(shows[0].pageUrl, NATION_GROOVE);
  assert.equal(shows[0].modifiedAt, null);

  const [withDate] = site.parseWpShows([
    { id: 36, slug: "nation-groove", link: NATION_GROOVE, title: { rendered: "Nation Groove" }, modified_gmt: "2026-10-01T08:30:00" },
    { id: "x", slug: "a", link: NATION_GROOVE, title: { rendered: "A" } },
    { id: 7, slug: "", link: NATION_GROOVE, title: { rendered: "B" } },
    { id: 8, slug: "c", link: "javascript:alert(1)", title: { rendered: "C" } },
    null,
  ]);
  assert.equal(withDate.modifiedAt, "2026-10-01T08:30:00.000Z");
  assert.throws(() => site.parseWpShows({ code: "rest_no_route" }), /tableau/);
});

test("adresses du site : API, flux par défaut, titres diffusés", () => {
  assert.equal(
    site.wpShowsUrl("https://orleans.radiocampus.org/", 2),
    "https://orleans.radiocampus.org/wp-json/wp/v2/show?per_page=100&page=2&_fields=id%2Cslug%2Clink%2Ctitle%2Cmodified_gmt",
  );
  assert.equal(
    site.defaultFeedUrl("https://orleans.radiocampus.org/", "nation-groove"),
    "https://orleans.radiocampus.org/podcasts/nation-groove/itunes/feed/",
  );
  assert.equal(
    site.pastTitlesUrl("https://orleans.radiocampus.org/"),
    "https://orleans.radiocampus.org/wp-admin/admin-ajax.php?action=rco-get-past-titles",
  );
});

test("famille par défaut : parole pour les 19 émissions de la liste, musique sinon", () => {
  assert.equal(site.SPOKEN_SHOW_SLUGS.size, 19);
  assert.equal(site.defaultShowFamily("la-mag-culturel"), "parole");
  assert.equal(site.defaultShowFamily("kawai-campus-club"), "parole");
  assert.equal(site.defaultShowFamily("h1000"), "parole");
  assert.equal(site.defaultShowFamily("nation-groove"), "musique");
  assert.equal(site.defaultShowFamily("une-nouvelle-emission"), "musique");
});

// Flux RSS ------------------------------------------------------------------------------------------

test("flux RSS : les 30 épisodes, dates en heure de Paris étiquetée UTC, durée en secondes", () => {
  const { episodes, skipped } = rss.parseRssEpisodes(fixture("rco-feed-nation-groove.xml"));
  assert.equal(episodes.length, 30);
  assert.equal(skipped, 0);
  assert.deepEqual(episodes[0], {
    guid: "https://orleans.radiocampus.org/podcast/nation-groove-12/",
    title: "Nation Groove du 22/10/2026",
    // « Thu, 22 Oct 2026 20:00:01 +0000 » : 22:00:01 à Paris.
    airedAt: "2026-10-22T22:00:01+00:00",
    durationS: 7187,
    audioUrl: "https://orleans.radiocampus.org/wp-content/uploads/2026/10/podcast_36_261022_220001.mp3",
    pageUrl: "https://orleans.radiocampus.org/podcast/nation-groove-12/",
  });
  assert.equal(episodes.at(-1).airedAt, "2026-04-02T22:00:01+00:00");
  assert.equal(new Set(episodes.map((episode) => episode.guid)).size, 30);
  assert.ok(episodes.every((episode) => episode.airedAt.endsWith("T22:00:01+00:00")));
});

test("flux RSS : entrées sans audio ou sans date sautées, guid en double gardé une fois, flux illisible refusé", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
    <item><title>Sans audio</title><pubDate>Thu, 22 Oct 2026 20:00:01 +0000</pubDate></item>
    <item><title>Sans date</title><enclosure url="https://radio.test/a.mp3"/></item>
    <item><title><![CDATA[L'Enfer du Dimanche du 18/10/2026]]></title><link>https://radio.test/p/1/</link>
      <enclosure url="https://radio.test/1.mp3"/><pubDate>Sun, 18 Dec 2026 19:00:00 +0000</pubDate>
      <itunes:duration>59:47</itunes:duration></item>
    <item><title>Doublon</title><link>https://radio.test/p/1/</link><enclosure url="https://radio.test/1b.mp3"/>
      <pubDate>Sun, 18 Dec 2026 19:00:00 +0000</pubDate></item>
  </channel></rss>`;
  const { episodes, skipped } = rss.parseRssEpisodes(xml);
  assert.equal(skipped, 3);
  assert.deepEqual(episodes, [
    {
      guid: "https://radio.test/p/1/",
      title: "L'Enfer du Dimanche du 18/10/2026",
      // Heure d'hiver : 19:00 UTC = 20:00 à Paris.
      airedAt: "2026-12-18T20:00:00+00:00",
      durationS: 3587,
      audioUrl: "https://radio.test/1.mp3",
      pageUrl: "https://radio.test/p/1/",
    },
  ]);
  assert.throws(() => rss.parseRssEpisodes("<html><body>Erreur 500</body></html>"), /illisible/);
});

test("itunes:duration : h:mm:ss, mm:ss ou secondes", () => {
  assert.equal(rss.parseItunesDuration("1:59:47"), 7187);
  assert.equal(rss.parseItunesDuration("59:47"), 3587);
  assert.equal(rss.parseItunesDuration("7187"), 7187);
  for (const value of ["", "0", "0:00", "1:75:00", "deux heures", null]) assert.equal(rss.parseItunesDuration(value), null);
});

// « Titres diffusés » ---------------------------------------------------------------------------------

test("titres diffusés : morceaux et débuts d'émission, la plus récente d'abord, datés à l'heure de Paris", () => {
  const entries = site.parsePastTitlesResponse(JSON.parse(fixture("rco-past-titles.json")), "2026-10-23");
  assert.deepEqual(entries.slice(0, 3), [
    { kind: "show", at: "2026-10-23T12:00:00+00:00", name: "La Méridienne" },
    { kind: "track", at: "2026-10-23T11:57:00+00:00", artist: "Genevieve Murphy", title: "Like Smoke" },
    {
      kind: "track",
      at: "2026-10-23T11:52:00+00:00",
      artist: "St. Vincent",
      title: "19_Slow Disco (Nina Kraviz Gabber Me Gently Remix)",
    },
  ]);
  assert.deepEqual(entries.find((entry) => entry.at === "2026-10-23T11:33:00+00:00"), {
    kind: "track",
    at: "2026-10-23T11:33:00+00:00",
    artist: "Tu ecoutes Radio Campus Orleans",
    title: "Jingle",
  });
  assert.deepEqual(
    entries.filter((entry) => entry.kind === "show" && entry.at.startsWith("2026-10-22")).map((entry) => entry.name),
    ["Nation Groove", "Crate Scientists", "Quoi que t'en dises !", "Champion des Ondes", "Le Mag Culturel"],
  );
  assert.equal(new Set(entries.map((entry) => entry.at.slice(0, 10))).size, 4);
  assert.throws(() => site.parsePastTitlesResponse({ success: false }, "2026-10-23"), /inattendue/);
});

test("titres diffusés : l'année du jour écrit est celle du dernier passage de cette date", () => {
  assert.equal(site.parsePastTitlesDay("vendredi 23 octobre", "2026-10-23"), "2026-10-23");
  assert.equal(site.parsePastTitlesDay("jeudi 31 décembre", "2027-01-02"), "2026-12-31");
  assert.equal(site.parsePastTitlesDay("samedi 1er août", "2026-08-02"), "2026-08-01");
  assert.equal(site.parsePastTitlesDay("hier", "2026-10-23"), null);
});

// Serveur Icecast -------------------------------------------------------------------------------------

test("Icecast : le titre de la source du flux de la station", () => {
  const status = JSON.parse(fixture("icecast-status.json"));
  // /stream_rco (le flux de la station) est servi par la source …/stream_rco_dab.mp3.
  assert.equal(icecast.pickIcecastTitle(status, "https://streams.labomedia.org:8443/stream_rco"), "AMYRA - Sage (Radio Edit)");

  const several = {
    icestats: {
      source: [
        { listenurl: "http://streams.test:8000/autre.mp3", title: "Autre - Radio" },
        { listenurl: "http://streams.test:8000/stream_rco", title: "  Akiko Yano  -  To Ki Me Ki " },
      ],
    },
  };
  assert.equal(icecast.pickIcecastTitle(several, "https://streams.test:8443/stream_rco"), "Akiko Yano - To Ki Me Ki");
  assert.equal(icecast.pickIcecastTitle(several, "https://streams.test:8443/inconnu"), undefined);
  assert.equal(icecast.pickIcecastTitle({ icestats: { source: { listenurl: "http://s.test/x", title: "" } } }, "https://s.test/x"), null);
  assert.equal(icecast.pickIcecastTitle({ icestats: {} }, "https://s.test/x"), undefined);
  assert.equal(icecast.pickIcecastTitle("pas du json", "https://s.test/x"), undefined);
});

// Titres de la playlist -----------------------------------------------------------------------------

test("titres nettoyés : numéros de piste et fins de nom de fichier retirés, le reste tel quel", () => {
  const cases = [
    // Les exemples du contrat.
    ["01 It Must Change_GBCVZ2200466_44k-16b", "It Must Change"],
    ["05 - Ana Lua Caiano - A Bala Nunca Fez Amigos - Du Sang Sur Les Mains (feat. Sages Comme des Sauvages)",
      "Ana Lua Caiano - A Bala Nunca Fez Amigos - Du Sang Sur Les Mains (feat. Sages Comme des Sauvages)"],
    ["Greater Reward (Piano Power Edit).mp3", "Greater Reward (Piano Power Edit)"],
    // D'autres de la page « Titres diffusés ».
    ["19_Slow Disco (Nina Kraviz Gabber Me Gently Remix)", "Slow Disco (Nina Kraviz Gabber Me Gently Remix)"],
    ["06 Madina min baeed", "Madina min baeed"],
    ["1. BJÖRNHORN I", "BJÖRNHORN I"],
    ["09. Coilguns - Forever Chemicals", "Coilguns - Forever Chemicals"],
    ["10_Every plane", "Every plane"],
    ["Sola - Arca [44_16]", "Sola - Arca"],
    ["05 - Veuves - How I$ The Money Made _", "Veuves - How I$ The Money Made"],
    ["01 - Baby Volcano - Knock Down_Main Master (2496)_241105", "Baby Volcano - Knock Down_Main Master (2496)"],
    // Un nombre qui fait partie du titre reste.
    ["72-Hour Sweat", "72-Hour Sweat"],
    ["10.0 LUFS", "10.0 LUFS"],
    ["7 Miles to Jordan", "7 Miles to Jordan"],
    ["2019", "2019"],
    ["111", "111"],
    ["11 Magic Circle", "11 Magic Circle"],
    ["01A Habaitak Ta Neseet Al Naoum mast", "01A Habaitak Ta Neseet Al Naoum mast"],
    ["PAL - C_est un désastre - 04 - Pays", "PAL - C_est un désastre - 04 - Pays"],
    ["Squeal Of Swine خنخنة خنازير", "Squeal Of Swine خنخنة خنازير"],
    ["To Ki Me Ki", "To Ki Me Ki"],
    ["  Like   Smoke ", "Like Smoke"],
    ["03", "03"],
  ];
  for (const [raw, cleaned] of cases) assert.equal(tracks.cleanTrackTitle(raw), cleaned, raw);
});

test("jingles : « Jingle », « Tu écoutes Radio … », le nom de la station", () => {
  const station = "Radio Campus Orléans";
  assert.equal(tracks.isJingle({ artist: "Tu ecoutes Radio Campus Orleans", title: "Jingle" }, station), true);
  assert.equal(tracks.isJingle({ artist: null, title: "Tu écoutes Radio Campus Orléans" }, station), true);
  assert.equal(tracks.isJingle({ artist: "Radio Campus Orléans", title: "Habillage" }, station), true);
  assert.equal(tracks.isJingle({ artist: "Akiko Yano", title: "To Ki Me Ki" }, station), false);
  assert.equal(tracks.isJingle({ artist: "Bing Crosby", title: "Jingle Bells" }, station), false);
  assert.equal(tracks.isJingle({ artist: "Joe Dassin", title: "Tu écoutes la pluie" }, station), false);
});

test("titre du serveur : artiste et titre au premier tiret", () => {
  assert.deepEqual(tracks.parseStreamTitle("Akiko Yano - To Ki Me Ki"), { artist: "Akiko Yano", title: "To Ki Me Ki" });
  assert.deepEqual(tracks.parseStreamTitle("AMYRA - Sage (Radio Edit)"), { artist: "AMYRA", title: "Sage (Radio Edit)" });
  assert.deepEqual(tracks.parseStreamTitle("Akiko Yano – To Ki Me Ki"), { artist: "Akiko Yano", title: "To Ki Me Ki" });
  assert.deepEqual(tracks.parseStreamTitle("PAL - PAL - C_est un désastre - 04 - Pays"), {
    artist: "PAL",
    title: "PAL - C_est un désastre - 04 - Pays",
  });
  assert.deepEqual(tracks.parseStreamTitle(" - NOVORAMA"), { artist: null, title: "NOVORAMA" });
  assert.deepEqual(tracks.parseStreamTitle("NOVORAMA"), { artist: null, title: "NOVORAMA" });
  assert.deepEqual(tracks.parseStreamTitle("72-Hour Sweat"), { artist: null, title: "72-Hour Sweat" });
  for (const raw of ["", "  ", "-", " - ", null]) assert.equal(tracks.parseStreamTitle(raw), null, String(raw));
});

test("nom d'émission dans le titre du serveur ; même morceau", () => {
  assert.equal(tracks.titleNamesShow("LA MERIDIENNE – RADIO CAMPUS TOURS", "La Méridienne"), true);
  assert.equal(tracks.titleNamesShow("KAWAÏ CAMPUS CLUB", "Kawaï Campus Club"), true);
  assert.equal(tracks.titleNamesShow("Quoi que t'en dises", "Quoi que t'en dises !"), true);
  assert.equal(tracks.titleNamesShow("Akiko Yano - To Ki Me Ki", "Kawaï Campus Club"), false);
  assert.equal(tracks.titleNamesShow("Blockchainz - Intro", "Blockchain"), false);
  assert.equal(tracks.titleNamesShow("anything", ""), false);
  assert.equal(
    tracks.sameTrack({ artist: "ANOHNI", title: "01 It Must Change_GBCVZ2200466_44k-16b" }, { artist: "anohni", title: "It Must Change" }),
    true,
  );
  assert.equal(tracks.sameTrack({ artist: "Nite Fleit", title: "Little Robot" }, { artist: "Nite Fleit & Umwelt", title: "Little Robot" }), false);
});

// Textes ----------------------------------------------------------------------------------------------

test("heure de Paris étiquetée UTC : été, hiver, nuit du changement d'heure", () => {
  assert.equal(text.toParisLabelledUtc(new Date("2026-10-22T20:00:01Z")), "2026-10-22T22:00:01+00:00");
  assert.equal(text.toParisLabelledUtc(new Date("2026-12-01T19:00:00Z")), "2026-12-01T20:00:00+00:00");
  // Le 25 octobre 2026 à 01:00 UTC, 03:00 d'été redevient 02:00 d'hiver.
  assert.equal(text.toParisLabelledUtc(new Date("2026-10-25T00:30:00Z")), "2026-10-25T02:30:00+00:00");
  assert.equal(text.toParisLabelledUtc(new Date("2026-10-25T01:30:00Z")), "2026-10-25T02:30:00+00:00");
  assert.equal(text.formatParisLabelled("2026-10-23T19:00:00+00:00"), "2026-10-23T19:00:00+00:00");
  assert.equal(text.formatParisLabelled("2026-10-23 19:00:00+00"), "2026-10-23T19:00:00+00:00");
});

test("textes : comparaison sans accents ni ponctuation, capitale, HTML en paragraphes", () => {
  assert.equal(text.normalizeForMatch("LA MÉRIDIENNE – Radio Campus Tours !"), "la meridienne radio campus tours");
  assert.equal(text.normalizeForMatch("Cœur d’Orléans"), "coeur d orleans");
  assert.equal(text.capitalizeFirst("groove du monde"), "Groove du monde");
  assert.equal(text.capitalizeFirst("écoute"), "Écoute");
  assert.equal(text.capitalizeFirst("88.3 FM"), "88.3 FM");
  assert.equal(
    text.htmlToText("<h2>Bienvenue</h2><p>Le jazz&nbsp;est <strong>partout</strong>.<br>Écoutez !</p><figure><img src=x></figure><ul><li>Un</li><li>Deux</li></ul>"),
    "Bienvenue\n\nLe jazz est partout.\nÉcoutez !\n\nUn\n\nDeux",
  );
  assert.equal(text.htmlToText("  "), null);
  assert.equal(text.htmlToText("<figure><img src=x></figure>"), null);
});
