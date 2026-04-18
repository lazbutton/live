import { redirect } from "next/navigation";

import { buildDownloadAppPath, buildEventDeepLink } from "@/lib/mobile-app-links";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EventRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(
    buildDownloadAppPath({
      deepLink: buildEventDeepLink(id),
    }),
  );
}
