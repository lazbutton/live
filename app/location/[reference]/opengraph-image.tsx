import {
  createPublicShareImage,
  publicShareImageContentType,
  publicShareImageSize,
} from "@/lib/public-share-og";
import { getLocationSharePageData } from "@/lib/public-share-data";

export const size = publicShareImageSize;
export const contentType = publicShareImageContentType;

type PageProps = {
  params: Promise<{
    reference: string;
  }>;
};

export default async function LocationOpenGraphImage({ params }: PageProps) {
  const { reference } = await params;
  const data = await getLocationSharePageData(reference);

  return createPublicShareImage({
    eyebrow: data?.isOrganizer ? "Lieu organisateur" : "Lieu",
    title: data?.title || "OutLive",
    description:
      data?.description ||
      "Découvrez ce lieu et les événements à venir sur OutLive.",
    metaItems: data
      ? [
          data.address,
          data.cityLabel,
          `${data.upcomingEvents.length} événement${data.upcomingEvents.length > 1 ? "s" : ""}`,
        ]
      : ["OutLive", "Lieu"],
  });
}
