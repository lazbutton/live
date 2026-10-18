"use client";

import { AdminLayout } from "../components/admin-layout";
import { LocationsManagement } from "../components/locations-management";

export default function LocationsPage() {
  return (
    <AdminLayout breadcrumbItems={[{ label: "Lieux" }]}>
      <LocationsManagement />
    </AdminLayout>
  );
}

