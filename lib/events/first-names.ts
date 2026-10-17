/*
 * Prénoms courants en France (et diminutifs usuels), en minuscules accentuées.
 * Sert à repérer un prénom seul (« Candice », « Antho ») : sur une page d'atelier ou de
 * spectacle, c'est presque toujours l'animatrice ou un interprète, pas une fiche d'artiste.
 * Les prénoms surtout connus comme noms de scène (Louane, Angèle, Vianney…) n'y figurent pas.
 */
export const FIRST_NAMES: ReadonlySet<string> = new Set(
  `
  adèle adeline adélaïde agathe agnès aïcha alexandra alexia alice alicia aline alison alix amandine amélie amina
  ana anaïs andréa andrée angela angélique angelina anna anne annabelle annick annie anouk apolline ariane armelle
  astrid aude audrey aurélia aurélie aurore axelle barbara béatrice bénédicte bérénice bernadette blandine brigitte
  camille candice capucine carine carla carmen carole caroline cassandra catherine cécile céline chantal charlène
  charline charlotte chiara chloé christelle christiane christina christine cindy claire clara clarisse claudia
  claudine clémence clémentine cloé clotilde colette coline constance coralie corinne cyrielle cynthia daniela
  danièle danielle daphné déborah delphine denise diane dominique dorothée edith éléa éléonore éliane élisa
  élisabeth élise ella élodie éloïse elsa émilie emma emmanuelle estelle esther eva éva ève évelyne fabienne fanny
  fatima fatou faustine fiona flavie flora florence francine françoise frédérique gabrielle gaëlle geneviève
  géraldine ghislaine gisèle gwen gwenaëlle gwendoline hanna hannah hélène héloïse hortense ilona inès ingrid
  irène iris isabelle jacqueline jade jasmine jeanne jeannine jennifer jessica joëlle johanna joséphine josette
  josiane judith julia julie juliette justine karima karine katia kelly lætitia laetitia lara laura laure laurence
  léa léana léane leila leïla léna léonie léonore liliane lilou lina linda lisa lise lison lola lou louise luce
  lucia lucie lucienne lucile lucille ludivine lydia lydie madeleine maëlle maëlys maëva magali maïa manon
  marceline margaux margot marguerite maria marianne marie marine marion marjorie marlène marthe martine maryline
  maryse mathilde maud maya mélanie mélissa mélodie mia michèle micheline mireille monique morgane muriel myriam
  nadège nadia nadine naïma natacha nathalie nelly nicole nina ninon noémie noëlle nora océane odette odile olga
  olivia ophélie oriane paloma pascale patricia paula pauline pénélope perrine philippine priscilla prune rachel
  raphaëlle rebecca régine renée romane rosalie rose roxane sabine sabrina salomé samia sandra sandrine sara sarah
  séverine sidonie simone solange solène solenn sonia sophie stéphanie suzanne sylvie tatiana tiphaine valentine
  valérie vanessa véronique victoire victoria violaine violette virginie viviane yasmine yolande yvette yvonne
  zélie zoé

  aaron adam adrien ahmed alain alban albert alexandre alexis alfred ali amaury ambroise amine anatole andré
  anthony antoine antonin armand arnaud arthur augustin aurélien axel baptiste bastien benjamin benoît bernard
  bertrand bilal boris bruno cédric charles christian christophe clément colin corentin cyprien cyril cyrille
  damien daniel david denis didier dimitri dylan édouard edgar élie éloi émile emmanuel enzo éric erwan étienne
  eugène evan fabien fabrice farid félix ferdinand florent florian francis franck françois frédéric gabin gabriel
  gaël gaëtan gaspard gauthier geoffrey georges gérard germain gilbert gilles grégoire grégory guillaume gustave
  guy hakim henri hervé hugo hugues ibrahim ismaël jacques jean jérémie jérémy jérôme joachim joël johan johann
  jonathan jordan joseph jules julien justin karim kévin killian kylian laurent léo léon léonard lionel loïc
  louis luc lucas lucien ludovic maël malik marc marcel marius martin mathéo mathias mathieu mathis matthieu
  mattéo maurice maxence maxime maximilien mehdi michel mickaël mohamed nabil nathan nicolas noah noé noël nolan
  olivier pascal patrice patrick paul philippe pierre quentin rachid raphaël raymond rayan rémi rémy renaud rené
  richard robert robin rodolphe roger romain romuald sacha samir sami samuel sébastien serge simon sofiane
  stéphane sylvain théo théophile thibault thibaut thierry thomas timothée tom tristan valentin victor vincent
  walid william xavier yacine yanis yann yannick yoann yohan youssef yvan yves

  alex antho ben caro cath chris dom flo fred greg isa jeff jo ju juju lulu ludo manu mat matt max mel nath nico
  phil seb steph tony val vince
  `
    .trim()
    .split(/\s+/),
);
