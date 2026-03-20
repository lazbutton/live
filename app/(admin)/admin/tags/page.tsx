import { redirect } from "next/navigation";

export default function TagsPage() {
  redirect("/admin/settings?tab=categories");
}

