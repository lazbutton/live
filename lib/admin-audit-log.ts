"use client";

import { supabase } from "@/lib/supabase/client";

export type AdminAuditActionInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logAdminAction(input: AdminAuditActionInput) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("admin_audit_log").insert({
      actor_user_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.warn("Audit log non enregistré:", error.message);
    }
  } catch (error) {
    console.warn("Audit log indisponible:", error);
  }
}
