import {
  PolicySection,
  PolicySubsection,
  Quote,
  Retention,
} from "@/components/privacy-policy/policy-blocks";

/*
 * « L'application OutLive » : ce que l'app collecte d'après son code, comme les questionnaires des stores
 * (../live/docs/FICHES_STORES.md, « Sécurité des données » pour Google Play, « App Store : la
 * confidentialité de l'app » pour Apple). Une donnée nouvelle dans l'app se déclare ici, dans ces deux
 * questionnaires et dans l'écran « Politique de confidentialité » de l'app. Mesure d'audience et rapports
 * de plantage : ../live/docs/fonctionnalites/audience-et-plantages.md.
 */
export function AppSection() {
  return (
    <PolicySection id="application" title="2. L’application OutLive">
      <p>
        L’application OutLive, pour iPhone et Android, se consulte sans compte. Elle n’enregistre
        chez nous que ce qu’il faut pour les gestes que vous faites. Pour chaque donnée, voici à
        quoi elle sert et combien de temps nous la gardons.
      </p>

      <PolicySubsection id="sur-le-telephone" title="2.1 Ce qui reste sur votre téléphone">
        <p>Ces informations ne sont pas enregistrées chez nous&nbsp;:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            votre position, si vous l’autorisez (<Quote>Ma position</Quote>, la carte)&nbsp;: elle
            sert sur le téléphone, à choisir la ville la plus proche ou à vous situer sur la carte,
            et ne nous est jamais envoyée
          </li>
          <li>
            la ville et le rayon choisis&nbsp;: ils accompagnent chaque demande d’événements, pour
            ne recevoir que ceux de la zone, sans être enregistrés
          </li>
          <li>
            ce que vous cherchez&nbsp;: les mots partent à notre base le temps de la réponse, sans
            être enregistrés
          </li>
          <li>
            les rappels <Quote>Me le rappeler</Quote>, des notifications programmées par le
            téléphone
          </li>
          <li>
            vos réglages (apparence, couleurs, confidentialité) et l’endroit où vous en êtes dans
            une émission de radio
          </li>
        </ul>
        <p>
          <Quote>Ajouter au calendrier</Quote> et <Quote>Partager</Quote> passent par les
          applications de votre téléphone&nbsp;: rien ne nous est envoyé.
        </p>
      </PolicySubsection>

      <PolicySubsection id="session-invitee" title="2.2 La session invitée">
        <p>
          Aucune session ne s’ouvre au lancement de l’application ni pour consulter l’agenda. Le
          premier geste qu’elle doit enregistrer (un cœur, <Quote>Suivre</Quote>, masquer un événement, un
          réglage des notifications) ouvre une session invitée&nbsp;: un identifiant tiré au hasard,
          sans e-mail ni nom, gardé par le téléphone. Ce que vous enregistrez ensuite (sections 2.4
          et 2.5) lui est rattaché dans notre base.
        </p>
        <p>
          Si vous vous connectez ensuite à un compte, vos favoris, vos suivis, vos événements
          masqués et vos préférences de notification passent de la session invitée au compte.
        </p>
        <Retention>
          jusqu’à sa suppression depuis l’application (section 3), et au plus 13&nbsp;mois après
          sa dernière utilisation&nbsp;: sans ouverture de l’application ni geste enregistré
          pendant 13&nbsp;mois, elle est supprimée de notre base avec ce qui lui est rattaché
          (sections 2.4 et 2.5). Désinstaller l’application ne la supprime pas tout de suite&nbsp;:
          elle part au bout de ces 13&nbsp;mois.
        </Retention>
      </PolicySubsection>

      <PolicySubsection id="compte" title="2.3 Votre compte">
        <p>
          Un compte n’est demandé que pour envoyer une proposition d’événement, signaler un contenu
          ou bloquer un auteur&nbsp;; il permet aussi de retrouver vos favoris sur un autre appareil.
          Vous vous connectez par e-mail (un code reçu par e-mail, ou un mot de passe), avec Apple
          sur iPhone ou avec Google sur Android. Nous enregistrons&nbsp;:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            votre adresse e-mail (avec Apple, celle que vous choisissez de partager, qui peut être
            une adresse masquée)
          </li>
          <li>le nom et la photo de votre compte Google, ou le nom transmis par Apple</li>
          <li>
            l’identifiant du compte, ses dates de création et de dernière connexion, et la date à
            laquelle vous avez accepté les conditions d’utilisation
          </li>
        </ul>
        <p>Les codes de connexion vous sont envoyés par notre prestataire d’e-mails, Resend.</p>
        <Retention>jusqu’à la suppression du compte (section 3).</Retention>
      </PolicySubsection>

      <PolicySubsection
        id="favoris-et-suivis"
        title="2.4 Favoris, suivis, événements masqués et auteurs bloqués"
      >
        <p>
          Avec une session, invitée ou compte, l’application enregistre dans notre base, rattachés
          à elle&nbsp;:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>les événements que vous mettez en favori (le cœur) ou que vous masquez</li>
          <li>les lieux, les organisateurs et les artistes que vous suivez</li>
          <li>
            avec un compte, les auteurs que vous bloquez et l’événement d’où vous les avez bloqués
          </li>
        </ul>
        <p>
          Ils servent à vous montrer vos favoris et vos suivis, à vous prévenir des nouvelles dates
          de ce que vous suivez et à cacher ce que vous ne voulez plus voir.
        </p>
        <Retention>
          jusqu’à ce que vous les retiriez, ou jusqu’à la suppression de la session ou du compte.
        </Retention>
      </PolicySubsection>

      <PolicySubsection id="notifications" title="2.5 Notifications">
        <p>
          L’application ne demande l’autorisation d’envoyer des notifications qu’au moment d’un
          geste qui en a besoin (un cœur, <Quote>Suivre</Quote>, <Quote>Me le rappeler</Quote>). Si
          vous l’accordez, nous enregistrons, rattachés à votre session&nbsp;:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            le jeton de notification du téléphone, fourni par Google (Firebase Cloud Messaging) sur
            Android et par Apple sur iPhone
          </li>
          <li>
            la plateforme et la version de l’application, avec, sur iPhone, l’identifiant qu’iOS
            donne à nos applications sur cet appareil (identifierForVendor) et, sur Android, le
            numéro de version du système (Build.ID), qui n’identifie pas le téléphone
          </li>
          <li>vos préférences&nbsp;: les résumés et les catégories que vous choisissez</li>
        </ul>
        <p>
          Ils servent à vous envoyer les notifications que vous avez choisies (les nouvelles dates
          de ce que vous suivez, les résumés). Nous gardons la trace des notifications envoyées
          (titre, texte, événements concernés) pendant 90&nbsp;jours. Les rappels{" "}
          <Quote>Me le rappeler</Quote> ne passent pas par nous.
        </p>
        <Retention>
          le jeton, jusqu’à un an sans mise à jour&nbsp;; les préférences, jusqu’à la suppression
          de la session ou du compte. Vous pouvez retirer l’autorisation à tout moment dans les
          réglages du téléphone.
        </Retention>
      </PolicySubsection>

      <PolicySubsection id="propositions" title="2.6 Proposer un événement">
        <p>
          Tout le monde peut préparer une proposition&nbsp;; un compte n’est demandé qu’à l’envoi.
          Nous recevons alors&nbsp;:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            ce que vous saisissez&nbsp;: titre, dates, lieu, description, prix, catégorie, liens,
            organisateurs
          </li>
          <li>l’affiche jointe, déposée dans notre stockage d’images au moment de l’envoi</li>
          <li>
            le nom de votre compte (à défaut, votre adresse e-mail), pour l’équipe qui relit. Si
            vous activez <Quote>Autoriser l’attribution publique</Quote>, ce nom peut être affiché
            avec l’événement publié.
          </li>
        </ul>
        <p>
          <strong>Lecture de l’affiche.</strong> Quand vous partez d’une affiche, l’image est
          envoyée à notre serveur, qui la fait lire par OpenAI pour préremplir la proposition.
          OpenAI la traite pour notre compte et ne s’en sert pas pour entraîner ses modèles. Avant
          l’envoi de la proposition, nous ne gardons ni l’image ni ce qui en a été lu&nbsp;; seul un
          compteur des lectures de chaque session en limite le nombre par jour, et il ne garde que
          le jour même et la veille.
        </p>
        <p>
          <strong>Vérification des liens.</strong> Quand vous proposez un événement par son lien,
          l’application demande à Google Safe Browsing si ce lien est signalé comme dangereux&nbsp;;
          seul le lien est envoyé.
        </p>
        <p>
          L’équipe relit chaque proposition avant de la publier. Publiée, elle fait partie de
          l’agenda public.
        </p>
        <Retention>
          une proposition reste rattachée à votre compte jusqu’à sa suppression (section 3)&nbsp;;
          un événement publié reste dans l’agenda jusqu’à 30&nbsp;jours après sa date.
        </Retention>
      </PolicySubsection>

      <PolicySubsection id="signalements" title="2.7 Signaler un contenu">
        <p>
          Avec un compte, vous pouvez signaler un événement (un motif, un commentaire si vous le
          souhaitez) et bloquer son auteur. Le signalement est enregistré avec l’identifiant de
          votre compte et, s’il est connu, celui de l’auteur de l’événement&nbsp;; l’équipe de
          modération le traite.
        </p>
        <Retention>jusqu’à la suppression de votre compte (section 3).</Retention>
      </PolicySubsection>

      <PolicySubsection id="rapports-de-plantage" title="2.8 Rapports de plantage">
        <p>
          Quand l’application plante ou rencontre une erreur, elle envoie un rapport à Firebase
          Crashlytics (Google, qui le traite pour nous)&nbsp;: le type de l’erreur et l’endroit du
          code où elle s’est produite, le modèle du téléphone, les versions du système et de
          l’application, et des identifiants tirés au hasard à l’installation d’OutLive. Firebase
          note aussi les moments où l’application passe au premier plan, pour compter les
          utilisations sans plantage. Jamais votre nom, votre e-mail, votre compte ni ce que vous
          avez saisi.
        </p>
        <p>
          Ces rapports servent seulement à corriger l’application. Vous pouvez les refuser dans le
          profil (<Quote>Rapports de plantage</Quote>) ou dans la politique de confidentialité de
          l’application.
        </p>
        <Retention>90&nbsp;jours, chez Google.</Retention>
      </PolicySubsection>

      <PolicySubsection id="statistiques-anonymes" title="2.9 Statistiques anonymes">
        <p>
          Pour savoir si l’application s’améliore, votre téléphone compte huit gestes, jour par
          jour&nbsp;: la fiche d’un événement ouverte, la billetterie touchée, une recherche sans
          résultat, le calendrier <Quote>Quand&nbsp;?</Quote> utilisé, un cœur posé, le direct
          d’une radio lancé, un épisode d’une radio lancé, la page d’un festival ouverte.
        </p>
        <p>
          Au plus une fois par jour, il envoie ces totaux sans votre compte, sans session et sans
          aucun identifiant. Nous les additionnons à ceux des autres téléphones, jour par
          jour&nbsp;: rien ne permet de savoir ce que vous avez fait personnellement. Cette mesure
          suit les
          conditions de la CNIL pour une mesure d’audience exemptée de consentement.
        </p>
        <p>
          Vous pouvez la refuser dans le profil (<Quote>Statistiques anonymes</Quote>) ou dans la
          politique de confidentialité de l’application&nbsp;: elle ne compte plus et efface ce qui
          n’est pas encore parti.
        </p>
        <Retention>
          7&nbsp;jours au plus sur le téléphone, en attendant l’envoi&nbsp;; 25&nbsp;mois dans
          notre base.
        </Retention>
      </PolicySubsection>

      <PolicySubsection id="autres-serveurs" title="2.10 Ce que voient d’autres serveurs">
        <p>
          Comme pour toute connexion, les serveurs que l’application interroge voient l’adresse IP
          du téléphone&nbsp;:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            le son de la radio vient directement des serveurs qui la diffusent&nbsp;; écouter
            n’ouvre pas de session et n’enregistre rien chez nous
          </li>
          <li>les fonds de carte viennent de CARTO, qui ne reçoit que la zone affichée</li>
          <li>
            les affiches et les photos viennent de notre stockage d’images (Supabase) et, pour
            quelques lieux, du site qui les publie
          </li>
        </ul>
        <p>
          Nos hébergeurs (Supabase, Vercel) tiennent des journaux techniques des requêtes (adresse
          IP, date, adresse demandée), effacés au bout de quelques jours.
        </p>
      </PolicySubsection>

      <PolicySubsection id="nous-ecrire" title="2.11 Nous écrire">
        <p>
          <Quote>Nous écrire</Quote> ouvre votre messagerie&nbsp;: nous recevons votre adresse
          e-mail et votre message dans notre boîte (Proton Mail), et les gardons le temps de traiter
          votre demande.
        </p>
      </PolicySubsection>
    </PolicySection>
  );
}
