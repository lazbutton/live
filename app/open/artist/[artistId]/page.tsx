import type { Metadata } from "next";

import { OpenEntityAppClient } from "@/components/public-share/open-entity-app-client";
import { buildPublicMetadata } from "@/lib/metadata";
import { normalizeInternalPath } from "@/lib/mobile-app-links";

export const metadata: Metadata = buildPublicMetadata({
  title: "Ouvrir dans l'app OutLive",
  description: "Redirection vers l'application OutLive.",
  path: "/open/artist",
  noIndex: true,
});

type PageProps = {
  params: Promise<{
    artistId: string;
  }>;
  searchParams: Promise<{
    from?: string;
    name?: string;
  }>;
};

export default async function OpenArtistAppPage({
  params,
  searchParams,
}: PageProps) {
  const { artistId } = await params;
  const { from, name } = await searchParams;

  return (
    <OpenEntityAppClient
      entity="artist"
      identifier={artistId}
      displayName={name?.trim() || null}
      returnPath={normalizeInternalPath(from)}
    />
  );
}
