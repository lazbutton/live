import { redirect } from "next/navigation";

export default function CronsPage() {
  redirect("/admin/settings?tab=system#crons");
}

