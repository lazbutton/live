"use client";

import { AdminLayout } from "../components/admin-layout";
import { RequestsWorkspaceKanban } from "../components/requests/requests-workspace-kanban";

export default function RequestsPage() {
  return (
    <AdminLayout title="Demandes" breadcrumbItems={[{ label: "Demandes" }]}>
      <RequestsWorkspaceKanban />
    </AdminLayout>
  );
}

