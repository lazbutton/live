import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { refreshImageCard } from "@/lib/image-cards/service";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * POST /api/events/[id]/image-card
 *
 * Webhook de la base (trigger events_request_image_card, pg_net) : fabrique la vignette de
 * l'affiche de l'événement et remplit image_card_url, image_width, image_height, image_color.
 * Réservé au détenteur de IMAGE_CARD_WEBHOOK_SECRET (Authorization: Bearer), la même valeur que
 * le secret « image_card_webhook_secret » de Vault. Le corps envoyé par la base est ignoré :
 * l'événement est relu. Mode d'emploi : docs/EVENT_IMAGE_CARDS.md.
 *
 * Réponses (journalisées par pg_net dans net._http_response) : 200 avec le résultat, y compris un
 * échec définitif (noté dans image_card_error) ; 503 pour un échec passager, que le cron
 * quotidien reprendra ; 404 événement introuvable ; 400 id invalide ; 401 secret absent ou faux.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAuthorized(request: NextRequest, expected: string) {
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const secret = process.env.IMAGE_CARD_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Vignettes désactivées : définis IMAGE_CARD_WEBHOOK_SECRET pour les activer." },
      { status: 503 },
    );
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Secret manquant ou invalide." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Identifiant d'événement invalide." }, { status: 400 });
  }

  const result = await refreshImageCard(createServiceClient(), id);
  if (result.status === "failed") {
    console.error(`Vignette de l'événement ${id} : ${result.error}`);
  }
  const status = result.status === "not_found" ? 404 : result.status === "failed" && result.retry ? 503 : 200;
  return NextResponse.json(result, { status });
}
