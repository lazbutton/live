import { NextRequest } from "next/server";
import { legacyEventRemindersRemovedResponse } from "@/lib/notifications/legacy-reminders";

/**
 * GET /api/events/[id]/notifications
 *
 * Legacy endpoint désactivé.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  void request;
  void context;
  return legacyEventRemindersRemovedResponse();
}

/**
 * POST /api/events/[id]/notifications
 *
 * Legacy endpoint désactivé.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  void request;
  void context;
  return legacyEventRemindersRemovedResponse();
}

/**
 * DELETE /api/events/[id]/notifications
 *
 * Legacy endpoint désactivé.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  void request;
  void context;
  return legacyEventRemindersRemovedResponse();
}

