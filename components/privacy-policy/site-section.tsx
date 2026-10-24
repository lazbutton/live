import {
  PolicySection,
  PolicySubsection,
} from "@/components/privacy-policy/policy-blocks";

/** « Le site outlive.fr et l'administration » : les pages publiques, le back-office et l'espace organisateur. */
export function SiteSection() {
  return (
    <PolicySection id="site" title="4. Le site outlive.fr et l’administration">
      <p>
        Les pages publiques du site (événements, lieux, organisateurs, artistes) se consultent
        sans compte. Les espaces d’administration et des organisateurs, réservés aux équipes,
        servent à publier et à modérer l’agenda, à inviter les organisateurs et à envoyer les
        notifications de l’application.
      </p>

      <PolicySubsection id="site-donnees" title="4.1 Données traitées">
        <p>Selon votre usage du site, nous pouvons traiter&nbsp;:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>les données de compte et d’authentification&nbsp;:</strong> adresse e-mail,
            mot de passe géré par Supabase Auth, identifiants de session, rôle, informations
            nécessaires à l’accès à l’administration ou à l’espace organisateur
          </li>
          <li>
            <strong>les données de profil et d’organisation&nbsp;:</strong> nom, prénom, e-mail,
            organisateur rattaché, permissions et historique d’accès
          </li>
          <li>
            <strong>les données de gestion des contenus&nbsp;:</strong> événements, lieux,
            organisateurs, artistes, catégories, tags, descriptions, horaires, tarifs, liens
            externes, propositions des utilisateurs, retours et contenus de modération
          </li>
          <li>
            <strong>les médias et fichiers&nbsp;:</strong> images téléversées pour les fiches des
            événements, des lieux, des organisateurs ou des artistes
          </li>
          <li>
            <strong>les données d’invitation et d’audit&nbsp;:</strong> e-mail du destinataire,
            jeton d’invitation, date d’expiration, rôle proposé, journaux des actions des équipes
            et traces d’administration
          </li>
          <li>
            <strong>les données de notification&nbsp;:</strong> celles de l’application (section
            2.5) et le contenu des notifications envoyées
          </li>
          <li>
            <strong>les données techniques&nbsp;:</strong> cookies de session, préférence de thème,
            état de certaines interfaces, données de cache local, journaux techniques,
            informations du navigateur et données de consultation du site
          </li>
          <li>
            <strong>les données liées aux imports&nbsp;:</strong> adresses des pages sources,
            identifiants de pages Facebook, contenu public de pages d’événements ou d’agendas, et
            données extraites lors des imports ou de la collecte assistée
          </li>
        </ul>
      </PolicySubsection>

      <PolicySubsection id="site-finalites" title="4.2 Finalités">
        <ul className="list-disc space-y-2 pl-6">
          <li>ouvrir et sécuriser l’accès aux espaces d’administration et des organisateurs</li>
          <li>gérer les rôles, les équipes, les invitations et les habilitations</li>
          <li>créer, modifier, publier, modérer ou supprimer les contenus d’OutLive</li>
          <li>traiter les propositions et les retours des utilisateurs</li>
          <li>téléverser et servir les images des contenus</li>
          <li>envoyer les e-mails d’invitation et les notifications du service</li>
          <li>
            importer des événements depuis une adresse web, Facebook ou un agenda, et, si l’option
            est configurée, en extraire les informations avec l’aide d’une IA
          </li>
          <li>assurer la maintenance, la sécurité, l’audit et la prévention des abus</li>
          <li>mesurer l’usage du site et améliorer l’administration</li>
        </ul>
      </PolicySubsection>

      <PolicySubsection id="cookies" title="4.3 Cookies, session et stockage local">
        <p>Le site utilise des cookies et du stockage local pour&nbsp;:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>maintenir votre session de connexion (Supabase)</li>
          <li>faire fonctionner certaines API protégées depuis le navigateur</li>
          <li>retenir vos préférences d’interface, comme le thème</li>
          <li>garder certains états d’interface et caches locaux, pour le confort d’usage</li>
        </ul>
        <p>
          Ces mécanismes sont techniques et nécessaires au fonctionnement du service. Le site
          embarque aussi Vercel Analytics pour mesurer son usage et ses performances.
        </p>
      </PolicySubsection>
    </PolicySection>
  );
}
