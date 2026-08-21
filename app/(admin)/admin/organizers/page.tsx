"use client";

import { AdminLayout } from "../components/admin-layout";
import { OrganizersManagement } from "../components/organizers-management";

export default function OrganizersPage() {
  return (
    <AdminLayout title="Organisateurs" breadcrumbItems={[{ label: "Organisateurs" }]}>
      <OrganizersManagement />
    </AdminLayout>
  );
}

