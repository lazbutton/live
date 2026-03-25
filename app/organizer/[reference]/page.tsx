import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  ExternalLink,
  Globe,
  Instagram,
  Music2,
} from "lucide-react";

import {
  PublicEventCard,
  PublicLinkCard,
  PublicPageShell,
  PublicSection,
} from "@/components/public-share/public-page-shell";
import { buildPublicMetadata } from "@/lib/metadata";
import {
  buildDownloadAppPath,
  buildOrganizerOpenPath,
} from "@/lib/mobile-app-links";
import { getOrganizerSharePageData } from "@/lib/public-share-data";

export const revalidate = 300;

type PageProps = {
  params: Promise<{
    reference: string;
  }>;
};

function ExternalActionCard({
  href,
  label,
  caption,
  icon,
}: {
  href: string;
  label: string;
  caption: string;
  icon: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.035] px-4 py-4 transition hover:border-white/18 hover:bg-white/[0.05]"
    >
      <div className="flex items-center gap-3">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/24 text-white/74">
          {icon}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            {caption}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{label}</div>
        </div>
      </div>
      <ExternalLink className="h-4 w-4 shrink-0 text-white/34 transition group-hover:text-white/66" />
    </a>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params;
  const data = await getOrganizerSharePageData(reference);

  if (!data) {
    return buildPublicMetadata({
      title: "Organisateur | OutLive",
      description: "Page publique d'un organisateur OutLive.",
      path: `/organizer/${reference}`,
      image: `/organizer/${reference}/opengraph-image`,
    });
  }

  return buildPublicMetadata({
    title: data.title,
    description:
      data.description ||
      `Découvrez les prochaines dates organisées par ${data.title} sur OutLive.`,
    path: data.sharePath,
    image: `${data.sharePath}/opengraph-image`,
    imageAlt: `Aperçu OutLive de ${data.title}`,
    keywords: [data.title, "OutLive", "organisateur", "sorties"].filter(Boolean),
  });
}

export default async function OrganizerSharePage({ params }: PageProps) {
  const { reference } = await params;
  const data = await getOrganizerSharePageData(reference);

  if (!data) {
    notFound();
  }

  const openInAppPath = buildOrganizerOpenPath(data.reference, {
    from: data.sharePath,
    name: data.title,
  });
  const downloadAppPath = buildDownloadAppPath({
    from: data.sharePath,
    name: data.title,
  });

  return (
    <PublicPageShell
      eyebrow="Organisateur"
      title={data.title}
      description={
        data.description ||
        "Page publique de partage OutLive pour cet organisateur, avec aperçu riche et ouverture directe dans l’app."
      }
      metaItems={[
        `${data.upcomingEvents.length} événement${data.upcomingEvents.length > 1 ? "s" : ""}`,
        data.hubs.length > 0
          ? `${data.hubs.length} hub${data.hubs.length > 1 ? "s" : ""}`
          : null,
      ]}
      imageUrl={data.imageUrl}
      openInAppPath={openInAppPath}
      downloadAppPath={downloadAppPath}
    >
      {data.websiteUrl || data.instagramUrl || data.facebookUrl || data.tiktokUrl ? (
        <PublicSection
          title="Présence web"
          description="Liens publics disponibles pour cet organisateur."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.websiteUrl ? (
              <ExternalActionCard
                href={data.websiteUrl}
                caption="Site"
                label="Site officiel"
                icon={<Globe className="h-4 w-4" />}
              />
            ) : null}
            {data.instagramUrl ? (
              <ExternalActionCard
                href={data.instagramUrl}
                caption="Instagram"
                label="Voir le profil"
                icon={<Instagram className="h-4 w-4" />}
              />
            ) : null}
            {data.facebookUrl ? (
              <ExternalActionCard
                href={data.facebookUrl}
                caption="Facebook"
                label="Voir la page"
                icon={<Globe className="h-4 w-4" />}
              />
            ) : null}
            {data.tiktokUrl ? (
              <ExternalActionCard
                href={data.tiktokUrl}
                caption="TikTok"
                label="Voir le profil"
                icon={<Music2 className="h-4 w-4" />}
              />
            ) : null}
          </div>
        </PublicSection>
      ) : null}

      <PublicSection
        title="Prochaines dates"
        description="Les événements à venir attribués à cet organisateur sur OutLive."
      >
        {data.upcomingEvents.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.upcomingEvents.map((event) => (
              <PublicEventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm text-white/62">
            Aucun événement à venir n&apos;est encore publié pour cet organisateur.
          </div>
        )}
      </PublicSection>

      {data.hubs.length > 0 ? (
        <PublicSection
          title="Hubs liés"
          description="Les hubs multi-événements où cet organisateur apparaît."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.hubs.map((hub) => (
              <PublicLinkCard
                key={hub.id}
                item={hub}
                icon={<CalendarDays className="h-4 w-4" />}
              />
            ))}
          </div>
        </PublicSection>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/68">
        Cette page est optimisée pour les aperçus de partage et sert de fallback
        web quand l&apos;application n&apos;est pas installée.
      </section>
    </PublicPageShell>
  );
}
