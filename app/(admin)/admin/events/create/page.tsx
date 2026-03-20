import { redirect } from "next/navigation";

export default function CreateEventPage() {
  redirect("/admin/events?create=1");
}

