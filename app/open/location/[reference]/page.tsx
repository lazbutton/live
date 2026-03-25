import type { Metadata } from "next";

import { OpenEntityAppClient } from "@/components/public-share/open-entity-app-client";
import { buildPublicMetadata } from "@/lib/metadata";
import { normalizeInternalPath } from "@/lib/mobile-app-links";

export const metadata: Metadata = buildPublicMetadata({
  title: "Ouvrir dans l'app OutLive",
  description: "Redirection vers l'application OutLive.",
  path: "/open/location",
  noIndex: true,
});

type PageProps = {
  params: Promise<{
    reference: string;
  }>;
  searchParams: Promise<{
    from?: string;
    name?: string;
  }>;
};

export default async function OpenLocationAppPage({
  params,
  searchParams,
}: PageProps) {
  const { reference } = await params;
  const { from, name } = await searchParams;

  return (
    <OpenEntityAppClient
      entity="location"
      identifier={reference}
      displayName={name?.trim() || null}
      returnPath={normalizeInternalPath(from)}
    />
  );
}
