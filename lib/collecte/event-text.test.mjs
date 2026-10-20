/*
 * Titres et descriptions des événements importés : cas réels relevés en prod le 20/10/2026
 * (Scène nationale d'Orléans, L'Astrolabe, La Passerelle, Orléans Comedy Club, Théâtre de la Tête Noire…).
 *   node --test lib/collecte/event-text.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const { cleanEventDescription, cleanEventTitle, findTitleIssues } = await jiti.import(
  path.join(root, "lib/collecte/event-text.ts"),
);

/* ------------------------------------------------------------------ */
/* Titres                                                              */
/* ------------------------------------------------------------------ */

test("titres : date retirée (jour, date, mois et année)", () => {
  assert.equal(cleanEventTitle("Atelier broderie - dim. 01/11"), "Atelier broderie");
  assert.equal(cleanEventTitle("Open Mic - Samedi 17/10/2026"), "Open Mic");
  assert.equal(cleanEventTitle("30/30 - Jeudi 22/10/2026"), "30/30");
  assert.equal(cleanEventTitle("Live de chant - Novembre 2026"), "Live de chant");
  assert.equal(cleanEventTitle("Nuit du 4 août"), "Nuit du 4 août");
  assert.equal(cleanEventTitle("Festival du 19 au 21/11"), "Festival du 19 au 21/11");
});

test("titres : lieu répété retiré, s'il reste un vrai titre", () => {
  assert.equal(cleanEventTitle("Concert de Peter Doherty à l'Astrolabe", { venues: ["L'astrolabe"] }), "Concert de Peter Doherty");
  assert.equal(cleanEventTitle("Match d'impro à L'Alliage", { venues: ["L'alliage"] }), "Match d'impro");
  assert.equal(cleanEventTitle("Cabaret d'impro à la Java Pop", { venues: ["Java Pop"] }), "Cabaret d'impro");
  assert.equal(cleanEventTitle("Soirée électro au Bouillon", { venues: ["Le Bouillon"] }), "Soirée électro");
  assert.equal(
    cleanEventTitle("Edgär + Diva Strana + El Coyoté @ Dropkick, Orléans", { venues: ["Dropkick"] }),
    "Edgär + Diva Strana + El Coyoté",
  );
  assert.equal(
    cleanEventTitle("Drache Nationale - Théâtre de la Tête Noire", { venues: ["Théâtre de la Tête Noire"] }),
    "Drache Nationale",
  );
  assert.equal(cleanEventTitle("Le 108 - Projection documentaire", { venues: ["Le 108"] }), "Projection documentaire");
  // Un seul mot resterait : le lieu reste ; au milieu du titre, il en fait partie.
  assert.equal(cleanEventTitle("Concert au Bouillon", { venues: ["Le Bouillon"] }), "Concert au Bouillon");
  assert.equal(
    cleanEventTitle("La Passerelle fait son cirque", { venues: ["La Passerelle"] }),
    "La Passerelle fait son cirque",
  );
  // Un autre lieu que celui de l'événement ne bouge pas.
  assert.equal(cleanEventTitle("Match d'impro au Théâtre Gérard-Philipe", { venues: ["L'alliage"] }), "Match d'impro au Théâtre Gérard-Philipe");
});

test("titres : guillemets français et « 1re partie »", () => {
  assert.equal(cleanEventTitle('"Entre les murs" de Laurent Cantet'), "« Entre les murs » de Laurent Cantet");
  assert.equal(
    cleanEventTitle('Rosa Bursztein dans "Dédoublée" - Mercredi 21/10/2026'),
    "Rosa Bursztein dans « Dédoublée »",
  );
  assert.equal(cleanEventTitle('Alicia Cesttout dans "Insolences"- Mercredi 28/10/2026'), "Alicia Cesttout dans « Insolences »");
  assert.equal(cleanEventTitle("Projection de “Jesus Christ Superstar”"), "Projection de « Jesus Christ Superstar »");
  assert.equal(cleanEventTitle('Vinyle 12" et platines'), 'Vinyle 12" et platines');
  assert.equal(
    cleanEventTitle("ST GRAAL + 1ère Partie à l'Astrolabe", { venues: ["L'astrolabe"], category: "Concert" }),
    "St Graal + 1re partie",
  );
});

test("titres : noms en capitales après « | » (Scène nationale)", () => {
  assert.equal(cleanEventTitle("Plonger | SARAH DEVAUX, COMPAGNIE MENTEUSES"), "Plonger | Sarah Devaux, Compagnie Menteuses");
  assert.equal(
    cleanEventTitle("Carmen | ABOU LAGRAA & BALLET DE L'OPÉRA DE TUNIS"),
    "Carmen | Abou Lagraa & Ballet de l'Opéra de Tunis",
  );
  assert.equal(
    cleanEventTitle("La mémoire de ma mère | L'ORCHESTRE D'HOMMES-ORCHESTRES"),
    "La mémoire de ma mère | L'Orchestre d'Hommes-Orchestres",
  );
  assert.equal(cleanEventTitle("Le Grenier | LES 7 DOIGTS DE LA MAIN"), "Le Grenier | Les 7 Doigts de la Main");
  assert.equal(
    cleanEventTitle("Short Message Service | SUZANNE DE BAECQUE, JOAQUIM FOSSI"),
    "Short Message Service | Suzanne de Baecque, Joaquim Fossi",
  );
  assert.equal(
    cleanEventTitle("The Last Rose | ROSEMARY STANDLEY & LES MUSICIENS DE SAINT-JULIEN"),
    "The Last Rose | Rosemary Standley & Les Musiciens de Saint-Julien",
  );
  assert.equal(cleanEventTitle("Atelier danse #1 | LEÏLA KA"), "Atelier danse #1 | Leïla Ka");
  // Sigles gardés : sans voyelle (XXL, PDF) ou connus (XY).
  assert.equal(cleanEventTitle("XXL | SOFIANE CHALAL"), "XXL | Sofiane Chalal");
  assert.equal(cleanEventTitle("Le Pas du Monde | COLLECTIF XY"), "Le Pas du Monde | Collectif XY");
  assert.equal(cleanEventTitle("Portés de femmes | PROJET.PDF"), "Portés de femmes | Projet.PDF");
  assert.equal(cleanEventTitle("Amazigh | FILIPE LOURENÇO, PLAN K"), "Amazigh | Filipe Lourenço, Plan K");
});

test("titres : plateaux et concerts en capitales", () => {
  const concert = { category: "Concert" };
  assert.equal(cleanEventTitle("ALCEST + 1ERE PARTIE", concert), "Alcest + 1re partie");
  assert.equal(cleanEventTitle("JEANNE ADDED + 1ÈRE PARTIE", concert), "Jeanne Added + 1re partie");
  assert.equal(cleanEventTitle("LA JUNGLE + SODOM & SAGESSE", concert), "La Jungle + Sodom & Sagesse");
  assert.equal(
    cleanEventTitle("JASMINE NOT JAFAR + LAVOMATIC + DJ STRONGER", concert),
    "Jasmine Not Jafar + Lavomatic + DJ Stronger",
  );
  assert.equal(
    cleanEventTitle("808 LAB : GUERTA + J.T GHOWST + MORDO BFK + KENEDY", concert),
    "808 Lab : Guerta + J.T Ghowst + Mordo BFK + Kenedy",
  );
  assert.equal(cleanEventTitle("BASSEY & THE GOSPEL TEAM", concert), "Bassey & The Gospel Team");
  assert.equal(cleanEventTitle("PLUTO #1 : THE GNOMES", concert), "Pluto #1 : The Gnomes");
  // Concert dont le titre se lit comme une phrase : majuscule au premier mot seulement.
  assert.equal(
    cleanEventTitle("TRENET EN PASSANT : Un trio au son de Charles Trenet", concert),
    "Trenet en passant : Un trio au son de Charles Trenet",
  );
  assert.equal(cleanEventTitle("LA PETITE SCENE #4", concert), "La Petite Scène #4");
  // Écrits ainsi à dessein : une apostrophe de style, des capitales dans une casse mixte.
  assert.equal(cleanEventTitle("FOLIE'S + 1ERE PARTIE", concert), "FOLIE'S + 1re partie");
  assert.equal(cleanEventTitle("Victor HUGOAT - n°1 du rap français"), "Victor HUGOAT - n°1 du rap français");
  assert.equal(cleanEventTitle("Apéro du TTN - Les écritures québécoises"), "Apéro du TTN - Les écritures québécoises");
});

test("titres : œuvres en capitales, majuscule au premier mot (et au nom après l'article défini)", () => {
  const spectacle = { category: "Spectacle" };
  assert.equal(cleanEventTitle("COMMENT ATTRAPER UNE ÉTOILE", spectacle), "Comment attraper une étoile");
  // Usage typographique des titres d'œuvres : article défini en tête, majuscule au nom qui suit.
  assert.equal(cleanEventTitle("LE MALADE IMAGINAIRE", spectacle), "Le Malade imaginaire");
  assert.equal(cleanEventTitle("LE VERTIGE DE L'ENVERS", spectacle), "Le Vertige de l'envers");
  assert.equal(cleanEventTitle("LES SIMONES", spectacle), "Les Simones");
  assert.equal(cleanEventTitle("L'ENVERS DU DÉCOR", spectacle), "L'Envers du décor");
  assert.equal(cleanEventTitle("LE PLUS BEAU JOUR", spectacle), "Le plus beau jour");
  assert.equal(cleanEventTitle("UNE ANNÉE FÉROÏENNE", { category: "Cinéma" }), "Une année féroïenne");
  // Prénoms en liste, points de suspension qui ne finissent pas la phrase.
  assert.equal(cleanEventTitle("WILLIAM, YOLANDA, PAUL... ET LES AUTRES", spectacle), "William, Yolanda, Paul... et les autres");
  assert.equal(cleanEventTitle("BUBBLE BOUM, ÇA CHAUFFE SUR LE RING", { category: "DJ Set" }), "Bubble boum, ça chauffe sur le ring");
  assert.equal(cleanEventTitle("LE CABARET MAGNIFIQUE : 1926", spectacle), "Le Cabaret magnifique : 1926");
  assert.equal(cleanEventTitle("RÊVES", spectacle), "Rêves");
  assert.equal(cleanEventTitle("PANIQUE!!", spectacle), "Panique!!");
  // Accents perdus par les capitales, « A » pour « à », lettre seule gardée.
  assert.equal(
    cleanEventTitle("MARCHE A L'ETOILE, LA DIAGONALE SUD-AMERICAINE", { category: "Cinéma" }),
    "Marche à l'étoile, la diagonale sud-américaine",
  );
  assert.equal(
    cleanEventTitle("LA SCENE EST A TOI - La scène ouverte Zigotastiques", spectacle),
    "La Scène est à toi - La scène ouverte Zigotastiques",
  );
  assert.equal(cleanEventTitle("ATELIER / HADRIEN AVEC UN H", { category: "Atelier" }), "Atelier / Hadrien avec un H");
  // Nom connu dans une phrase, séparateur « _ ».
  assert.equal(
    cleanEventTitle("20 ANS ! LA PASSERELLE FAIT SON CIRQUE ! _ Partie 1", { ...spectacle, knownNames: ["La Passerelle"] }),
    "20 ans ! La Passerelle fait son cirque ! – Partie 1",
  );
  // Personne : prénom en tête.
  assert.equal(cleanEventTitle("DAVID CASTELLO LOPES", spectacle), "David Castello Lopes");
  assert.equal(
    cleanEventTitle('EMMA BOJAN - " ATTENDS MOI J’ARRIVE ! "', spectacle),
    "Emma Bojan - « Attends moi j’arrive ! »",
  );
  assert.equal(cleanEventTitle('PICHE "CARRÉ"'), "Piche « Carré »");
});

test("titres : noms connus (artistes, tags) pour les noms propres et leurs accents", () => {
  assert.equal(cleanEventTitle("KID FRANCESCOLI", { knownNames: ["Kid Francescoli"] }), "Kid Francescoli");
  assert.equal(cleanEventTitle("KID FRANCESCOLI"), "Kid francescoli");
  assert.equal(cleanEventTitle("Jubilä | LEILA MARTIAL", { knownNames: ["Leïla Martial"] }), "Jubilä | Leïla Martial");
  // La graphie du nom connu ne l'emporte pas sur les sigles ni sur les capitales d'un nom.
  assert.equal(cleanEventTitle("Le Pas du Monde | COLLECTIF XY", { knownNames: ["Collectif Xy"] }), "Le Pas du Monde | Collectif XY");
  assert.equal(
    cleanEventTitle("Faire la Marguerite | L'EAU DU BAIN", { knownNames: ["L'eau du Bain"] }),
    "Faire la Marguerite | L'Eau du Bain",
  );
  // Un « artiste » qui est un titre recopié n'est pas un nom connu.
  assert.equal(
    cleanEventTitle("BUBBLE BOUM, ÇA CHAUFFE SUR LE RING", { knownNames: ["Bubble Boum, Ça Chauffe sur le Ring"] }),
    "Bubble boum, ça chauffe sur le ring",
  );
});

test("titres : déjà propres, rien ne bouge", () => {
  for (const title of [
    "Atelier teinture végétale (Shibori)",
    "Fulgurances Électroniques #2",
    "L'Amour Sorcier & Don Quichotte",
    "...How in salt deserts it is possible to blossom...",
    "Youn Sun Nah + 1re partie Nit And Dogs",
    "M.Elancolie",
    "Loto3000",
    "",
  ]) {
    assert.equal(cleanEventTitle(title, { category: "Concert", venues: ["L'astrolabe"] }), title);
  }
  // Appliquer deux fois ne change plus rien.
  const once = cleanEventTitle("Plonger | SARAH DEVAUX, COMPAGNIE MENTEUSES - Mercredi 21/10/2026");
  assert.equal(cleanEventTitle(once), once);
});

test("titres à revoir : défauts repérés et correction proposée", () => {
  assert.deepEqual(findTitleIssues('Rosa Bursztein dans "Dédoublée" - Mercredi 21/10/2026'), {
    issues: ["date", "guillemets"],
    suggestion: "Rosa Bursztein dans « Dédoublée »",
  });
  assert.deepEqual(findTitleIssues("Concert de Peter Doherty à l'Astrolabe", { venues: ["L'astrolabe"] }), {
    issues: ["lieu"],
    suggestion: "Concert de Peter Doherty",
  });
  assert.deepEqual(findTitleIssues("LE MALADE IMAGINAIRE"), { issues: ["capitales"], suggestion: "Le Malade imaginaire" });
  // Date restée dans le titre, sans correction automatique.
  assert.deepEqual(findTitleIssues("LIVE novembre 2026Live de chant - Novembre 2026").issues, ["date"]);
  assert.deepEqual(findTitleIssues("Le cabaret magnifique : 1926"), { issues: [], suggestion: "Le cabaret magnifique : 1926" });
  assert.deepEqual(findTitleIssues("30/30"), { issues: [], suggestion: "30/30" });
});

/* ------------------------------------------------------------------ */
/* Descriptions                                                        */
/* ------------------------------------------------------------------ */

test("descriptions : lignes coupées recollées, paragraphes gardés", () => {
  assert.equal(
    cleanEventDescription(
      "Dans ce spectacle, Rosa poursuit son récit sur la quête\namoureuse et creuse ses contradictions de mauvaise féministe, de mauvaise\nécologiste, de mauvaise gauchiste.\n\nElle retrace l’histoire de sa famille.",
    ),
    "Dans ce spectacle, Rosa poursuit son récit sur la quête amoureuse et creuse ses contradictions de mauvaise féministe, de mauvaise écologiste, de mauvaise gauchiste.\n\nElle retrace l’histoire de sa famille.",
  );
  // Fin de phrase, intitulé, liste, majuscule : la ligne suivante reste à sa place.
  const kept = "DISTRIBUTION :\nJean-Christophe Briant – piano\n- Simon Lannoy\nMise en scène\nCe spectacle…";
  assert.equal(cleanEventDescription(kept), kept);
  assert.equal(
    cleanEventDescription("Clémentine Saïs –\nchoeur • Marie Morrow – choeur"),
    "Clémentine Saïs – choeur • Marie Morrow – choeur",
  );
});

test("descriptions : blocs collés par la page source séparés", () => {
  assert.equal(
    cleanEventDescription(
      "te faire rire le plus possible.Tu verras des humoristes. Enfin une scène ouverte à Orléans !Jusqu’ici, rien.Informations pratiques📍 Lieu : Orléans Comedy Club, Orléans🚋 Y accéder :En tram : arrêtez-vous à Jeanne d’ArcEn voiture : garez-vous.🕕 Durée 1h💸 Tarif : 20€A partir de 16 ansSoyez sur place 15 mn avant.",
    ),
    [
      "te faire rire le plus possible.",
      "Tu verras des humoristes. Enfin une scène ouverte à Orléans !",
      "Jusqu’ici, rien.",
      "Informations pratiques",
      "📍 Lieu : Orléans Comedy Club, Orléans",
      "🚋 Y accéder :",
      "En tram : arrêtez-vous à Jeanne d’Arc",
      "En voiture : garez-vous.",
      "🕕 Durée 1h",
      "💸 Tarif : 20€",
      "A partir de 16 ans",
      "Soyez sur place 15 mn avant.",
    ].join("\n"),
  );
  assert.equal(
    cleanEventDescription("Concert par Palapapai ProdTOUT PUBLIC • 70 MIN\n\nBassey & The Gospel Team n’est pas un concert de Gospel !"),
    "Concert par Palapapai Prod\nTOUT PUBLIC • 70 MIN\n\nBassey & The Gospel Team n’est pas un concert de Gospel !",
  );
  assert.equal(
    cleanEventDescription("Entrée libre sans réservation______________________COMEDY CLUBPréparez-vous à rire. Avis :Solaire et rafraîchissanteJ'ai connu Alicia."),
    "Entrée libre sans réservation\n\nCOMEDY CLUB\nPréparez-vous à rire. Avis :\nSolaire et rafraîchissante\nJ'ai connu Alicia.",
  );
  assert.equal(
    cleanEventDescription("🕕 Sessions :• 18h45 (début à 19h)• 20h15\n💸 Tarif : 16 €A partir de 16 ans. Le coeur ?OUVERTURE DES PORTES À 15H45"),
    "🕕 Sessions :\n• 18h45 (début à 19h)\n• 20h15\n💸 Tarif : 16 €\nA partir de 16 ans. Le coeur ?\nOUVERTURE DES PORTES À 15H45",
  );
  assert.equal(
    cleanEventDescription("KARAOKÉ - DJEn partenariat avec l’Astrolabe. CONCERT _ FANJANCe groupe orléanais"),
    "KARAOKÉ - DJ\nEn partenariat avec l’Astrolabe. CONCERT _ FANJAN\nCe groupe orléanais",
  );
  // Ni les noms de marque, ni les sigles au pluriel, ni les nombres romains, ni les liens.
  const kept =
    "Sur YouTube et SoundCloud, des DVDs, iOS, la musique des XXe et XXIe siècles, le XIXème. Infos : www.Exemple.fr/Agenda.Html et https://youtu.be/UnIewErN0XI";
  assert.equal(cleanEventDescription(kept), kept);
});

test("descriptions : hashtags, billetterie et signatures retirés", () => {
  assert.equal(
    cleanEventDescription(
      "À partir de 8 ans\n\n⚠️ Places limitées – réservation conseillée !\n\n#Zigotastiques #LesDanchieusesEtoiles #Spectacle #Comédie",
    ),
    "À partir de 8 ans\n\n⚠️ Places limitées – réservation conseillée !",
  );
  assert.equal(
    cleanEventDescription(
      "Une soirée jazz au bord de la Loire.\nBilletterie : https://www.helloasso.com/associations/x/evenements/y\n🎟️ Lien en bio\nhttps://www.billetweb.fr/soiree-jazz\nRéservations : 02 38 00 00 00\nTrailer : https://youtu.be/abc",
    ),
    "Une soirée jazz au bord de la Loire.\nRéservations : 02 38 00 00 00\nTrailer : https://youtu.be/abc",
  );
  assert.equal(
    cleanEventDescription("Venez nombreux pour la release party ! #rock #orleans\n\nL'équipe du Dropkick 🤘\n✨✨✨"),
    "Venez nombreux pour la release party !",
  );
  // Un hashtag dans une phrase, un « #1 », une signature au milieu restent.
  const kept = "Le #1 des soirées #jazz d'Orléans.\nL'équipe du festival vous attend dès 18 h.\nEntrée libre.";
  assert.equal(cleanEventDescription(kept), kept);
});

test("descriptions : texte déjà propre inchangé, appliqué deux fois sans effet", () => {
  const clean =
    "Grossomodo, la ligue d'improvisation d'Orléans, dispute un match d'impro : deux équipes improvisent sur des thèmes imposés.\n\nEntrée libre, au chapeau.";
  assert.equal(cleanEventDescription(clean), clean);
  assert.equal(cleanEventDescription(null), "");
  const messy = "Texte coupé\nen deux.Puis collé #a #b";
  assert.equal(cleanEventDescription(cleanEventDescription(messy)), cleanEventDescription(messy));
});
