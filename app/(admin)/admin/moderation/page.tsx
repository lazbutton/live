"use client";

import { AdminLayout } from "../components/admin-layout";
import { ModerationQueue } from "../components/moderation/moderation-queue";

export default function AdminModerationPage() {
  return (
    <AdminLayout
      title="Modération"
      breadcrumbItems={[{ label: "Modération" }]}
    >
      <ModerationQueue />
    </AdminLayout>
  );
}
