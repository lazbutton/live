import { redirect } from "next/navigation";

export default function FeedbackPage() {
  redirect("/admin/settings?tab=system#feedbacks");
}

