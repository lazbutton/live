import { NextRequest, NextResponse } from "next/server";

import { extractEventFromImage } from "@/lib/events/extract-event-from-image";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    if (user.user_metadata?.role !== "admin") {
      return NextResponse.json(
        { error: "Acces refuse. Administrateur requis." },
        { status: 403 },
      );
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
      metadata: result.metadata,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Erreur extraction image evenement:", error);
    return NextResponse.json(
      {
        error: "Erreur lors de l'analyse de l'image.",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 },
    );
  }
}
