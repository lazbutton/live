"use client";

import { AdminLayout } from "../components/admin-layout";
import { SocialVisualStudio } from "../components/social-visual-studio";

export default function SharePage() {
  return (
    <AdminLayout
      title="Visuels réseaux"
      breadcrumbItems={[{ label: "Visuels réseaux" }]}
    >
      <SocialVisualStudio />
    </AdminLayout>
  );
}
















