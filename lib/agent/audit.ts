import { AGENT_ACTOR, type AgentContext } from "./context";

/** Trace une action de l'agent dans le journal d'audit de l'admin (rien en simulation). */
export async function logAgentAction(
  ctx: AgentContext,
  input: {
    action: string;
    entityType: string;
    entityId?: string | null;
    entityLabel?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  if (ctx.dryRun) return;
  const { error } = await ctx.supabase.from("admin_audit_log").insert({
    actor_user_id: null,
    actor_email: AGENT_ACTOR,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    entity_label: input.entityLabel ?? null,
    metadata: { ...(input.metadata || {}), via: "agent" },
  });
  if (error) console.warn("Journal d'audit de l'agent non enregistré:", error.message);
}
