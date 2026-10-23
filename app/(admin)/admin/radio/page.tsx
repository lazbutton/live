"use client";

import { AdminLayout } from "../components/admin-layout";
import { RadioShowsManagement } from "../components/radio/radio-shows-management";

export default function AdminRadioPage() {
  return (
    <AdminLayout breadcrumbItems={[{ label: "Radio" }]}>
      <RadioShowsManagement />
    </AdminLayout>
  );
}
