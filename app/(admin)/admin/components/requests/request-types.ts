import type { AdminRequestItem, AdminRequestLane } from "@/lib/admin-requests";

export type DuplicateEvent = {
  id: string;
  title: string;
  date: string;
  external_url: string | null;
  scraping_url: string | null;
};

export type RequestBoardByLane = Record<AdminRequestLane, AdminRequestItem[]>;
