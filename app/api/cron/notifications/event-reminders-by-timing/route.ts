import { NextRequest } from "next/server";
import { legacyEventRemindersRemovedResponse } from "@/lib/notifications/legacy-reminders";

/**
 * GET /api/cron/notifications/event-reminders-by-timing
 *
 * Cron legacy désactivé.
 */
export async function GET(request: NextRequest) {
  void request;
  return legacyEventRemindersRemovedResponse();
}





