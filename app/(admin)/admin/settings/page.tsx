"use client";

import { AdminLayout } from "../components/admin-layout";
import { SettingsPage } from "../components/settings/settings-page";

export default function AdminSettingsPage() {
  return (
    <AdminLayout title="Réglages" breadcrumbItems={[{ label: "Réglages" }]}>
      <SettingsPage />
    </AdminLayout>
  );
}

