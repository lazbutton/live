import type { AdminRequestItem } from "@/lib/admin-requests";

export type DuplicateEvent = {
  id: string;
  title: string;
  date: string;
  external_url: string | null;
  scraping_url: string | null;
};
