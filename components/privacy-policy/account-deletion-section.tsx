import {
  ACCOUNT_DELETION_ANCHOR,
  ContactEmailLink,
  PolicySection,
  PolicySubsection,
  Quote,
} from "@/components/privacy-policy/policy-blocks";

/** Objet de l'e-mail d'une demande de suppression sans l'app. */
export const ACCOUNT_DELETION_SUBJECT = "Supprimer mon compte OutLive";

/*
 * « Supprimer votre compte OutLive », l'adresse que Google Play demande pour supprimer un compte sans
 * l'app (#supprimer-mon-compte). Ce qui part et ce qui reste suit le code :
 * - dans l'app, « Supprimer mon compte » (GdprRepository de ../live) supprime les événements du compte
 *   encore en attente et leurs affiches, puis appelle l'Edge Function delete-user
 *   (supabase/functions/delete-user), qui supprime l'utilisateur (auth.users) ;
 * - les clés étrangères vers auth.users font le reste (supabase/migrations/) : ON DELETE CASCADE pour
 *   event_likes, user_hidden_events, user_follows, blocked_users, user_notification_preferences,
 *   user_notification_categories, user_push_tokens, notification_logs, content_reports (auteur du
 *   signalement) et user_requests (les propositions) ; ON DELETE SET NULL pour events.created_by et
 *   content_reports.reported_user_id.
 * Les affiches des propositions (user_requests) ne sont pas effacées du stockage : d'où la ligne qui le
 * dit dans « Ce qui reste ». À retirer quand delete-user les effacera.
 */
export function AccountDeletionSection() {
  return (
    <PolicySection
      id={ACCOUNT_DELETION_ANCHOR}
      title="3. Supprimer votre compte OutLive"
      highlighted
    >
      <p>
        Vous pouvez supprimer à tout moment votre compte OutLive et les données qui lui sont
        rattachées, depuis l’application ou sans elle.
      </p>

      <PolicySubsection id="supprimer-dans-l-application" title="Dans l’application">
        <ol className="list-decimal space-y-2 pl-6">
          <li>Touchez le rond du profil, en haut à droite de l’accueil.</li>
          <li>
            Dans <Quote>Confidentialité</Quote>, touchez <Quote>Mes données</Quote>.
          </li>
          <li>
            Touchez <Quote>Supprimer mon compte</Quote>, puis{" "}
            <Quote>Supprimer définitivement</Quote>.
          </li>
        </ol>
        <p>
          La suppression est immédiate et vous déconnecte. Elle vaut aussi pour une session
          invitée (section 2.2) qui, sans e-mail ni nom, ne peut être supprimée que depuis
          l’application. Sans session, notre base ne garde rien qui soit rattaché à ce téléphone.
        </p>
      </PolicySubsection>

      <PolicySubsection id="supprimer-sans-l-application" title="Sans l’application">
        <p>
          Écrivez à <ContactEmailLink subject={ACCOUNT_DELETION_SUBJECT} /> depuis l’adresse e-mail
          de votre compte, avec pour objet <Quote>{ACCOUNT_DELETION_SUBJECT}</Quote>. Si vous ne
          pouvez pas écrire depuis cette adresse (une adresse masquée par Apple, par exemple),
          donnez-la dans votre message&nbsp;: nous vous demanderons de quoi vérifier que le compte
          est bien le vôtre.
        </p>
        <p>
          Nous supprimons le compte comme le fait l’application, et vous le confirmons par e-mail,
          dans un délai d’un mois au plus.
        </p>
      </PolicySubsection>

      <PolicySubsection id="ce-qui-est-supprime" title="Ce qui est supprimé">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            le compte&nbsp;: adresse e-mail, nom et photo, identifiant, moyens de connexion,
            conditions acceptées
          </li>
          <li>
            vos favoris, vos suivis, vos événements masqués et les auteurs que vous avez bloqués
          </li>
          <li>
            vos préférences de notification, les jetons de notification de vos téléphones et la
            trace des notifications envoyées
          </li>
          <li>vos signalements</li>
          <li>
            vos propositions, et ceux de vos événements qui attendaient encore leur publication,
            avec leur affiche
          </li>
        </ul>
      </PolicySubsection>

      <PolicySubsection id="ce-qui-reste" title="Ce qui reste">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Les événements déjà publiés à partir de vos propositions&nbsp;: ils font partie de
            l’agenda public et y restent avec leur affiche, sans lien avec votre compte, jusqu’à
            30&nbsp;jours après leur date. Si vous aviez autorisé l’attribution publique, le nom
            affiché reste avec eux&nbsp;: écrivez-nous pour le retirer.
          </li>
          <li>
            L’affiche d’une proposition que l’équipe n’avait pas encore publiée&nbsp;: la
            proposition est supprimée, mais le fichier de l’image peut rester dans notre stockage,
            sans lien avec votre compte. Écrivez-nous pour qu’il soit effacé.
          </li>
          <li>
            Les signalements d’autres personnes qui visaient vos événements, sans lien avec votre
            compte.
          </li>
          <li>
            Les rapports de plantage et les statistiques anonymes, qui ne sont rattachés à aucun
            compte&nbsp;: les rapports s’effacent après 90&nbsp;jours, les statistiques après
            25&nbsp;mois.
          </li>
          <li>
            Les journaux techniques de nos hébergeurs (section 2.10), effacés au bout de quelques
            jours, et les e-mails échangés avec nous, le temps de traiter votre demande.
          </li>
          <li>
            Les sauvegardes de la base, faites à la main et gardées hors ligne, qui ne sont pas
            modifiées&nbsp;: vos données en disparaissent quand elles sont remplacées par de plus
            récentes.
          </li>
        </ul>
      </PolicySubsection>
    </PolicySection>
  );
}
