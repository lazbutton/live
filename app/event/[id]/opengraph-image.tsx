import { getEventSharePageData } from "@/lib/public-share-data";
import { createEventOgImage } from "@/lib/social-visuals/event-og-image";
import { publicShareImageContentType, publicShareImageSize } from "@/lib/public-share-og";

export const size = publicShareImageSize;
export const contentType = publicShareImageContentType;

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EventOpenGraphImage({ params }: PageProps) {
  const { id } = await params;
  const data = await getEventSharePageData(id);

  return createEventOgImage({ data });
}
