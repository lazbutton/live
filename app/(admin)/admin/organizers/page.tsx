import { redirect } from "next/navigation";

export default function OrganizersPage() {
  redirect("/admin/settings?tab=organizers");
}

