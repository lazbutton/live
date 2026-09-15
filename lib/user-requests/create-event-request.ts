import { createClient } from "@supabase/supabase-js";

import { sendNotificationToAdmins } from "@/lib/notifications/admin";
import type { NotificationResult } from "@/lib/notifications";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type EventCreationRequestInput = {
  requestType: "event_creation";
  eventData: Record<string, unknown>;
  contributorDisplayName?: string | null;
  communityAttributionOptIn?: boolean;
};

export type EventFromUrlRequestInput = {
  requestType: "event_from_url";
  locationId?: string | null;
  locationName: string;
  sourceUrl: string;
  contributorDisplayName?: string | null;
  communityAttributionOptIn?: boolean;
};

export type CreateEventRequestInput =
  | EventCreationRequestInput
  | EventFromUrlRequestInput;

export type CreatedEventRequest = {
  id: string;
  request_type: string;
  event_data?: Record<string, unknown> | null;
  source_url?: string | null;
};

export type CreateEventRequestResult =
  | {
      ok: true;
      request: CreatedEventRequest;
      notification: NotificationResult;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

function createUserScopedClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function buildNotificationBody(payload: {
  requestType: string;
  eventTitle?: string | null;
}) {
  const requestTypeLabel =
    payload.requestType === "event_from_url" ? "depuis URL" : "complète";
  const title = payload.eventTitle?.toString().trim() || "Nouvelle demande";

  if (title !== "Nouvelle demande") {
    return `Nouvelle demande ${requestTypeLabel}: ${title}`;
  }

  return `Nouvelle demande ${requestTypeLabel} d'événement`;
}

export function createdRequestSuccessMessage(requestType: string) {
  return requestType === "event_from_url"
    ? "Demande de création d'événement depuis URL soumise avec succès. Elle sera examinée par un administrateur."
    : "Demande de création d'événement soumise avec succès. Elle sera examinée par un administrateur.";
}

export async function createEventUserRequest(options: {
  accessToken: string;
  userId: string;
  input: CreateEventRequestInput;
}): Promise<CreateEventRequestResult> {
  const supabase = createUserScopedClient(options.accessToken);
  const contributorDisplayName =
    options.input.contributorDisplayName?.trim() || null;
  const communityAttributionOptIn =
    options.input.communityAttributionOptIn ?? false;

  let createdRequest: CreatedEventRequest | null = null;

  if (options.input.requestType === "event_creation") {
    const { data, error } = await supabase
      .from("user_requests")
      .insert({
        request_type: "event_creation",
        requested_by: options.userId,
        event_data: options.input.eventData,
        status: "pending",
        contributor_display_name: contributorDisplayName,
        community_attribution_opt_in: communityAttributionOptIn,
      })
      .select("id, request_type, event_data, source_url")
      .single();

    if (error || !data) {
      return {
        ok: false,
        status: 400,
        message:
          error?.message || "Impossible de créer la demande event_creation",
      };
    }

    createdRequest = data as CreatedEventRequest;
  } else {
    const locationName = options.input.locationName.trim();
    const sourceUrl = options.input.sourceUrl.trim();
    if (!locationName || !sourceUrl) {
      return {
        ok: false,
        status: 400,
        message: "locationName et sourceUrl sont requis pour event_from_url",
      };
    }

    const locationId = options.input.locationId?.trim() || null;

    const { data, error } = await supabase
      .from("user_requests")
      .insert({
        request_type: "event_from_url",
        requested_by: options.userId,
        location_id: locationId,
        location_name: locationName,
        source_url: sourceUrl,
        status: "pending",
        contributor_display_name: contributorDisplayName,
        community_attribution_opt_in: communityAttributionOptIn,
      })
      .select("id, request_type, event_data, source_url")
      .single();

    if (error || !data) {
      return {
        ok: false,
        status: 400,
        message:
          error?.message || "Impossible de créer la demande event_from_url",
      };
    }

    createdRequest = data as CreatedEventRequest;
  }

  const notification = await sendNotificationToAdmins({
    title: "📋 Nouvelle demande",
    body: buildNotificationBody({
      requestType: createdRequest.request_type,
      eventTitle: createdRequest.event_data?.title?.toString() ?? null,
    }),
    data: {
      type: "new_request",
      request_id: createdRequest.id,
      request_type: createdRequest.request_type,
      event_title: createdRequest.event_data?.title?.toString() ?? null,
      source_url: createdRequest.source_url ?? null,
    },
  });

  return {
    ok: true,
    request: createdRequest,
    notification,
  };
}
