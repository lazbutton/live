"use client";

import { AdminLayout } from "../components/admin-layout";
import { FicheReview } from "../components/fiches/fiche-review";

export default function AdminFichesPage() {
  return (
    <AdminLayout breadcrumbItems={[{ label: "Fiches à compléter" }]}>
      <FicheReview />
    </AdminLayout>
  );
}
