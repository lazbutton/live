import type { Metadata } from "next";

import { buildPublicMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPublicMetadata({
  title: "Aide et assistance",
  description:
    "Page d'aide et d'assistance pour l'application OutLive. Contact support, aide rapide et liens utiles.",
  path: "/help",
});

const LAST_UPDATED = "24 mars 2026";

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="mb-8 text-4xl font-bold">Aide et assistance</h1>

        <div className="prose prose-lg max-w-none space-y-6">
          <section>
            <p className="mb-4 text-muted-foreground">
              <strong>Derniere mise a jour :</strong> {LAST_UPDATED}
            </p>
            <p>
              Cette page sert de point de contact officiel pour l&apos;assistance de
              l&apos;application <strong>OutLive</strong>, notamment pour l&apos;App Store.
            </p>
            <p>
              Si vous rencontrez un probleme avec l&apos;application, les notifications,
              votre compte ou les informations affichees sur un evenement, vous pouvez
              nous contacter directement.
            </p>
            <p>
              Pour les contenus generes par les utilisateurs, vous pouvez aussi
              signaler un evenement depuis l&apos;application, demander le blocage
              de son auteur et contacter notre equipe si un contenu vous semble
              choquant, abusif, frauduleux, haineux ou usurpe.
            </p>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">1. Contacter l&apos;assistance</h2>
            <div className="rounded-lg bg-muted p-4">
              <p>
                <strong>Email :</strong>{" "}
                <a href="mailto:lazbutton@proton.me" className="text-primary hover:underline">
                  lazbutton@proton.me
                </a>
              </p>
              <p className="mt-2">
                <strong>Adresse :</strong> 3 Rue de la Cholerie, 45000 Orleans, France
              </p>
            </div>
            <p className="mt-4">
              Pour accelerer le traitement de votre demande, indiquez si possible :
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>le modele de votre appareil ;</li>
              <li>la version d&apos;iOS ou d&apos;Android ;</li>
              <li>la version de l&apos;application ;</li>
              <li>une description precise du probleme ;</li>
              <li>des captures d&apos;ecran si cela aide a comprendre le bug.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">2. Aide rapide</h2>
            <h3 className="mb-3 mt-6 text-xl font-semibold">Notifications</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>verifiez que les notifications sont autorisees dans les reglages du telephone ;</li>
              <li>ouvrez l&apos;application apres installation pour enregistrer correctement le device ;</li>
              <li>si besoin, desactivez puis reactivez les notifications dans l&apos;application.</li>
            </ul>

            <h3 className="mb-3 mt-6 text-xl font-semibold">Informations d&apos;evenement</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>les horaires, lieux ou tarifs peuvent etre modifies par les organisateurs ;</li>
              <li>en cas de doute, verifiez aussi la source officielle ou le lien externe de l&apos;evenement ;</li>
              <li>si une fiche contient une erreur, contactez-nous par email avec le nom de l&apos;evenement.</li>
            </ul>

            <h3 className="mb-3 mt-6 text-xl font-semibold">Compte et acces</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>si vous ne pouvez plus vous connecter, precisez l&apos;email utilise pour votre compte ;</li>
              <li>si vous etes organisateur, indiquez aussi le nom de la structure concernee.</li>
            </ul>

            <h3 className="mb-3 mt-6 text-xl font-semibold">
              Signalements et securite communautaire
            </h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>ouvrez la fiche d&apos;un evenement puis utilisez l&apos;action Signaler ce contenu ;</li>
              <li>vous pouvez demander en meme temps le blocage de l&apos;auteur ;</li>
              <li>le blocage retire immediatement les contenus de cet auteur de votre feed ;</li>
              <li>les signalements UGC sont examines par une moderation humaine sous 24h.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">3. Liens utiles</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <a href="/privacy-policy" className="text-primary hover:underline">
                  Politique de confidentialite
                </a>
              </li>
              <li>
                <a href="/terms-of-service" className="text-primary hover:underline">
                  Conditions d&apos;utilisation
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 mt-8 text-2xl font-semibold">4. Delai de reponse</h2>
            <p>
              Nous faisons au mieux pour repondre rapidement aux demandes
              d&apos;assistance. Pour les signalements lies a des contenus
              potentiellement choquants, haineux, frauduleux, usurpes ou abusifs,
              notre objectif est une revue humaine sous 24h.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
