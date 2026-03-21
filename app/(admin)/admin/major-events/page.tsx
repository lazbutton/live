"use client";

import { AdminLayout } from "../components/admin-layout";
import { MajorEventsPage } from "../components/major-events/major-events-page";

export default function AdminMajorEventsPage() {
  return (
    <AdminLayout title="Multi-événements" breadcrumbItems={[{ label: "Multi-événements" }]}>
      <MajorEventsPage />
    </AdminLayout>
  );
}
