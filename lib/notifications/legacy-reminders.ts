import { NextResponse } from "next/server";

export const LEGACY_EVENT_REMINDERS_REMOVED_MESSAGE =
  "Les rappels individuels par evenement ont ete retires. Utilisez uniquement les notifications par categories en frequence daily ou weekly.";

export function legacyEventRemindersRemovedResponse() {
  return NextResponse.json(
    {
      success: false,
      error: LEGACY_EVENT_REMINDERS_REMOVED_MESSAGE,
      legacy_feature_removed: true,
    },
    { status: 410 },
  );
}
