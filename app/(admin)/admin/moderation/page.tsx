"use client";

import { AdminLayout } from "../components/admin-layout";
import { ModerationQueue } from "../components/moderation/moderation-queue";

export default function AdminModerationPage() {
  return (
    <AdminLayout breadcrumbItems={[{ label: "Modération" }]}>
      <ModerationQueue />
    </AdminLayout>
  );
}
