"use client";

import { AdminLayout } from "../components/admin-layout";
import { EventsPage } from "../components/events/events-page";

export default function AdminEventsPage() {
  return (
    <AdminLayout title="Événements" breadcrumbItems={[{ label: "Événements" }]}>
      <EventsPage />
    </AdminLayout>
  );
}

