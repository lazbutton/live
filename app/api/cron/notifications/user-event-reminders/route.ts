import { NextRequest } from "next/server";
import { legacyEventRemindersRemovedResponse } from "@/lib/notifications/legacy-reminders";

/**
 * GET /api/cron/notifications/user-event-reminders
 *
 * Cron legacy désactivé.
 */
export async function GET(request: NextRequest) {
  void request;
  return legacyEventRemindersRemovedResponse();
}

