import { NextRequest, NextResponse } from "next/server";

import { extractEventFromImage } from "@/lib/events/extract-event-from-image";
import { requireMobileUserAuth } from "@/lib/mobile-user-auth";

const MAX_IMAGE_SIZE_BYTES = 12 * 1024 * 1024;
const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

function isImageMimeType(value: string) {
  return value.startsWith("image/");
}

function resolveMimeType(file: File) {
  const declaredType = file.type?.trim().toLowerCase() || "";
  if (isImageMimeType(declaredType)) {
    return declaredType;
  }

  const fileName = file.name?.trim().toLowerCase() || "";
  const extension = fileName.includes(".") ? fileName.split(".").pop() || "" : "";
  return IMAGE_EXTENSION_TO_MIME[extension] || declaredType;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMobileUserAuth(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const formData = await request.formData();
    const imageEntry = formData.get("image");
    const imageUrlEntry = formData.get("imageUrl");

    const imageFile = imageEntry instanceof File ? imageEntry : null;
    const imageUrl =
      typeof imageUrlEntry === "string" ? imageUrlEntry.trim() : null;

    if (!imageFile && !imageUrl) {
      return NextResponse.json(
        { error: "Image requise pour l'analyse." },
        { status: 400 },
      );
    }

    if (imageFile) {
      const mimeType = resolveMimeType(imageFile);

      if (imageFile.size <= 0) {
        return NextResponse.json(
          { error: "Le fichier image est vide." },
          { status: 400 },
        );
      }

      if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
        return NextResponse.json(
          {
            error:
              "L'image est trop volumineuse. Merci de choisir un fichier plus leger.",
          },
          { status: 413 },
        );
      }

      if (!isImageMimeType(mimeType)) {
        return NextResponse.json(
          {
            error:
              "Le fichier fourni n'est pas une image exploitable.",
          },
          { status: 400 },
        );
      }
    }

    const result = await extractEventFromImage({
      imageFile,
      imageUrl,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          warnings: "warnings" in result ? result.warnings : undefined,
        },
        { status: result.status },
      );
    }

    return NextResponse.json({
      data: result.data,
      metadata: {
        ...result.metadata,
        auth_mode: "jwt",
        requester_id: auth.user.id,
      },
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Erreur extraction image evenement mobile:", error);
    return NextResponse.json(
      {
        error: "Erreur lors de l'analyse de l'image.",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 },
    );
  }
}
