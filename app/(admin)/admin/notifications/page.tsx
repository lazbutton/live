"use client";

import { AdminLayout } from "../components/admin-layout";
import { NotificationsManagement } from "../components/notifications-management";

export default function NotificationsPage() {
  return (
    <AdminLayout
      title="Notifications Push"
      breadcrumbItems={[
        { label: "Notifications Push" }
      ]}
    >
      <NotificationsManagement />
    </AdminLayout>
  );
}


