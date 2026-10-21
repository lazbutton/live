"use client";

import { AdminLayout } from "../components/admin-layout";
import { AppAudience } from "../components/audience/app-audience";

export default function AdminAudiencePage() {
  return (
    <AdminLayout breadcrumbItems={[{ label: "Audience de l'app" }]}>
      <AppAudience />
    </AdminLayout>
  );
}
