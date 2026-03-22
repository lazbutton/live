"use client";

import { AdminLayout } from "../components/admin-layout";
import { RequestsWorkspace } from "../components/requests/requests-workspace";

export default function RequestsPage() {
  return (
    <AdminLayout title="Demandes" breadcrumbItems={[{ label: "Demandes" }]}>
      <RequestsWorkspace />
    </AdminLayout>
  );
}

