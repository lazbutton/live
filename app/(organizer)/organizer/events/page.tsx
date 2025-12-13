"use client";

import { Suspense } from "react";
import { OrganizerLayout } from "../components/organizer-layout";
import { OrganizerEventsManagement } from "../components/organizer-events-management";

function OrganizerEventsContent() {
  return (
    <OrganizerLayout title="Mes événements">
      <OrganizerEventsManagement />
    </OrganizerLayout>
  );
}

export default function OrganizerEventsPage() {
  return (
    <Suspense
      fallback={
        <OrganizerLayout title="Mes événements">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Chargement...</p>
            </div>
          </div>
        </OrganizerLayout>
      }
    >
      <OrganizerEventsContent />
    </Suspense>
  );
}



