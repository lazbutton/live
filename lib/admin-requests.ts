"use client";

import { supabase } from "@/lib/supabase/client";
export {
  type AdminRequestEventData,
  type AdminRawRequest,
  type AdminRequestItem,
  type AdminRequestLane,
  type AdminRequestPeriodFilter,
  type AdminRequestStatus,
  type AdminRequestType,
  type AdminRequestTypeFilter,
  ADMIN_REQUEST_SELECT,
  buildAdminRequestItem,
  countActionablePendingRequests,
  countRequestsByLane,
  filterAdminRequests,
  formatRequestAgeShort,
  getAdminRequestMissingFields,
  getRequestLaneLabel,
  getRequestStatusLabel,
  getRequestTypeLabel,
  safeDomainFromUrl,
  sortAdminRequests,
  startOfLocalDay,
} from "@/lib/admin-requests-core";
import { type AdminRawRequest, ADMIN_REQUEST_SELECT, buildAdminRequestItem, countActionablePendingRequests } from "@/lib/admin-requests-core";

export async function fetchAdminRequestItems() {
  const { data, error } = await supabase
    .from("user_requests")
    .select(ADMIN_REQUEST_SELECT)
    .in("request_type", ["event_creation", "event_from_url"])
    .order("requested_at", { ascending: false });

  if (error) throw error;

  const rows = ((data || []) as unknown) as AdminRawRequest[];
  return rows.map((request) => buildAdminRequestItem(request));
}

export async function fetchPendingAdminRequestsCount() {
  const items = await fetchAdminRequestItems();
  return countActionablePendingRequests(items);
}
