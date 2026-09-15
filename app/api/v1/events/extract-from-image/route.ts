import { NextRequest, NextResponse } from "next/server";

import { requireV1UserAuth } from "@/lib/api/v1/auth";
import { jsonError } from "@/lib/api/v1/errors";
import { extractEventFromImage } from "@/lib/events/extract-event-from-image";

export const dynamic = "force-dynamic";

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
  const extension = fileName.includes(".")
    ? fileName.split(".").pop() || ""
    : "";
  return IMAGE_EXTENSION_TO_MIME[extension] || declaredType;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireV1UserAuth(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const imageEntry = formData.get("image");
    const imageUrlEntry = formData.get("imageUrl");

    const imageFile = imageEntry instanceof File ? imageEntry : null;
    const imageUrl =
      typeof imageUrlEntry === "string" ? imageUrlEntry.trim() : null;

    if (!imageFile && !imageUrl) {
      return jsonError(
        "validation_error",
        "Image requise pour l'analyse (fichier image ou imageUrl).",
        400,
      );
    }

    if (imageFile) {
      const mimeType = resolveMimeType(imageFile);

      if (imageFile.size <= 0) {
        return jsonError("validation_error", "Le fichier image est vide.", 400);
      }

      if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
        return jsonError(
          "payload_too_large",
          "L'image est trop volumineuse. Merci de choisir un fichier plus léger.",
          413,
        );
      }

      if (!isImageMimeType(mimeType)) {
        return jsonError(
          "validation_error",
          "Le fichier fourni n'est pas une image exploitable.",
          400,
        );
      }
    }

    const result = await extractEventFromImage({
      imageFile,
      imageUrl,
    });

    if (!result.ok) {
      const code =
        result.status === 413
          ? "payload_too_large"
          : result.status === 422
            ? "unprocessable_entity"
            : result.status >= 500
              ? "internal_error"
              : "validation_error";

      return jsonError(
        code,
        result.error,
        result.status,
        "warnings" in result ? result.warnings : undefined,
      );
    }

    return NextResponse.json({
      data: result.data,
      metadata: {
        ...result.metadata,
        requesterId: auth.auth.user.id,
      },
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Erreur POST /api/v1/events/extract-from-image:", error);
    return jsonError(
      "internal_error",
      "Erreur lors de l'analyse de l'image.",
      500,
      error instanceof Error ? error.message : undefined,
    );
  }
}
