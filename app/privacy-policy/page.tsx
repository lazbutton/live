import type { Metadata } from "next";

import {
  ACCOUNT_DELETION_SUBJECT,
  AccountDeletionSection,
} from "@/components/privacy-policy/account-deletion-section";
import { AppSection } from "@/components/privacy-policy/app-section";
import {
  ACCOUNT_DELETION_ANCHOR,
  ContactEmailLink,
  ExternalLink,
  LINK_CLASS,
  PolicySection,
  Quote,
} from "@/components/privacy-policy/policy-blocks";
import { SiteSection } from "@/components/privacy-policy/site-section";
import { buildPublicMetadata } from "@/lib/metadata";

/*
 * Politique de confidentialité de l'app OutLive et du site, à https://www.outlive.fr/privacy-policy :
 * l'adresse donnée à Google Play et à l'App Store. La suppression du compte sans l'app :
 * https://www.outlive.fr/privacy-policy#supprimer-mon-compte (Play Console).
 */
export const metadata: Metadata = buildPublicMetadata({
  title: "Politique de confidentialité",
  description:
    "Ce que l’application OutLive et le site outlive.fr font de vos données, combien de temps elles sont gardées, vos droits et comment supprimer votre compte.",
  path: "/privacy-policy",
});

const LAST_UPDATED = "24 octobre 2026";

/** Le sommaire : les ancres des sections, dans l'ordre de leurs numéros. */
const CONTENTS = [
  { id: "responsable", title: "Responsable du traitement" },
  { id: "application", title: "L’application OutLive" },
  { id: ACCOUNT_DELETION_ANCHOR, title: "Supprimer votre compte OutLive" },
  { id: "site", title: "Le site outlive.fr et l’administration" },
  { id: "bases-legales", title: "Bases légales" },
  { id: "prestataires", title: "Prestataires et services tiers" },
  { id: "conservation", title: "Durées de conservation" },
  { id: "securite", title: "Sécurité" },
  { id: "transferts", title: "Transferts hors de l’Union européenne" },
  { id: "droits", title: "Vos droits" },
  { id: "modifications", title: "Modifications de cette politique" },
  { id: "cnil", title: "Autorité de contrôle" },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="mb-8 text-4xl font-bold">Politique de confidentialité</h1>

        <div className="space-y-12 text-base leading-relaxed sm:text-lg">
          <section className="space-y-4">
            <p className="text-muted-foreground">
              <strong>Dernière mise à jour&nbsp;:</strong> {LAST_UPDATED}
            </p>
            <p>
              Cette politique couvre l’application <strong>OutLive</strong>, l’agenda culturel
              d’Orléans et de ses environs pour iPhone et Android, et le site{" "}
              <strong>outlive.fr</strong>, avec ses pages publiques et ses espaces
              d’administration et des organisateurs.
            </p>
            <p>
              Elle dit quelles données nous traitons, pourquoi, combien de temps nous les gardons,
              avec quels prestataires, et quels sont vos droits. OutLive n’affiche aucune
              publicité, n’utilise aucun traceur publicitaire et ne vend aucune donnée.
            </p>

            <aside className="space-y-2 rounded-lg bg-muted p-4">
              <p className="font-semibold">Supprimer votre compte OutLive</p>
              <p>
                Dans l’application&nbsp;: Profil › <Quote>Mes données</Quote> ›{" "}
                <Quote>Supprimer mon compte</Quote>. Sans l’application&nbsp;: écrivez à{" "}
                <ContactEmailLink subject={ACCOUNT_DELETION_SUBJECT} /> depuis l’adresse de votre
                compte.{" "}
                <a href={`#${ACCOUNT_DELETION_ANCHOR}`} className={LINK_CLASS}>
                  Ce qui est supprimé, ce qui reste et les délais
                </a>
              </p>
            </aside>

            <nav aria-label="Sommaire" className="rounded-lg border p-4">
              <p className="mb-2 font-semibold">Sommaire</p>
              <ol className="list-decimal space-y-1 pl-6">
                {CONTENTS.map((entry) => (
                  <li key={entry.id}>
                    <a href={`#${entry.id}`} className={LINK_CLASS}>
                      {entry.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </section>

          <PolicySection id="responsable" title="1. Responsable du traitement">
            <p>
              OutLive est responsable des traitements décrits dans cette politique, pour
              l’application comme pour le site&nbsp;: l’agenda, les comptes et les sessions, les
              propositions et leur modération, les notifications et l’administration de la
              plateforme.
            </p>
            <div className="rounded-lg bg-muted p-4">
              <p>
                <strong>E-mail&nbsp;:</strong> <ContactEmailLink />
              </p>
              <p className="mt-2">
                <strong>Adresse&nbsp;:</strong> 3 rue de la Cholerie, 45000 Orléans
              </p>
            </div>
          </PolicySection>

          <AppSection />

          <AccountDeletionSection />

          <SiteSection />

          <PolicySection id="bases-legales" title="5. Bases légales">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>L’exécution du service que vous demandez&nbsp;:</strong> dans
                l’application, la session invitée, le compte, les favoris, suivis, événements
                masqués et auteurs bloqués, les propositions et les notifications choisies&nbsp;;
                sur le site, les comptes d’administration et d’organisateur, les invitations,
                l’accès aux espaces et l’administration des contenus.
              </li>
              <li>
                <strong>Votre consentement&nbsp;:</strong> l’autorisation des notifications,
                retirable dans les réglages du téléphone, et l’attribution publique d’une
                proposition.
              </li>
              <li>
                <strong>Notre intérêt légitime&nbsp;:</strong> la sécurité et la prévention des
                abus (vérification des liens, signalements, modération, journaux), les rapports de
                plantage et les statistiques anonymes de l’application, que vous pouvez refuser
                dans l’application, la mesure d’audience du site et l’assistance.
              </li>
              <li>
                <strong>Nos obligations légales&nbsp;:</strong> lorsque la loi impose de conserver
                ou de communiquer certaines informations.
              </li>
            </ul>
          </PolicySection>

          <PolicySection id="prestataires" title="6. Prestataires et services tiers">
            <p>
              Nous ne vendons pas vos données et ne les partageons pas à des fins publicitaires.
              Les prestataires suivants les traitent pour le fonctionnement du service, chacun
              pour ce qui le concerne&nbsp;:
            </p>
            <ul className="list-disc space-y-3 pl-6">
              <li>
                <strong>Supabase&nbsp;:</strong> base de données, connexion aux comptes et stockage
                des images, pour l’application et le site.{" "}
                <ExternalLink href="https://supabase.com/privacy">
                  Politique de confidentialité de Supabase
                </ExternalLink>
              </li>
              <li>
                <strong>Vercel&nbsp;:</strong> hébergement du site et de l’API qu’appelle
                l’application (lecture des affiches, propositions, jetons de notification), et
                mesure d’audience du site (Vercel Analytics).{" "}
                <ExternalLink href="https://vercel.com/legal/privacy-policy">
                  Politique de confidentialité de Vercel
                </ExternalLink>
              </li>
              <li>
                <strong>Google Firebase&nbsp;:</strong> rapports de plantage de l’application
                (Crashlytics) et envoi des notifications sur Android (Firebase Cloud Messaging).{" "}
                <ExternalLink href="https://firebase.google.com/support/privacy">
                  Informations de confidentialité de Firebase
                </ExternalLink>
              </li>
              <li>
                <strong>Apple&nbsp;:</strong> envoi des notifications sur iPhone (Apple Push
                Notification service) et connexion avec Apple.{" "}
                <ExternalLink href="https://www.apple.com/legal/privacy/">
                  Politique de confidentialité d’Apple
                </ExternalLink>
              </li>
              <li>
                <strong>Google&nbsp;:</strong> connexion avec Google sur Android, et vérification
                des liens proposés (Google Safe Browsing).{" "}
                <ExternalLink href="https://policies.google.com/privacy">
                  Règles de confidentialité de Google
                </ExternalLink>
              </li>
              <li>
                <strong>OpenAI&nbsp;:</strong> lecture des affiches proposées dans
                l’application&nbsp;; dans l’administration, si l’option est configurée,
                extraction des informations d’une page d’événement (son adresse, son titre, sa
                description, ses métadonnées Open Graph et Twitter et une partie de son texte).{" "}
                <ExternalLink href="https://openai.com/policies/privacy-policy">
                  Politique de confidentialité d’OpenAI
                </ExternalLink>
              </li>
              <li>
                <strong>Resend&nbsp;:</strong> e-mails de connexion de l’application et
                invitations des organisateurs.{" "}
                <ExternalLink href="https://resend.com/legal/privacy-policy">
                  Politique de confidentialité de Resend
                </ExternalLink>
              </li>
              <li>
                <strong>CARTO&nbsp;:</strong> fonds de carte de l’application.{" "}
                <ExternalLink href="https://carto.com/privacy">
                  Politique de confidentialité de CARTO
                </ExternalLink>
              </li>
              <li>
                <strong>Meta (API Graph de Facebook)&nbsp;:</strong> pour les outils d’import de
                l’administration, l’identifiant d’une page Facebook et les données publiques
                d’événements demandées à l’API.{" "}
                <ExternalLink href="https://www.facebook.com/privacy/policy/">
                  Politique de confidentialité de Meta
                </ExternalLink>
              </li>
              <li>
                <strong>Proton&nbsp;:</strong> notre messagerie, où arrivent vos e-mails.{" "}
                <ExternalLink href="https://proton.me/legal/privacy">
                  Politique de confidentialité de Proton
                </ExternalLink>
              </li>
            </ul>
          </PolicySection>

          <PolicySection id="conservation" title="7. Durées de conservation">
            <p>
              Pour l’application, la durée de chaque donnée est donnée avec elle (section 2), et
              ce que devient chacune quand vous supprimez votre compte, section 3. Pour le site et
              l’administration&nbsp;:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>invitations des organisateurs&nbsp;:</strong> expirées après 7&nbsp;jours
                si elles ne sont pas acceptées
              </li>
              <li>
                <strong>trace des notifications envoyées&nbsp;:</strong> effacée après 90&nbsp;jours
              </li>
              <li>
                <strong>jetons de notification&nbsp;:</strong> effacés après un an sans mise à jour
              </li>
              <li>
                <strong>événements publiés&nbsp;:</strong> effacés 30&nbsp;jours après leur date
              </li>
              <li>
                <strong>journaux d’audit des équipes et de l’administration&nbsp;:</strong> effacés
                après 180&nbsp;jours
              </li>
              <li>
                <strong>journaux de la collecte d’événements&nbsp;:</strong> effacés après
                90&nbsp;jours
              </li>
              <li>
                <strong>comptes, contenus et images&nbsp;:</strong> gardés le temps nécessaire à
                l’exploitation du service, à la gestion des accès, au suivi éditorial et à la
                sécurité, puis supprimés ou anonymisés
              </li>
            </ul>
          </PolicySection>

          <PolicySection id="securite" title="8. Sécurité">
            <ul className="list-disc space-y-2 pl-6">
              <li>des échanges chiffrés (HTTPS)</li>
              <li>des comptes et des sessions gérés par Supabase</li>
              <li>
                des accès séparés entre l’administration et les organisateurs, et des règles
                d’accès dans la base (RLS)
              </li>
              <li>la journalisation des actions sensibles de gestion des équipes</li>
              <li>un accès restreint aux clés des serveurs et aux intégrations tierces</li>
            </ul>
            <p>
              Aucun système n’offre une sécurité absolue, mais nous limitons l’accès aux données
              au strict nécessaire.
            </p>
          </PolicySection>

          <PolicySection id="transferts" title="9. Transferts hors de l’Union européenne">
            <p>
              Certains prestataires cités plus haut, comme Google, Apple, OpenAI ou Vercel,
              peuvent traiter des données hors de l’Union européenne, notamment aux États-Unis,
              selon leur infrastructure ou la configuration du service. Nous nous appuyons alors
              sur les mécanismes contractuels et les garanties qu’ils proposent.
            </p>
          </PolicySection>

          <PolicySection id="droits" title="10. Vos droits">
            <p>Dans les conditions prévues par la loi, vous disposez des droits suivants&nbsp;:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>droit d’accès</li>
              <li>droit de rectification</li>
              <li>droit à l’effacement</li>
              <li>droit à la limitation du traitement</li>
              <li>droit à la portabilité</li>
              <li>droit d’opposition</li>
              <li>droit de définir des directives sur le sort de vos données après votre décès</li>
              <li>droit d’introduire une réclamation auprès de la CNIL</li>
            </ul>
            <p>
              Dans l’application, <Quote>Mes données</Quote> vous permet d’exporter vos données
              (<Quote>Exporter mes données</Quote>) et de supprimer votre compte (section
              3)&nbsp;; le profil, de refuser les rapports de plantage et les statistiques
              anonymes. Pour exercer vos autres droits, écrivez-nous à <ContactEmailLink />.
            </p>
          </PolicySection>

          <PolicySection id="modifications" title="11. Modifications de cette politique">
            <p>
              Cette politique évolue avec le service, ses prestataires et les obligations légales.
              Toute mise à jour importante est publiée sur cette page, avec sa date.
            </p>
          </PolicySection>

          <PolicySection id="cnil" title="12. Autorité de contrôle">
            <p>
              Si vous estimez que le traitement de vos données n’est pas conforme à la
              réglementation, vous pouvez introduire une réclamation auprès de la{" "}
              <ExternalLink href="https://www.cnil.fr">CNIL</ExternalLink>.
            </p>
          </PolicySection>
        </div>
      </div>
    </div>
  );
}
