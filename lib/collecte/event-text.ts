import { FIRST_NAMES } from "@/lib/events/first-names";
import { stripDateFromTitle } from "@/lib/scraping/dates";

/*
 * Titres et descriptions des événements importés (agent de collecte, imports de l'admin, données
 * déjà en base) : l'app les affiche tels quels.
 * - Titre : date et lieu répétés retirés (la carte les affiche déjà), capitales remises en casse
 *   normale (noms propres en majuscule initiale, titres d'œuvres en minuscules, sigles gardés),
 *   guillemets français, « 1re partie ».
 * - Description : blocs collés séparés, lignes coupées recollées, paragraphes gardés ; hashtags,
 *   appels de billetterie et signatures retirés.
 * Module pur (navigateur et serveur). Espaces ordinaires partout : l'app pose les espaces
 * insécables de la typographie française à l'affichage.
 */

export type EventTitleContext = {
  /** Lieu de l'événement (nom de sa fiche, nom annoncé) : retiré du titre s'il y est répété. */
  venues?: Array<string | null | undefined>;
  /** Catégorie : un titre de concert en capitales est une liste de noms. */
  category?: string | null;
  /** Noms connus (artistes, lieux, organisateurs) : leur graphie l'emporte sur la règle. */
  knownNames?: Array<string | null | undefined>;
};

/** Défauts repérés dans un titre (vue « Titres à revoir » de l'admin). */
export type EventTitleIssue = "date" | "capitales" | "lieu" | "guillemets";

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

const LETTER = /\p{L}/u;
const LOWERCASE = /\p{Ll}/u;
const VOWEL = /[aeiouyàâäéèêëîïôöùûüÿœæ]/;

/** Minuscules sans accents, apostrophes unifiées, ponctuation réduite à des espaces. */
function plain(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tidySpaces(value: string) {
  return value.replace(/\p{Zs}+/gu, " ").replace(/\s+/g, " ").trim();
}

function letterCount(value: string) {
  return (value.match(/\p{L}/gu) || []).length;
}

function wordCount(value: string) {
  return value.split(" ").filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** Catégorie musicale (« Concert », « DJ Set ») : ses titres en capitales sont des noms d'artistes. */
function isMusicCategory(category: string | null | undefined) {
  return /\b(concert|dj|musique|music)/.test(plain(category || ""));
}

/* ------------------------------------------------------------------ */
/* Titres : date, lieu, guillemets                                     */
/* ------------------------------------------------------------------ */

/** « 1ERE PARTIE », « 1ère Partie », « 1ere partie » → « 1re partie ». */
const SUPPORT_ACT = /\b1\s*(?:[èeé]re|re)\s+partie\b/giu;

/** Nom de lieu comparable : sans article de tête (« L'Astrolabe » = « l'astrolabe » = « Astrolabe »). */
function venueKey(value: string) {
  return plain(value)
    .replace(/^(?:l'|la |le |les )/, "")
    .replace(/'/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ce qui introduit un lieu : « à », « au », « @ », « - », « | », « : », parenthèse. */
const VENUE_LINK = /\s+(?:à|a|au|aux|chez)\s+|\s*@\s*|\s+[-–—|:]\s+|\s*\(\s*/giu;

/**
 * Retire le lieu de l'événement répété en fin de titre (« Concert de Peter Doherty à l'Astrolabe »,
 * « … @ Dropkick, Orléans », « Drache Nationale - Théâtre de la Tête Noire ») ou en tête (« Le 108 -
 * Projection »). Il en reste au moins deux mots : « Concert au Bouillon » ne devient pas « Concert ».
 */
function stripVenue(title: string, venues: Array<string | null | undefined>) {
  const keys = [...new Set(venues.filter((venue): venue is string => Boolean(venue)).map(venueKey))].filter(
    (key) => key.length >= 3,
  );
  if (keys.length === 0) return title;
  const isVenue = (text: string) => {
    const candidate = text.replace(/\s*\)\s*$/, "").trim();
    // « Dropkick, Orléans » : la ville après le lieu.
    return [candidate, candidate.replace(/\s*[,–—-]\s*[^,–—-]+$/, "")].some((value) => keys.includes(venueKey(value)));
  };
  const links = [...title.matchAll(VENUE_LINK)];
  for (const link of [...links].reverse()) {
    const head = title.slice(0, link.index).trim();
    if (isVenue(title.slice(link.index + link[0].length)) && wordCount(head) >= 2) return head;
  }
  for (const link of links) {
    if (!/[-–—|:]/.test(link[0])) continue;
    const tail = title.slice(link.index + link[0].length).trim();
    if (isVenue(title.slice(0, link.index)) && wordCount(tail) >= 2) return tail;
  }
  return title;
}

/** Guillemets droits ou anglais par paires → « … » (espaces ordinaires à l'intérieur). */
function frenchQuotes(title: string) {
  let value = title.replace(/“\s*([^“”]*?)\s*”/g, "« $1 »");
  const straight = (value.match(/"/g) || []).length;
  if (straight >= 2 && straight % 2 === 0) value = value.replace(/"\s*([^"]*?)\s*"/g, "« $1 »");
  return value.replace(/«\s*/g, "« ").replace(/\s*»/g, " »");
}

/* ------------------------------------------------------------------ */
/* Titres : capitales                                                  */
/* ------------------------------------------------------------------ */

/** Sigles avec voyelles, gardés en capitales (ceux sans voyelle le sont d'office : DJ, TTN, XXL). */
const ACRONYMS = new Set(["ccno", "cdno", "crij", "esad", "ep", "frac", "irl", "mam", "poctb", "ueot", "uk", "usa", "xy"]);
/** Abréviations sans voyelle qui ne sont pas des sigles (« ST GRAAL » → « St Graal »). */
const ABBREVIATIONS = new Set(["dr", "mlle", "mme", "mr", "st", "ste"]);

/** Mot en capitales qui est un sigle : « DJ », « CCNO », « PDF » (pas « KA », ni « FLUX »). */
function isAcronym(word: string) {
  const letters = word.replace(/\P{L}/gu, "").toLowerCase();
  if (letters.length < 2 || LOWERCASE.test(word) || ABBREVIATIONS.has(letters)) return false;
  return ACRONYMS.has(letters) || !VOWEL.test(letters);
}

/** Mots dont les capitales ont perdu l'accent (« LA PETITE SCENE »). */
const CAPS_ACCENTS: Record<string, string> = {
  americain: "américain",
  americaine: "américaine",
  cinema: "cinéma",
  deuxieme: "deuxième",
  ecole: "école",
  electro: "électro",
  electronique: "électronique",
  etoile: "étoile",
  etoiles: "étoiles",
  evenement: "événement",
  fete: "fête",
  opera: "opéra",
  premiere: "première",
  reve: "rêve",
  reves: "rêves",
  scene: "scène",
  scenes: "scènes",
  soiree: "soirée",
  theatre: "théâtre",
  troisieme: "troisième",
};

/** Noms propres courants dans les titres d'Orléans, gardés en majuscule dans une phrase. */
const PROPER_NOUNS: Record<string, string> = {
  france: "France",
  halloween: "Halloween",
  loire: "Loire",
  noel: "Noël",
  orleans: "Orléans",
  paques: "Pâques",
  paris: "Paris",
  toussaint: "Toussaint",
};

/**
 * Mots en minuscules dans un nom, sauf en tête (« Suzanne de Baecque », « Cirque le Roux ») : ceux du
 * trigger des noms de lieux, d'organisateurs et d'artistes (`format_entity_label`), et quelques autres.
 */
const NAME_PARTICLES = new Set([
  "à", "au", "aux", "avec", "chez", "dans", "de", "der", "des", "du", "en", "et", "la", "le", "les", "ou", "par",
  "pour", "sous", "sur", "van", "von",
]);
/** Et dans un nom composé (« Saint-Pierre-le-Puellier », « Vitry-aux-Loges »). */
const HYPHEN_PARTICLES = new Set(["au", "aux", "d", "de", "des", "du", "en", "la", "le", "les", "lès", "sous", "sur"]);
const ELISION = /^(qu|[cdjlmnst])(['’])(.+)$/iu;
/** Mots d'une phrase, pas d'un nom (« TRENET EN PASSANT », « ALICE AU PAYS… »). */
const PHRASE_WORDS = new Set(["a", "au", "aux", "avec", "d", "dans", "de", "des", "du", "en", "par", "pour", "sur"]);

const PLAIN_FIRST_NAMES = new Set([...FIRST_NAMES].map(plain));

/** Majuscule à la première lettre, minuscules ensuite (« (BY » → « (By »). */
function capitalize(word: string) {
  return word.toLowerCase().replace(/^(\P{L}*)(\p{L})/u, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
}

/** Accents rétablis (« SCENE » → « scène »), noms propres gardés (« ORLÉANS » → « Orléans »). */
function restoreWord(lower: string) {
  return lower.replace(/\p{L}+/u, (letters) => PROPER_NOUNS[plain(letters)] ?? CAPS_ACCENTS[letters] ?? letters);
}

/** Un mot d'un nom propre : « D'HOMMES-ORCHESTRES » → « d'Hommes-Orchestres », « PROJET.PDF » → « Projet.PDF ». */
function nameWord(word: string, startsName: boolean): string {
  return word
    .split("-")
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index > 0 && HYPHEN_PARTICLES.has(lower)) return lower;
      const elision = ELISION.exec(part);
      if (elision) {
        const prefix = startsName && index === 0 ? capitalize(elision[1]) : elision[1].toLowerCase();
        return `${prefix}${elision[2]}${nameWord(elision[3], true)}`;
      }
      return part
        .split(".")
        .map((piece) => (isAcronym(piece) ? piece : capitalize(restoreWord(piece.toLowerCase()))))
        .join(".");
    })
    .join("-");
}

/** Liste de noms en capitales : « SARAH DEVAUX, COMPAGNIE MENTEUSES » → « Sarah Devaux, Compagnie Menteuses ». */
function nameCase(segment: string) {
  let startsName = true;
  return segment
    .split(" ")
    .map((word) => {
      let result: string;
      if (!LETTER.test(word)) result = word;
      else if (!startsName && NAME_PARTICLES.has(word.toLowerCase())) result = word.toLowerCase();
      else if (isAcronym(word)) result = word;
      else result = nameWord(word, startsName);
      // « Abou Lagraa & Ballet… », « Sarah Devaux, Compagnie… » : un nouveau nom commence.
      startsName = !LETTER.test(word) || /,$/.test(word);
      return result;
    })
    .join(" ");
}

/** Un mot d'une phrase en capitales, en minuscules : accents rétablis, noms propres gardés. */
function sentenceWord(word: string) {
  if (/^sainte?-/i.test(word)) return nameWord(word, true);
  return word
    .split("-")
    .map((part) => {
      const elision = ELISION.exec(part);
      const [prefix, core] = elision ? [`${elision[1].toLowerCase()}${elision[2]}`, elision[3]] : ["", part];
      return prefix + restoreWord(core.toLowerCase());
    })
    .join("-");
}

type KnownName = { words: string[]; canonical: string[] };

/** Titre d'œuvre en capitales : « LE MALADE IMAGINAIRE » → « Le malade imaginaire ». */
function sentenceCase(segment: string, knownNames: KnownName[]) {
  const words = segment.split(" ");
  const cased = words.map((word, index) => {
    if (!LETTER.test(word)) return word;
    if (isAcronym(word)) return word;
    if (letterCount(word) === 1) {
      // « EST A TOI » : un « A » seul est un « à » sans accent ; « UN H » garde sa capitale.
      return /^a$/i.test(word.replace(/\P{L}/gu, "")) && index > 0 ? word.toLowerCase().replace("a", "à") : word;
    }
    return sentenceWord(word);
  });
  // Majuscule en tête (pas après un nombre : « 20 ans ») et après une fin de phrase (« ! La Passerelle »).
  let atStart = true;
  for (let index = 0; index < cased.length; index += 1) {
    const word = cased[index];
    const startsSentence = atStart || (index > 0 && /[.!?…]$/.test(cased[index - 1]));
    if (startsSentence && /^\P{L}*\p{L}/u.test(word) && !/^\P{L}*\p{N}/u.test(word)) {
      cased[index] = word.replace(/\p{L}/u, (letter) => letter.toUpperCase());
    }
    if (/[\p{L}\p{N}]/u.test(word)) atStart = false;
  }
  // Noms connus de plusieurs mots (« La Passerelle ») : leur graphie.
  const keys = words.map(plain);
  for (const known of knownNames) {
    for (let start = 0; start + known.words.length <= keys.length; start += 1) {
      if (known.words.every((key, offset) => keys[start + offset] === key)) {
        known.canonical.forEach((canonical, offset) => {
          cased[start + offset] = cased[start + offset].replace(/[\p{L}\p{N}'’.-]+/u, canonical);
        });
      }
    }
  }
  return cased.join(" ");
}

/** Tout en capitales : deux mots au moins (hors sigles), ou un seul mot entier de 4 lettres et plus. */
function isShouting(segment: string) {
  const tokens = segment.split(" ").filter((token) => LETTER.test(token));
  if (tokens.length === 0 || tokens.some((token) => LOWERCASE.test(token))) return false;
  const words = tokens.filter((token) => letterCount(token) >= 2 && !isAcronym(token));
  if (words.length >= 2) return true;
  // « RÊVES », « PANIQUE!! » ; pas « OR'IGINE » ni « FOLIE'S », écrits ainsi à dessein.
  return tokens.length === 1 && words.length === 1 && letterCount(words[0]) >= 4 && PLAIN_WORD.test(words[0]);
}

/** Mot sans fantaisie : lettres, élision (« L'EAU »), point ou trait d'union internes (« PROJET.PDF »). */
const PLAIN_WORD = /^(?:(?:qu|[cdjlmnst])['’])?\p{L}+(?:[.-]\p{L}+)*[!?.…,]*$/iu;

/** Segment en capitales qui contient un mot à convertir (hors sigles et lettres seules). */
function hasCapsWord(segment: string) {
  const tokens = segment.split(" ").filter((token) => LETTER.test(token));
  return (
    tokens.length > 0 &&
    !tokens.some((token) => LOWERCASE.test(token)) &&
    tokens.some((token) => letterCount(token) >= 2 && !isAcronym(token) && PLAIN_WORD.test(token))
  );
}

/** Groupe de mots qui se lit comme une phrase : article en tête, ou « en », « de », « au »… au milieu. */
function looksLikePhrase(segment: string) {
  const words = plain(segment).split(/[\s']+/).filter(Boolean);
  return (/^(le|la|les|l|un|une|des)$/.test(words[0] || "") && words.length >= 3) || words.slice(1).some((word) => PHRASE_WORDS.has(word));
}

/** Nom connu qui ressemble à un titre recopié (« Alcest + 1ere Partie », « Pluto #1 : The Gnomes ») : ignoré. */
function isUsableKnownName(name: string) {
  return LOWERCASE.test(name) && !/\s[+:|–—-]\s|,\s|["«»#]/.test(name);
}

/**
 * Accents d'un nom connu, casse de la règle (« Leila Martial » + « Leïla Martial » → « Leïla Martial » ;
 * « Collectif XY » + « Collectif Xy » → « Collectif XY ») ; le nom connu tel quel s'il s'écrit autrement.
 */
function withAccentsOf(known: string | undefined, cased: string) {
  if (!known) return cased;
  if (known.length !== cased.length) return known;
  return [...known]
    .map((char, index) => (cased[index] === cased[index].toUpperCase() ? char.toUpperCase() : char.toLowerCase()))
    .join("");
}

const SEGMENT_SEPARATOR = /(\s+[|/+_:–—-]\s+|\s*[«»]\s*)/u;

/**
 * Remet en casse normale les passages en capitales, segment par segment (séparés par « | », « - »,
 * « : », « / », « + », guillemets). Un nom connu garde sa graphie. Noms propres (après « | », plateau
 * « A + B », concert, prénom en tête) : majuscule à chaque mot, sauf « de », « la »… Sinon, titre
 * d'œuvre : majuscule au premier mot. Les sigles restent en capitales, les passages déjà en casse
 * mixte ne bougent pas.
 */
function fixCapitals(title: string, context: EventTitleContext) {
  const parts = title.split(SEGMENT_SEPARATOR);
  const separator = (index: number) => (parts[index] || "").trim();
  // Converti : un passage en capitales ; dans un titre tout en capitales, un plateau ou après « | »,
  // même d'un seul mot court (« 808 LAB », « ST GRAAL + 1re partie »).
  const allCaps = !LOWERCASE.test(title);
  const convertible = (index: number) =>
    isShouting(parts[index]) ||
    ((allCaps || [separator(index - 1), separator(index + 1)].includes("+") || separator(index - 1) === "|") &&
      hasCapsWord(parts[index]));
  if (!parts.some((_part, index) => index % 2 === 0 && convertible(index))) return title;

  const known = (context.knownNames || [])
    .filter((name): name is string => typeof name === "string" && isUsableKnownName(name))
    .map((name) => tidySpaces(name));
  const knownByKey = new Map(known.map((name) => [plain(name), name]));
  const knownSequences: KnownName[] = known
    .map((name) => ({ words: name.split(" ").map(plain), canonical: name.split(" ") }))
    .filter((entry) => entry.words.length >= 2);
  const music = isMusicCategory(context.category);

  return parts
    .map((part, index) => {
      if (index % 2 === 1 || !convertible(index)) return part;
      const knownName = knownByKey.get(plain(part));
      const before = separator(index - 1);
      const lineUp = before === "+" || separator(index + 1) === "+";
      const firstName = PLAIN_FIRST_NAMES.has(plain(part).split(" ")[0] || "") && wordCount(part) >= 2 && wordCount(part) <= 4;
      const names = before !== "«" && (before === "|" || lineUp || ((music || firstName) && !looksLikePhrase(part)));
      // Nom connu : c'est un nom propre (« KID FRANCESCOLI »), avec ses accents (« LEILA » → « Leïla »).
      if (names || knownName) return withAccentsOf(knownName, nameCase(part));
      return sentenceCase(part, knownSequences);
    })
    .join("");
}

/* ------------------------------------------------------------------ */
/* Titres : point d'entrée                                             */
/* ------------------------------------------------------------------ */

/** Date écrite qui reste dans un titre (« … novembre 2026 », « jeudi 12 », « 21/11 ») ; pas « 30/30 » ni « 1926 ». */
function hasRemainingDate(title: string) {
  if (/\b20[2-3]\d\b|\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\b/iu.test(title)) return true;
  return [...title.matchAll(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/g)].some(
    ([, day, month]) => Number(day) >= 1 && Number(day) <= 31 && Number(month) >= 1 && Number(month) <= 12,
  );
}

function titleSteps(title: string | null | undefined, context: EventTitleContext) {
  const raw = tidySpaces(title || "");
  const supportAct = raw.replace(SUPPORT_ACT, "1re partie");
  const undated = stripDateFromTitle(supportAct);
  const withoutVenue = stripVenue(undated, context.venues || []);
  const quoted = frenchQuotes(withoutVenue);
  const cased = fixCapitals(quoted, context);
  const result = tidySpaces(cased.replace(/\s+_\s+/g, " – "))
    .replace(/^[\s|:,–—-]+|[\s|:,–—-]+$/g, "")
    .trim();
  return { raw, supportAct, undated, withoutVenue, quoted, cased, result: result || raw };
}

/** Titre propre (voir l'en-tête du module) ; un titre vide reste vide. */
export function cleanEventTitle(title: string | null | undefined, context: EventTitleContext = {}) {
  return titleSteps(title, context).result;
}

/** Défauts d'un titre et correction proposée (vue « Titres à revoir » de l'admin). */
export function findTitleIssues(title: string | null | undefined, context: EventTitleContext = {}) {
  const steps = titleSteps(title, context);
  const issues: EventTitleIssue[] = [];
  if (steps.undated !== steps.supportAct || hasRemainingDate(steps.result)) issues.push("date");
  if (steps.cased !== steps.quoted) issues.push("capitales");
  if (steps.withoutVenue !== steps.undated) issues.push("lieu");
  if (/["“”]/.test(steps.result) || steps.quoted !== steps.withoutVenue) issues.push("guillemets");
  return { issues, suggestion: steps.result };
}

/* ------------------------------------------------------------------ */
/* Descriptions                                                        */
/* ------------------------------------------------------------------ */

const URL = /(?:https?:\/\/|www\.)\S+/gi;
const TICKETING_SITE =
  /\b(?:billetweb|helloasso|weezevent|shotgun|mapado|fnacspectacles|ticketmaster|seetickets|dice\.fm|yurplan|billetreduc|eventbrite|digitick|festik|ticketac|francebillet|tickettailor|linktr\.ee)\b/i;
const TICKETING_WORD = /\b(?:billet(?:s|terie)?|tickets?|r[ée]serv(?:ation|ations|ez|er)|pr[ée]ventes?|places?)\b/iu;
const IN_BIO = /\blien\s+(?:en|dans\s+(?:la|ma|notre))\s+bio\b|\blink\s+in\s+bio\b/iu;
const HASHTAG = /#\p{L}[\p{L}\p{N}_]*/gu;
const SIGNATURE =
  /^(?:[-–—]\s*)?(?:l['’]équipe|toute l['’]équipe|la team|bisous|bises|à (?:très )?(?:vite|bientôt)|a (?:tres )?(?:vite|bientot)|cordialement|amicalement|see you)\b/iu;

/** Débuts de phrase reconnus quand ils sont collés au mot précédent (« ansSoyez », « ArcEn », « 20 €A partir »). */
const SENTENCE_STARTS = [
  "A partir", "À partir", "Au", "Aux", "Avec", "Ce", "Cette", "Dans", "Des", "Elle", "Elles", "En", "Et", "Il", "Ils", "La", "Le", "Les",
  "Mais", "Nous", "On", "Pour", "Puis", "Réservez", "Si", "Soyez", "Sur", "Un", "Une", "Venez", "Vous",
].join("|");

/** Ligne qui renvoie seulement vers la billetterie (le bouton de l'app le fait déjà). */
function isTicketingLine(line: string) {
  if (IN_BIO.test(line)) return true;
  const urls = line.match(URL) || [];
  if (urls.length === 0) return false;
  const rest = line.replace(URL, "").replace(/[\s:.,;!→👉⬇️🎟️🎫-]+/gu, " ").trim();
  if (urls.some((url) => TICKETING_SITE.test(url))) return rest.length <= 60;
  return TICKETING_WORD.test(rest) && rest.length <= 40;
}

/** Ligne faite seulement de hashtags (« #Jazz #Orléans »). */
function isHashtagLine(line: string) {
  return (line.match(HASHTAG) || []).length >= 1 && !LETTER.test(line.replace(HASHTAG, ""));
}

/**
 * Description propre : blocs collés par la page source séparés (« possible.Tu verras »,
 * « pratiques📍 Lieu »), lignes coupées au milieu d'une phrase recollées, paragraphes gardés ;
 * hashtags, renvois vers la billetterie ou « lien en bio » et signatures de fin retirés.
 */
export function cleanEventDescription(text: string | null | undefined) {
  if (!text) return "";
  // Les liens ne bougent pas (« www.Exemple.fr ») : mis de côté pendant le découpage.
  const urls: string[] = [];
  const unglued = text
    .replace(URL, (url) => `⟦${urls.push(url) - 1}⟧`)
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/gu, " ")
    // Séparateurs « ______ » : un paragraphe.
    .replace(/ ?[_=~]{4,} ?/g, "\n\n")
    .replace(/^ ?[-*•·]{4,} ?$/gm, "")
    // Fin de phrase collée au début d'un bloc : « possible.Tu verras », « Orléans !Jusqu'ici ».
    .replace(/([\p{Ll}\p{N}…»)\]] ?[.!?…]+)(?=\p{Lu}\p{Ll})/gu, "$1\n")
    // Phrase en capitales collée : « le coeur ?OUVERTURE DES PORTES ».
    .replace(/([\p{Ll}\p{N}…»)\]] ?[.!?…]+)(?=\p{Lu}{2,}(?!\p{Ll}))/gu, "$1\n")
    // Puce collée : « Sessions :• 18h45 (…)• 20h15 ».
    .replace(/(\S)•(?= )/g, "$1\n•")
    // Intitulé collé à la suite : « Y accéder :En tram ».
    .replace(/(\S) ?:(?=\p{Lu}\p{Ll})/gu, "$1 :\n")
    // Puce en émoji collée : « pratiques📍 Lieu », « Orléans🚋 Y accéder ».
    .replace(/([\p{L}\p{N}.!?…)»:])(?=\p{Extended_Pictographic}[^\s\p{L}]* ?\p{Lu})/gu, "$1\n")
    // Bloc en capitales collé : « Palapapai ProdTOUT PUBLIC » (pas « iOS »), « COMEDY CLUBPréparez-vous »,
    // « FANJANCe groupe » (pas « DVDs »), « rafraîchissanteJ'ai connu ».
    .replace(/(\p{Ll})(?=\p{Lu}{3,}(?!\p{Ll}))/gu, "$1\n")
    .replace(/(\p{Lu}{2,})(\p{Lu}\p{Ll}+)/gu, (match, caps: string, word: string) =>
      // Pas un nombre romain et son suffixe (« XXIe siècle », « XIXème »), ni un sigle au pluriel (« DVDs »).
      /^[IVXLCDM]+$/.test(caps + word[0]) && /^(?:e|er|re|ère|ème|eme|es|ers|res)$/.test(word.slice(1)) ||
      word.slice(1) === "s"
        ? match
        : `${caps}\n${word}`,
    )
    .replace(/(\p{Ll})(?=\p{Lu}['’]\p{Ll})/gu, "$1\n")
    // Phrase collée au mot précédent : « 16 ansSoyez sur place », « Jeanne d'ArcEn voiture » (pas « YouTube »).
    .replace(new RegExp(`([\\p{Ll}€)])(?=(?:${SENTENCE_STARTS})\\s)`, "gu"), "$1\n")
    .replace(/⟦(\d+)⟧/g, (_match, index: string) => urls[Number(index)]);

  const lines: string[] = [];
  for (const rawLine of unglued.split("\n")) {
    const line = rawLine.trim();
    if (line && (isHashtagLine(line) || isTicketingLine(line))) continue;
    const previous = lines[lines.length - 1];
    // Ligne coupée au milieu d'une phrase : la suite commence par une minuscule.
    if (previous && line && !/[.!?…:;»)\]"”]$/u.test(previous) && /^[\p{Ll}(«]/u.test(line)) {
      lines[lines.length - 1] = `${previous} ${line}`;
    } else {
      lines.push(line);
    }
  }

  // Fin du texte : lignes vides, signature, émojis seuls, hashtags en série.
  for (let guard = 0; guard < 6 && lines.length; guard += 1) {
    const last = lines[lines.length - 1];
    const trailing = /(?:\s*#\p{L}[\p{L}\p{N}_]*){2,}\s*$/u.exec(last);
    if (!last || (lines.length > 1 && ((last.length <= 80 && SIGNATURE.test(last)) || !/[\p{L}\p{N}]/u.test(last)))) {
      lines.pop();
    } else if (trailing) {
      lines[lines.length - 1] = last.slice(0, trailing.index).trim();
    } else {
      break;
    }
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
