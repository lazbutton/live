import { NextResponse } from "next/server";

import { isAdminUser } from "@/lib/auth";
import { clearShowImage, defaultShowImageFit, setShowImage, squareShowImage } from "@/lib/radio/show-images";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/** Au-delà, Vercel refuse le corps de la requête (4,5 Mo). */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type Context = { params: Promise<{ id: string }> };

/** L'admin, puis l'émission ; une réponse d'erreur sinon. */
async function adminShow({ params }: Context) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  if (!isAdminUser(user)) return { response: NextResponse.json({ error: "Accès non autorisé" }, { status: 403 }) };

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { response: NextResponse.json({ error: "Émission inconnue" }, { status: 400 }) };
  const service = createServiceClient();
  const { data: show, error } = await service.from("radio_shows").select("id, slug, image_url").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!show) return { response: NextResponse.json({ error: "Émission introuvable" }, { status: 404 }) };
  return { service, show };
}

/**
 * POST /api/admin/radio/shows/[id]/image
 *
 * Corps multipart : `file` (une image, 4 Mo au plus). Le visuel gardé de l'émission, à la place de sa
 * pochette : recadré en carré (au centre ; un logo détouré, posé entier sur le noir), en WebP, dans
 * organizers-images/radio-shows/ (lib/radio/show-images.ts). Admin seulement. Réponse : `{ imageUrl }`.
 */
export async function POST(request: Request, context: Context) {
  try {
    const found = await adminShow(context);
    if ("response" in found) return found.response;
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "Image attendue" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image trop lourde (4 Mo au plus)" }, { status: 413 });
    }
    const input = Buffer.from(await file.arrayBuffer());
    let square: Buffer;
    try {
      square = await squareShowImage(input, await defaultShowImageFit(input));
    } catch {
      return NextResponse.json({ error: "Ce fichier n'est pas une image lisible" }, { status: 400 });
    }
    const imageUrl = await setShowImage(found.service, found.show, square);
    return NextResponse.json({ imageUrl });
  } catch (error: unknown) {
    console.error("Erreur POST /api/admin/radio/shows/[id]/image:", error);
    return NextResponse.json({ error: "Envoi impossible" }, { status: 500 });
  }
}

/** DELETE : l'émission reprend sa pochette. Réponse : `{ imageUrl: null }`. */
export async function DELETE(_request: Request, context: Context) {
  try {
    const found = await adminShow(context);
    if ("response" in found) return found.response;
    await clearShowImage(found.service, found.show);
    return NextResponse.json({ imageUrl: null });
  } catch (error: unknown) {
    console.error("Erreur DELETE /api/admin/radio/shows/[id]/image:", error);
    return NextResponse.json({ error: "Retrait impossible" }, { status: 500 });
  }
}
