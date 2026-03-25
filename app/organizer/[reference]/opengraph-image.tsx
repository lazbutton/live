import {
  createPublicShareImage,
  publicShareImageContentType,
  publicShareImageSize,
} from "@/lib/public-share-og";
import { getOrganizerSharePageData } from "@/lib/public-share-data";

export const size = publicShareImageSize;
export const contentType = publicShareImageContentType;

type PageProps = {
  params: Promise<{
    reference: string;
  }>;
};

export default async function OrganizerOpenGraphImage({ params }: PageProps) {
  const { reference } = await params;
  const data = await getOrganizerSharePageData(reference);

  return createPublicShareImage({
    eyebrow: "Organisateur",
    title: data?.title || "OutLive",
    description:
      data?.description ||
      "Découvrez cet organisateur et ses prochaines dates sur OutLive.",
    metaItems: data
      ? [
          `${data.upcomingEvents.length} événement${data.upcomingEvents.length > 1 ? "s" : ""}`,
          data.hubs.length > 0
            ? `${data.hubs.length} hub${data.hubs.length > 1 ? "s" : ""}`
            : null,
        ]
      : ["OutLive", "Organisateur"],
  });
}
