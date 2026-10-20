import { NextRequest, NextResponse } from "next/server";
import { requireAdminMobileAuth } from "@/lib/admin-mobile-auth";

/**
 * POST /api/notion/resync
 *
 * Gardée pour les anciennes versions de l'app (bouton « Resync Notion » de l'admin embarquée).
 * La synchronisation Notion est retirée depuis le 2026-10-20 : la route vérifie toujours le JWT
 * admin (mêmes 401 et 403) et répond 200 avec la forme d'avant, sans rien faire (docs/API_APP.md).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminMobileAuth(request);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    ok: true,
    result: { mode: "notion_removed" },
    drainResult: null,
  });
}
