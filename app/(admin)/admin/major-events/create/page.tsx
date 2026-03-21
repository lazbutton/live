"use client";

import { AdminLayout } from "../../components/admin-layout";
import { MajorEventFormPage } from "../../components/major-events/major-event-form-page";

export default function AdminMajorEventsCreatePage() {
  return (
    <AdminLayout
      title="Créer un Multi-événements"
      breadcrumbItems={[
        { label: "Multi-événements", href: "/admin/major-events" },
        { label: "Créer" },
      ]}
    >
      <MajorEventFormPage />
    </AdminLayout>
  );
}
