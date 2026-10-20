"use client";

import { AdminLayout } from "../components/admin-layout";
import { TitleReview } from "../components/titles/title-review";

export default function AdminTitlesPage() {
  return (
    <AdminLayout breadcrumbItems={[{ label: "Titres à revoir" }]}>
      <TitleReview />
    </AdminLayout>
  );
}
