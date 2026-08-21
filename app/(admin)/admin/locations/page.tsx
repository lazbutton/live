"use client";

import { AdminLayout } from "../components/admin-layout";
import { LocationsManagement } from "../components/locations-management";

export default function LocationsPage() {
  return (
    <AdminLayout title="Lieux" breadcrumbItems={[{ label: "Lieux" }]}>
      <LocationsManagement />
    </AdminLayout>
  );
}

