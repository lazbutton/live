/*
 * Agenda On sort ! d'Orléans Métropole (OpenAgenda) : lecture de l'API sur un échantillon enregistré
 * le 18/10/2026 (fixtures/on-sort-api.json). Aucun accès réseau : l'API est simulée et l'horloge
 * arrêtée au soir de l'enregistrement.
 *   node --test lib/scraping/on-sort.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const onSort = await jiti.import(path.join(root, "lib/scraping/on-sort.ts"));
const { assessAgendaDiscovery } = await jiti.import(path.join(root, "lib/scraping/agenda.ts"));
const { scrapeEventPage } = await jiti.import(path.join(root, "lib/scraping/scrape-event-page.ts"));
const { resolveLocationFromImportedData } = await jiti.import(path.join(root, "lib/events/import-prefill.ts"));

const fixture = JSON.parse(fs.readFileSync(path.join(here, "fixtures/on-sort-api.json"), "utf8"));
const listed = (title) => fixture.list.events.find((event) => event.title.fr === title);
const ON_SORT = "https://sortir.orleans-metropole.fr";

// Soir de l'enregistrement : les séances de l'après-midi sont terminées.
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-18T21:00:00+02:00") });

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** API On sort ! simulée (liste sur une page, fiches de l'échantillon) ; renvoie les adresses appelées. */
function serveOnSort(list = fixture.list) {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(url);
    if (url.origin !== ON_SORT || url.pathname !== "/api/events") return new Response("introuvable", { status: 404 });
    const uid = url.searchParams.get("uids[]");
    // Événement retiré de l'agenda : le relais d'OpenAgenda répond par une erreur 500.
    if (uid && !fixture.events[uid]) return Response.json({ error: true, message: "HTTP/2 404" }, { status: 500 });
    if (uid) return Response.json({ success: true, event: fixture.events[uid] });
    return Response.json(url.searchParams.get("offset") === "0" ? list : { total: list.total, events: [] });
  };
  return calls;
}

/** Les fiches On sort ! se lisent sans base ni IA. */
const noDatabase = {
  from() {
    throw new Error("base interdite pour une fiche On sort !");
  },
};

const read = (url) => scrapeEventPage({ url, supabase: noDatabase });

test("adresses : agenda (site ou OpenAgenda) et page d'un événement", () => {
  assert.equal(onSort.isOnSortAgendaUrl(ON_SORT), true);
  assert.equal(onSort.isOnSortAgendaUrl(`${ON_SORT}/quand`), true);
  assert.equal(onSort.isOnSortAgendaUrl("https://openagenda.com/orleans-metropole"), true);
  assert.equal(onSort.isOnSortAgendaUrl("https://openagenda.com/fr/orleans-metropole/"), true);
  assert.equal(onSort.isOnSortAgendaUrl("https://openagenda.com/fr/un-autre-agenda"), false);
  assert.equal(onSort.isOnSortAgendaUrl(`${ON_SORT}/evenement/27309952/youn-sun-nah-nit-and-dogs-premiere-partie`), false);

  assert.equal(onSort.onSortEventUid(`${ON_SORT}/evenement/27309952/youn-sun-nah-nit-and-dogs-premiere-partie`), 27309952);
  assert.equal(
    onSort.onSortEventUid("https://openagenda.com/fr/orleans-metropole/events/37527842_17e-concours-international-de-piano-dorleans"),
    37527842,
  );
  // Adresse OpenAgenda sans identifiant : lue comme une page ordinaire (données structurées).
  assert.equal(onSort.onSortEventUid("https://openagenda.com/fr/orleans-metropole/events/17e-concours-international-de-piano-dorleans"), null);
  assert.equal(onSort.onSortEventUid("https://www.lastrolabe.org/evenement/123/concert"), null);
  assert.equal(
    onSort.onSortEventUrl({ uid: 27309952, slug: "youn-sun-nah-nit-and-dogs-premiere-partie" }),
    `${ON_SORT}/evenement/27309952/youn-sun-nah-nit-and-dogs-premiere-partie`,
  );
});

test("domaines suivis gardés (concerts, spectacles, expositions, cinéma, rencontres, festivals), le reste écarté", () => {
  const verdict = (title) => onSort.classifyOnSortEvent(listed(title));
  const kept = (category) => ({ keep: true, category });
  const excluded = (reason) => ({ keep: false, reason });

  assert.deepEqual(verdict("Youn Sun Nah + nit and dogs (première partie)"), kept("Concert"));
  assert.deepEqual(verdict("LES ENCHANTEURS"), kept("Spectacle"));
  assert.deepEqual(verdict("CIRCUS"), kept("Expo"));
  assert.deepEqual(verdict("ARCO"), kept("Cinema"));
  assert.deepEqual(verdict("Conférence de Pascal ORY de l'Académie française"), kept("Rencontre"));
  assert.deepEqual(verdict("Festival des Bouts du Monde"), kept("Festival"));
  // Cinéma, spectacle et musique cochés, aucun concert annoncé : l'ordre choisi par l'organisateur.
  assert.deepEqual(verdict("Luminiscence à Orléans"), kept("Spectacle"));

  assert.deepEqual(verdict("Soutien Numérique Personnalisé"), excluded("atelier, stage ou cours"));
  assert.deepEqual(verdict("PILATES débutant au palais des sports"), excluded("sport"));
  assert.deepEqual(verdict("Orléans de haut en bas"), excluded("visite ou balade"));
  // Visite commentée d'une œuvre du musée (balade + exposition) : pas une exposition.
  assert.deepEqual(verdict("Dans l'intimité d'une œuvre"), excluded("visite ou balade"));
  assert.deepEqual(verdict("Don de sang"), excluded("santé, bien-être ou démarches"));
  // Classé « musique » par l'organisateur, mais mots-clés bien-être et relaxation.
  assert.deepEqual(verdict("Voyage sonore"), excluded("santé, bien-être ou démarches"));
  // Afterwork chaque vendredi jusqu'en 2035, annonce de toute une saison.
  assert.deepEqual(verdict("AFTERWORK à la brasserie LA RIFF tous les vendredis"), excluded("rendez-vous récurrent ou saison"));
  assert.deepEqual(verdict("SAISON CULTURELLE 26/27"), excluded("rendez-vous récurrent ou saison"));
  assert.deepEqual(verdict("Réveil livres de 0 à 3 ans"), excluded("animation jeune public"));
  assert.deepEqual(verdict("47ème Bourse aux Monnaies et Billets"), excluded("fête, salon ou marché"));
});

test("titres : lieu, mention de saison, type d'événement et emoji retirés", () => {
  assert.equal(onSort.cleanOnSortTitle(listed("La Passerelle - Le chant des lions")), "Le chant des lions");
  assert.equal(onSort.cleanOnSortTitle(listed("CHARLOTTE BOISSELIER - SAISON CULTURELLE 26/27")), "CHARLOTTE BOISSELIER");
  assert.equal(onSort.cleanOnSortTitle({ uid: 1, title: { fr: "💃⭐ LES DANCHIEUSES ÉTOILES ⭐💃" } }), "LES DANCHIEUSES ÉTOILES");
  assert.equal(
    onSort.cleanOnSortTitle({ uid: 1, title: { fr: "Exposition : George Sand, 150 ans de modernité" } }),
    "George Sand, 150 ans de modernité",
  );
});

test("scan : le mois à venir, domaines suivis seulement, par date ; le reste compté par raison", async () => {
  const calls = serveOnSort();
  const result = await onSort.discoverOnSortAgenda();

  assert.equal(result.method, "onsort");
  assert.deepEqual(result.errors, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get("from"), "2026-10-18");
  assert.equal(calls[0].searchParams.get("to"), "2026-11-18");
  assert.equal(calls[0].searchParams.get("limit"), "300");

  assert.equal(result.events.length, 11);
  assert.deepEqual(result.excluded, {
    "atelier, stage ou cours": 1,
    sport: 1,
    "visite ou balade": 2,
    "santé, bien-être ou démarches": 2,
    "rendez-vous récurrent ou saison": 2,
    "animation jeune public": 1,
    "fête, salon ou marché": 1,
    // Concert de l'après-midi : plus de séance à venir ce soir.
    "déjà terminé": 1,
  });
  const dates = result.events.map((event) => event.date);
  assert.deepEqual(dates, [...dates].sort());

  const youn = result.events.find((event) => event.url.includes("/27309952/"));
  assert.equal(youn.url, `${ON_SORT}/evenement/27309952/youn-sun-nah-nit-and-dogs-premiere-partie`);
  assert.equal(youn.title, "Youn Sun Nah + nit and dogs (première partie)");
  assert.equal(youn.date, "2026-11-17T20:00:00");
  assert.equal(youn.image_url, "https://img.openagenda.com/main/e006dc12268d4e7c882250d2e7da1ff9.full.image.jpg");
  // Exposition ouverte depuis septembre : sa prochaine date d'ouverture.
  assert.equal(result.events.find((event) => event.title === "CIRCUS").date, "2026-10-21T14:00:00");
});

test("scan : événement annulé ou reporté signalé ; API en panne signalée sans planter", async () => {
  const youn = listed("Youn Sun Nah + nit and dogs (première partie)");
  serveOnSort({ total: 2, events: [{ ...youn, status: 6 }, { ...youn, uid: 2, slug: "reporte", status: 4 }] });
  const result = await onSort.discoverOnSortAgenda();
  assert.deepEqual(
    result.events.map((event) => event.cancelled),
    [true, true],
  );

  globalThis.fetch = async () => new Response("erreur", { status: 500 });
  const failed = await onSort.discoverOnSortAgenda();
  assert.equal(failed.events.length, 0);
  assert.match(failed.errors[0], /erreur 500/);
  // API en panne : page à relire ; mois sans rien dans les domaines suivis : rien à relire.
  assert.equal(assessAgendaDiscovery(failed)?.reason, "unreachable");
  serveOnSort({ total: 1, events: [listed("Soutien Numérique Personnalisé")] });
  assert.equal(assessAgendaDiscovery(await onSort.discoverOnSortAgenda()), null);
});

test("fiche : lieu, organisateur, catégorie, affiche, billetterie et tarifs lus par l'API, sans IA", async () => {
  const calls = serveOnSort();
  const result = await read(`${ON_SORT}/evenement/27309952/youn-sun-nah-nit-and-dogs-premiere-partie`);

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get("uids[]"), "27309952");
  assert.equal(result.metadata.ai_processed, false);
  const { description, ...data } = result.data;
  assert.deepEqual(data, {
    title: "Youn Sun Nah + nit and dogs (première partie)",
    date: "2026-11-17T20:00:00",
    end_date: "2026-11-17T22:00:00",
    time_known: true,
    location: "Théâtre d'Orléans",
    address: "boulevard pierre ségelle 45000 orleans",
    image_url: "https://img.openagenda.com/main/e006dc12268d4e7c882250d2e7da1ff9.full.image.jpg",
    external_url: "https://scenenationale-orleans.fr/",
    external_url_label: "Billetterie",
    organizer: "Scène nationale / Théâtre d'Orléans",
    category: "Concert",
    tags: ["jazz", "concert"],
    price_min: 5,
    price_max: 25,
    price: "5",
  });
  assert.match(description, /^Lumineuse, l’artiste sud-coréenne/);
  assert.doesNotMatch(description, /<\/?(p|strong|em)>/);

  // Adresse canonique OpenAgenda : même lecture.
  const arco = await read("https://openagenda.com/fr/orleans-metropole/events/83901647_arco-2974463");
  assert.equal(arco.data.category, "Cinema");
  assert.equal(arco.data.address, "Rue de la herpinière 45430 CHECY");
  assert.deepEqual([arco.data.price_min, arco.data.price_max], [2, 5]);

  // Événement retiré de l'agenda.
  const removed = await read(`${ON_SORT}/evenement/123/retire`);
  assert.equal(removed.ok, false);
});

test("séances : une fiche par séance à venir ; exposition ou spectacle quotidien en une seule fiche", async () => {
  serveOnSort();
  const enchanteurs = (await read(`${ON_SORT}/evenement/41566173/les-enchanteurs-240817`)).data;
  assert.equal(enchanteurs.date, "2026-11-12T19:00:00");
  assert.equal(enchanteurs.end_date, "2026-11-12T20:20:00");
  assert.equal(enchanteurs.occurrences.length, 9);
  assert.deepEqual(enchanteurs.occurrences[0], { date: "2026-11-13T20:00:00", end_date: "2026-11-13T21:20:00" });
  assert.deepEqual([enchanteurs.price_min, enchanteurs.price_max], [12, 36]);

  // 122 jours d'ouverture : une fiche, de l'ouverture (déjà passée) au dernier jour.
  const circus = (await read(`${ON_SORT}/evenement/32843872/circus-6824853`)).data;
  assert.deepEqual([circus.date, circus.end_date, circus.occurrences], ["2026-09-19T10:00:00", "2027-03-07T19:00:00", undefined]);
  assert.equal(circus.category, "Expo");
  assert.equal(circus.external_url_label, "Voir sur On sort !");

  // 86 séances en trois mois : une seule fiche plutôt que 86.
  const luminiscence = (await read(`${ON_SORT}/evenement/42586898/luminiscence-a-orleans-9959525`)).data;
  assert.deepEqual([luminiscence.date, luminiscence.end_date], ["2026-09-30T20:00:00", "2026-12-23T21:10:00"]);
  assert.equal(luminiscence.occurrences, undefined);
});

test("tarifs écrits en clair", () => {
  const price = onSort.readOnSortPrice;
  assert.deepEqual(price("Tarifs de 5€ à 25€, 15€ avec la Carte"), { price_min: 5, price_max: 25 });
  assert.deepEqual(price("tarifs : de 12 à 36 euros"), { price_min: 12, price_max: 36 });
  assert.deepEqual(price("2€ pour les – de 18 ans ; 5 € pour les adultes."), { price_min: 2, price_max: 5 });
  assert.deepEqual(price("Tarif unique : 8,50 €"), { price_min: 8.5 });
  assert.deepEqual(price("Entrée libre sur inscription"), { price_min: 0 });
  assert.deepEqual(price("", ["concert", "gratuit"]), { price_min: 0 });
  assert.deepEqual(price("Participation libre, à partir de 5€ par personne"), { is_pay_what_you_want: true });
  assert.deepEqual(price("Variable selon spectacle"), {});
});

test("lieux : une ville seule ou une adresse sans voie ne désignent aucun lieu", () => {
  const locations = [
    { id: "secret", name: "Adresse Secrète", address: "Orléans" },
    { id: "my-beers", name: "My Beers Fleury-Les-Aubrais", address: "79 Rue André Dessaux 45400 Fleury-les-Aubrais" },
    { id: "tete-noire", name: "Théâtre de la Tête Noire", address: "144 Ancienne Route de Chartres 45770 Saran" },
    { id: "mam", name: "Maison des Arts et de la Musique (MAM)", address: "10 Cours Victor Hugo 45100 Orléans" },
  ];
  const resolve = (name, address) => resolveLocationFromImportedData(locations, name, address)?.id ?? null;
  // Cas lus sur On sort ! : lieux absents d'OutLive.
  assert.equal(resolve("Pavillon Culture", "29 boulevard marie stuart, Orléans"), null);
  assert.equal(resolve("Parc de Lamballe", "57 boulevard de Lamballe, Fleury-les-Aubrais"), null);
  assert.equal(resolve("Galerie du château de l'étang,", "45770 Saran"), null);
  // Une adresse qui nomme la voie reste reconnue.
  assert.equal(resolve("Salle municipale", "Cours Victor Hugo 45100 ORLEANS"), "mam");
  assert.equal(resolve("Théâtre municipal", "144 ancienne route de Chartres 45770 Saran"), "tete-noire");
  assert.equal(resolve("My Beers", "79 rue André Dessaux, Fleury-les-Aubrais"), "my-beers");
});
