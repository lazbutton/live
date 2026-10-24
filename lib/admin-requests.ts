"use client";

import { supabase } from "@/lib/supabase/client";
export {
  type AdminModerationReason,
  type AdminRequestEventData,
  type AdminRawRequest,
  type AdminRequestItem,
  type AdminRequestLane,
  type AdminRequestPeriodFilter,
  type AdminRequestQueueFilter,
  type AdminRequestQueueGroup,
  type AdminRequestQueueSection,
  type AdminRequestStatus,
  type AdminRequestType,
  type AdminRequestTypeFilter,
  type AdminRequestWorkspaceTab,
  ADMIN_REQUEST_SELECT,
  buildAdminRequestItem,
  countActionablePendingRequests,
  countRequestsByLane,
  filterAdminRequests,
  flattenQueueSections,
  formatRequestAgeShort,
  getAdminRequestMissingFields,
  getQueueFilterFromLane,
  getRequestContributorLabel,
  getRequestLaneLabel,
  getModerationReasonLabel,
  getRequestWorkspaceTab,
  getRequestStatusLabel,
  getRequestTypeLabel,
  groupUnifiedQueue,
  safeDomainFromUrl,
  sortAdminRequests,
  startOfLocalDay,
} from "@/lib/admin-requests-core";
import {
  type AdminRawRequest,
  ADMIN_REQUEST_SELECT,
  buildAdminRequestItem,
  countActionablePendingRequests,
} from "@/lib/admin-requests-core";

/**
 * Les demandes de création, la plus récente d'abord. `withRequesterEmails` : avec l'e-mail du compte de
 * chaque auteur (la file des demandes, qui le montre quand une demande n'a pas de nom).
 */
export async function fetchAdminRequestItems({
  withRequesterEmails = false,
}: { withRequesterEmails?: boolean } = {}) {
  const { data, error } = await supabase
    .from("user_requests")
    .select(ADMIN_REQUEST_SELECT)
    .in("request_type", ["event_creation", "event_from_url"])
    .order("requested_at", { ascending: false });

  if (error) throw error;

  const rows = (data || []) as unknown as AdminRawRequest[];
  const emails = withRequesterEmails
    ? await fetchRequesterEmails(rows)
    : new Map<string, string>();
  return rows.map((request) =>
    buildAdminRequestItem(request, emails.get(request.requested_by ?? "") ?? null),
  );
}

/**
 * L'e-mail du compte de chaque auteur, par get_user_emails (admins seulement) ; vide si la lecture
 * échoue : la file montre alors l'id du compte.
 */
async function fetchRequesterEmails(rows: AdminRawRequest[]) {
  const ids = [
    ...new Set(rows.map((row) => row.requested_by).filter((id): id is string => Boolean(id))),
  ];
  const emails = new Map<string, string>();
  if (ids.length === 0) return emails;

  const { data, error } = await supabase.rpc("get_user_emails", { user_ids: ids });
  if (error) {
    console.error("E-mails des auteurs indisponibles:", error);
    return emails;
  }
  for (const row of data ?? []) {
    if (row.user_id && row.email) emails.set(row.user_id, row.email);
  }
  return emails;
}

export async function fetchPendingAdminRequestsCount() {
  const items = await fetchAdminRequestItems();
  return countActionablePendingRequests(items);
}
