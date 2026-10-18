"use client";

import { AdminLayout } from "../components/admin-layout";
import { ArtistsManagement } from "../components/artists-management";

export default function AdminArtistsPage() {
  return (
    <AdminLayout breadcrumbItems={[{ label: "Artistes" }]}>
      <ArtistsManagement />
    </AdminLayout>
  );
}
