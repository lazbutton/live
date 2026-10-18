"use client";

import { AdminLayout } from "../components/admin-layout";
import { SettingsPage } from "../components/settings/settings-page";

export default function AdminSettingsPage() {
  return (
    <AdminLayout
      title="Réglages"
      description="Catégories et tags, utilisateurs, notifications et santé du système."
      breadcrumbItems={[{ label: "Réglages" }]}
    >
      <SettingsPage />
    </AdminLayout>
  );
}

