import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, MapPin, Music4, Users } from "lucide-react";

import {
  PublicLinkCard,
  PublicPageShell,
  PublicSection,
} from "@/components/public-share/public-page-shell";
import { buildPublicMetadata } from "@/lib/metadata";
import {
  buildDownloadAppPath,
  buildEventOpenPath,
} from "@/lib/mobile-app-links";
import { getEventSharePageData } from "@/lib/public-share-data";

export const revalidate = 300;

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function ExternalActionCard({
  href,
  label,
  caption,
}: {
  href: string;
  label: string;
  caption: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.035] px-4 py-4 transition hover:border-white/18 hover:bg-white/[0.05]"
    >
      <div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
          {caption}
        </div>
        <div className="mt-1 text-sm font-semibold text-white">{label}</div>
      </div>
      <ExternalLink className="h-4 w-4 shrink-0 text-white/34 transition group-hover:text-white/66" />
    </a>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getEventSharePageData(id);

  if (!data) {
    return buildPublicMetadata({
      title: "Événement | OutLive",
      description: "Page publique d'un événement OutLive.",
      path: `/event/${id}`,
      image: `/event/${id}/opengraph-image`,
      type: "article",
    });
  }

  return buildPublicMetadata({
    title: data.title,
    description:
      data.description ||
      `Découvrez ${data.title} sur OutLive${data.locationLabel ? ` · ${data.locationLabel}` : ""}.`,
    path: data.sharePath,
    image: data.imageUrl || `${data.sharePath}/opengraph-image`,
    imageAlt: data.imageUrl
      ? `Image de l'événement ${data.title}`
      : `Aperçu OutLive de ${data.title}`,
    type: "article",
    keywords: [
      data.title,
      data.locationLabel || "",
      data.categoryLabel || "",
      "OutLive",
      "événement",
    ].filter(Boolean),
  });
}

export default async function EventSharePage({ params }: PageProps) {
  const { id } = await params;
  const data = await getEventSharePageData(id);

  if (!data) {
    notFound();
  }

  const openInAppPath = buildEventOpenPath(data.id, {
    from: data.sharePath,
    name: data.title,
  });
  const downloadAppPath = buildDownloadAppPath({
    from: data.sharePath,
    name: data.title,
  });

  return (
    <PublicPageShell
      eyebrow="Événement"
      title={data.title}
      description={
        data.description ||
        "Lien de partage enrichi OutLive avec aperçu web, ouverture directe dans l’app et fallback propre si elle n’est pas installée."
      }
      metaItems={[
        data.dateLabel,
        data.locationLabel,
        data.categoryLabel,
        data.priceLabel,
      ]}
      imageUrl={data.imageUrl}
      openInAppPath={openInAppPath}
      downloadAppPath={downloadAppPath}
    >
      {data.ticketUrl || data.locationLink || data.hub ? (
        <PublicSection
          title="Liens utiles"
          description="Retrouvez les accès rapides autour de cet événement."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {data.ticketUrl ? (
              <ExternalActionCard
                href={data.ticketUrl}
                caption="Billetterie"
                label={data.ticketLabel || "Réserver"}
              />
            ) : null}
            {data.locationLink ? (
              <PublicLinkCard item={data.locationLink} icon={<MapPin className="h-4 w-4" />} />
            ) : null}
            {data.hub ? (
              <PublicLinkCard item={data.hub} icon={<Users className="h-4 w-4" />} />
            ) : null}
          </div>
        </PublicSection>
      ) : null}

      {data.artists.length > 0 ? (
        <PublicSection
          title="Artistes liés"
          description="Les artistes associés à cette date sur OutLive."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.artists.map((artist) => (
              <PublicLinkCard
                key={artist.id}
                item={artist}
                icon={<Music4 className="h-4 w-4" />}
              />
            ))}
          </div>
        </PublicSection>
      ) : null}

      {data.organizers.length > 0 ? (
        <PublicSection
          title="Organisateurs"
          description="Les structures derrière cet événement."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.organizers.map((organizer) => (
              <PublicLinkCard
                key={`${organizer.id}-${organizer.title}`}
                item={organizer}
                icon={<Users className="h-4 w-4" />}
              />
            ))}
          </div>
        </PublicSection>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/68">
        Partagé depuis OutLive. Si vous avez l&apos;application installée, ce lien
        peut s&apos;ouvrir directement dedans. Sinon, cette page web reste la
        version publique de consultation.
      </section>
    </PublicPageShell>
  );
}
