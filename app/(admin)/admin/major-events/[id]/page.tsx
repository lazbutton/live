"use client";

import { useParams } from "next/navigation";

import { AdminLayout } from "../../components/admin-layout";
import { MajorEventFormPage } from "../../components/major-events/major-event-form-page";

export default function AdminMajorEventsDetailPage() {
  const params = useParams<{ id: string }>();
  const majorEventId = typeof params?.id === "string" ? params.id : "";

  return (
    <AdminLayout
      title="Éditer un Multi-événements"
      breadcrumbItems={[
        { label: "Multi-événements", href: "/admin/major-events" },
        { label: "Édition" },
      ]}
    >
      <MajorEventFormPage majorEventId={majorEventId} />
    </AdminLayout>
  );
}
