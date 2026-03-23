import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialite | OutLive",
  description:
    "Politique de confidentialite du site OutLive Admin, des espaces organisateurs et des traitements relies a Supabase, Apple, Firebase et aux integrations associees.",
};

const LAST_UPDATED = "21 mars 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="mb-8 text-4xl font-bold">Politique de confidentialite</h1>

        <div className="prose prose-lg max-w-none space-y-6">
          <section>
            <p className="mb-4 text-muted-foreground">
              <strong>Derniere mise a jour :</strong> {LAST_UPDATED}
            </p>
            <p>
              Cette politique couvre le site <strong>OutLive Admin</strong>, les espaces
              <strong> admin</strong> et <strong>organisateur</strong>, les routes API
              Next.js associees, ainsi que les traitements realises pour administrer la
              plateforme OutLive et piloter certaines fonctionnalites de l&apos;application
              mobile, notamment les invitations et les notifications push.
            </p>
            <p>
              Elle explique quelles donnees nous traitons, pourquoi nous les utilisons,
              avec quels prestataires elles peuvent etre partagees, et quels sont vos droits.
            </p>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              1. Responsable du traitement
            </h2>
            <p>
              Le service OutLive est responsable des traitements realises via ce site pour
              l&apos;administration de la plateforme, la gestion des comptes organisateurs,
              la moderation des contenus et l&apos;envoi de communications operationnelles.
            </p>
            <div className="mt-4 rounded-lg bg-muted p-4">
              <p>
                <strong>Email :</strong> lazbutton@proton.me
              </p>
              <p className="mt-2">
                <strong>Adresse :</strong> 3 Rue de la Cholerie, 45000 Orleans
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              2. Donnees traitees
            </h2>
            <p>Selon votre usage du service, nous pouvons traiter les categories suivantes :</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Donnees de compte et d&apos;authentification :</strong> adresse
                email, mot de passe gere par Supabase Auth, identifiants de session, role,
                informations de compte necessaires a l&apos;acces admin ou organisateur.
              </li>
              <li>
                <strong>Donnees de profil et d&apos;organisation :</strong> nom, prenom,
                email, organisateur rattache, permissions et historique d&apos;acces.
              </li>
              <li>
                <strong>Donnees de gestion de contenu :</strong> evenements, lieux,
                organisateurs, multi-evenements, categories, tags, descriptions, horaires,
                tarifs, liens externes, demandes utilisateur, feedbacks et contenus de
                moderation.
              </li>
              <li>
                <strong>Medias et fichiers :</strong> images televersees dans le cadre des
                fiches evenement, lieu ou organisateur.
              </li>
              <li>
                <strong>Donnees d&apos;invitations et d&apos;audit :</strong> email du
                destinataire, token d&apos;invitation, date d&apos;expiration, role invite,
                journaux d&apos;actions d&apos;equipe et traces d&apos;administration.
              </li>
              <li>
                <strong>Donnees de notifications push :</strong> token push, plateforme
                (`ios`, `android`, `web`), identifiant d&apos;appareil si fourni,
                version d&apos;application si fournie, journaux d&apos;envoi et contenu des
                notifications operationnelles.
              </li>
              <li>
                <strong>Donnees techniques :</strong> cookies de session, preference de
                theme, etat de certaines interfaces, donnees de cache local, journaux
                techniques, informations de navigateur et donnees de consultation du site.
              </li>
              <li>
                <strong>Donnees liees aux imports :</strong> URLs source, identifiants de
                pages Facebook, contenu public de pages evenement ou agenda, et donnees
                extraites lors des imports ou du scraping assiste.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              3. Finalites des traitements
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>ouvrir et securiser l&apos;acces aux espaces admin et organisateur ;</li>
              <li>gerer les roles, equipes, invitations et habilitations ;</li>
              <li>creer, modifier, publier, moderer ou supprimer les contenus OutLive ;</li>
              <li>traiter les demandes utilisateur et les feedbacks ;</li>
              <li>televerser et servir les images liees aux contenus ;</li>
              <li>
                envoyer des emails d&apos;invitation et des notifications push relatives au
                service ;
              </li>
              <li>
                exploiter les outils d&apos;import depuis une URL, Facebook ou un agenda, et
                eventuellement enrichir ces imports via une extraction assistee par IA ;
              </li>
              <li>assurer la maintenance, la securite, l&apos;audit et la prevention des abus ;</li>
              <li>mesurer l&apos;usage du site et ameliorer l&apos;experience d&apos;administration.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              4. Bases legales
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Execution du service et mesures precontractuelles :</strong> gestion
                des comptes, invitations, acces aux espaces et administration des contenus.
              </li>
              <li>
                <strong>Interet legitime :</strong> securite, journalisation, prevention des
                fraudes, moderation, support, pilotage de la plateforme et mesure
                d&apos;audience raisonnable du site.
              </li>
              <li>
                <strong>Consentement ou choix utilisateur lorsque requis :</strong> par
                exemple pour certaines notifications poussees selon les preferences
                configurees dans l&apos;application mobile.
              </li>
              <li>
                <strong>Obligations legales :</strong> lorsque la loi impose la conservation
                ou la communication de certaines informations.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              5. Prestataires et services tiers
            </h2>
            <p>
              Nous ne vendons pas vos donnees personnelles. Nous les partageons uniquement
              avec les prestataires necessaires au fonctionnement du service ou lorsque la loi
              l&apos;impose.
            </p>
            <ul className="list-disc space-y-3 pl-6">
              <li>
                <strong>Supabase</strong> : authentification, base de donnees, stockage
                d&apos;images et gestion des sessions.
                {" "}
                <a
                  href="https://supabase.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Politique de confidentialite de Supabase
                </a>
              </li>
              <li>
                <strong>Vercel</strong> : hebergement du site et mesure d&apos;audience via
                Vercel Analytics.
                {" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Politique de confidentialite de Vercel
                </a>
              </li>
              <li>
                <strong>Google Firebase Cloud Messaging (FCM)</strong> : envoi des
                notifications push vers les appareils Android.
                {" "}
                <a
                  href="https://firebase.google.com/support/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Informations de confidentialite Firebase
                </a>
              </li>
              <li>
                <strong>Apple Push Notification service (APNs)</strong> : envoi des
                notifications push vers les appareils iOS.
                {" "}
                <a
                  href="https://www.apple.com/legal/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Politique de confidentialite Apple
                </a>
              </li>
              <li>
                <strong>Resend</strong> : envoi des emails d&apos;invitation lorsque la
                fonctionnalite email est activee sur le projet.
                {" "}
                <a
                  href="https://resend.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Politique de confidentialite Resend
                </a>
              </li>
              <li>
                <strong>OpenAI</strong> : uniquement si l&apos;option de scraping assiste par IA
                est configuree. Dans ce cas, l&apos;URL source, le titre, la description, les
                metadonnees Open Graph/Twitter et une partie du contenu textuel de la page
                analysee peuvent etre transmises a OpenAI pour extraire des informations
                structurees sur un evenement.
                {" "}
                <a
                  href="https://openai.com/policies/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Politique de confidentialite OpenAI
                </a>
              </li>
              <li>
                <strong>Meta / Facebook Graph API</strong> : uniquement si vous utilisez les
                outils d&apos;import Facebook. Dans ce cas, l&apos;identifiant de page Facebook et
                les donnees publiques d&apos;evenements demandees a l&apos;API peuvent etre traites.
                {" "}
                <a
                  href="https://www.facebook.com/privacy/policy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Politique de confidentialite Meta
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              6. Cookies, session et stockage local
            </h2>
            <p>
              Le site utilise des cookies et mecanismes techniques de stockage local pour :
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>maintenir votre session d&apos;authentification Supabase ;</li>
              <li>faire fonctionner certaines API protegees cote navigateur ;</li>
              <li>memoriser des preferences d&apos;interface, comme le theme ;</li>
              <li>conserver certains etats d&apos;interface et caches locaux utiles au confort d&apos;usage.</li>
            </ul>
            <p>
              Ces mecanismes sont principalement techniques et necessaires au fonctionnement du
              service. Le site embarque egalement Vercel Analytics pour mesurer l&apos;usage et la
              performance du produit.
            </p>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              7. Durees de conservation
            </h2>
            <p>
              Nous conservons les donnees pendant la duree necessaire aux finalites
              operationnelles, contractuelles et legales du service. Certaines durees sont deja
              automatisees dans la plateforme :
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Invitations organisateur :</strong> expiration automatique apres 7 jours
                si elles ne sont pas acceptees.
              </li>
              <li>
                <strong>Logs de notifications :</strong> suppression automatique au-dela de 90 jours.
              </li>
              <li>
                <strong>Tokens push inactifs :</strong> suppression automatique au-dela d&apos;1 an
                sans mise a jour.
              </li>
              <li>
                <strong>Evenements approuves passes :</strong> certains evenements passes peuvent
                etre purges automatiquement 30 jours apres leur date.
              </li>
              <li>
                <strong>Comptes, contenus, images et journaux d&apos;audit :</strong> conservation
                pendant la duree necessaire a l&apos;exploitation du service, a la gestion des acces,
                au suivi editorial et a la securite, puis suppression ou anonymisation lorsque cela
                n&apos;est plus necessaire.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              8. Securite
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>communications chiffrees via HTTPS ;</li>
              <li>authentification et sessions gerees via Supabase ;</li>
              <li>segmentation des acces admin / organisateur et controles RLS cote base ;</li>
              <li>journalisation de certaines actions sensibles de gestion d&apos;equipe ;</li>
              <li>restriction des acces aux cles serveur et aux integrations tierces.</li>
            </ul>
            <p>
              Aucun systeme n&apos;offre une securite absolue, mais nous cherchons a limiter
              l&apos;acces aux donnees au strict necessaire.
            </p>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              9. Transferts hors Union europeenne
            </h2>
            <p>
              Certains prestataires mentionnes ci-dessus peuvent traiter des donnees en dehors de
              l&apos;Union europeenne, notamment selon leur infrastructure ou la configuration du
              projet. Lorsque c&apos;est le cas, nous nous appuyons sur les mecanismes contractuels et
              garanties proposes par ces prestataires.
            </p>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              10. Vos droits
            </h2>
            <p>
              Sous reserve de la legislation applicable, vous disposez notamment des droits suivants :
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>droit d&apos;acces ;</li>
              <li>droit de rectification ;</li>
              <li>droit a l&apos;effacement ;</li>
              <li>droit a la limitation du traitement ;</li>
              <li>droit a la portabilite ;</li>
              <li>droit d&apos;opposition ;</li>
              <li>droit de definir des directives sur le sort de vos donnees apres votre deces ;</li>
              <li>droit d&apos;introduire une reclamation aupres de la CNIL.</li>
            </ul>
            <p className="mt-4">
              Pour exercer vos droits, ecrivez-nous a{" "}
              <a
                href="mailto:lazbutton@proton.me"
                className="text-primary hover:underline"
              >
                lazbutton@proton.me
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              11. Modifications de cette politique
            </h2>
            <p>
              Cette politique peut evoluer pour refleter les changements du service, des
              integrations tierces ou des obligations legales. Toute mise a jour substantielle
              sera publiee sur cette page avec une nouvelle date de mise a jour.
            </p>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">
              12. Autorite de controle
            </h2>
            <p>
              Si vous estimez que le traitement de vos donnees personnelles n&apos;est pas conforme
              a la reglementation applicable, vous pouvez introduire une reclamation aupres de la{" "}
              <a
                href="https://www.cnil.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                CNIL
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

