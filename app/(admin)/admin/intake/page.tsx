"use client";

import { AdminLayout } from "../components/admin-layout";
import { EventIntakePage } from "../components/intake/event-intake-page";

export default function AdminIntakePage() {
  return (
    <AdminLayout>
      <EventIntakePage />
    </AdminLayout>
  );
}
