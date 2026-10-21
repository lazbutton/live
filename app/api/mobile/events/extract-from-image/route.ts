import { NextRequest, NextResponse } from "next/server";

import {
  appError,
  invalidBodyResponse,
  parseAppBody,
} from "@/lib/api/app/http";
import {
  extractFromImageFormSchema,
  type ExtractFromImageError,
  type ExtractFromImageResponse,
} from "@/lib/api/app/schemas";
import { extractEventFromImage } from "@/lib/events/extract-event-from-image";
import {
  POSTER_ANALYSIS_LIMIT_MESSAGE,
  takePosterAnalysis,
} from "@/lib/events/poster-analysis-quota";
import { requireMobileSession } from "@/lib/mobile-user-auth";
import { createServiceClient } from "@/lib/supabase/service";

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

/**
 * POST /api/mobile/events/extract-from-image
 *
 * Pré-remplit une demande d'événement à partir d'une affiche. Formulaire multipart :
 * `extractFromImageFormSchema` (lib/api/app/schemas.ts), voir docs/API_APP.md.
 *
 * Ouverte à toute session de l'app, invitée comprise (« Proposer » ne demande le compte qu'à
 * l'envoi), avec un plafond par jour (lib/events/poster-analysis-quota.ts).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMobileSession(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return invalidBodyResponse([
        { path: "", message: "formulaire multipart attendu" },
      ]);
    }
    const imageEntry = formData.get("image");
    const imageUrlEntry = formData.get("imageUrl");

    const form = parseAppBody(extractFromImageFormSchema, {
      image: imageEntry instanceof File ? imageEntry : null,
      imageUrl: typeof imageUrlEntry === "string" ? imageUrlEntry : null,
    });
    if (!form.ok) return form.response;
    const { image: imageFile, imageUrl } = form.data;

    if (imageFile) {
      const mimeType = resolveMimeType(imageFile);

      if (imageFile.size <= 0) {
        return appError("Le fichier image est vide.", 400);
      }

      if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
        return appError(
          "L'image est trop volumineuse. Merci de choisir un fichier plus leger.",
          413,
        );
      }

      if (!isImageMimeType(mimeType)) {
        return appError(
          "Le fichier fourni n'est pas une image exploitable.",
          400,
        );
      }
    }

    // Le plafond du jour, réservé juste avant l'appel à l'IA (un formulaire refusé ne compte pas).
    const quota = await takePosterAnalysis(createServiceClient, {
      userId: auth.user.id,
      isGuest: auth.isGuest,
    });
    if (quota === "user_limit" || quota === "guest_limit") {
      return appError(POSTER_ANALYSIS_LIMIT_MESSAGE, 429);
    }
    if (quota === "unavailable" && auth.isGuest) {
      // Sans compteur, pas d'analyse pour une session invitée : comme avant l'ouverture à tous.
      return appError("Connecte-toi pour faire lire l'affiche.", 403);
    }

    const result = await extractEventFromImage({
      imageFile,
      imageUrl,
    });

    if (!result.ok) {
      return NextResponse.json<ExtractFromImageError>(
        {
          error: result.error,
          warnings: "warnings" in result ? result.warnings : undefined,
        },
        { status: result.status },
      );
    }

    return NextResponse.json<ExtractFromImageResponse>({
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
    return appError("Erreur lors de l'analyse de l'image.", 500, {
      details: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }
}
