"use client";

import { AdminLayout } from "../components/admin-layout";
import { UsersManagement } from "../components/users-management";

export default function UsersPage() {
  return (
    <AdminLayout title="Utilisateurs">
      <UsersManagement />
    </AdminLayout>
  );
}



