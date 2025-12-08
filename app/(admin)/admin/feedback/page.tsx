"use client";

import { AdminLayout } from "@/app/(admin)/admin/components/admin-layout";
import { FeedbackManagement } from "@/app/(admin)/admin/components/feedback-management";

export default function FeedbackPage() {
  return (
    <AdminLayout title="Feedback">
      <FeedbackManagement />
    </AdminLayout>
  );
}

