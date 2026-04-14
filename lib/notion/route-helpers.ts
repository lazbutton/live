import { NextRequest, NextResponse } from "next/server";
import { requireAdminMobileAuth } from "@/lib/admin-mobile-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getNotionSyncConfig } from "@/lib/notion/config";

export async function requireNotionAdminRoute(request: NextRequest) {
  const auth = await requireAdminMobileAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  return {
    auth,
    supabase: createServiceClient(),
  };
}

export function ensureNotionSyncEnabled({
  allowWhenDisabled = false,
} = {}) {
  const config = getNotionSyncConfig();
  if (!config.enabled && !allowWhenDisabled) {
    return NextResponse.json(
      {
        error: "La synchronisation Notion est désactivée via NOTION_SYNC_ENABLED.",
      },
      { status: 503 }
    );
  }
  return null;
}
