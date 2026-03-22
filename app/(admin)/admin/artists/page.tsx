"use client";

import { AdminLayout } from "../components/admin-layout";
import { ArtistsManagement } from "../components/artists-management";

export default function AdminArtistsPage() {
  return (
    <AdminLayout title="Artistes" breadcrumbItems={[{ label: "Artistes" }]}>
      <ArtistsManagement />
    </AdminLayout>
  );
}
