import type { AdminModerationReason } from "@/lib/admin-requests-core";

export type AdminRequestReviewAction = "request_changes" | "reject";

export const CONTRIBUTOR_MESSAGE_TEMPLATES: Record<
  AdminRequestReviewAction,
  Record<AdminModerationReason, string>
> = {
  request_changes: {
    duplicate:
      "On a besoin de vérifier ce point: cet événement semble déjà présent. Pouvez-vous préciser ce qui le différencie ?",
    invalid_date:
      "La date ou l’horaire semble incorrect. Pouvez-vous corriger l’information puis renvoyer la suggestion ?",
    insufficient_info:
      "Il manque quelques informations pour publier l’événement. Ajoutez les éléments demandés puis renvoyez la suggestion.",
    unreliable_source:
      "La source ne nous permet pas encore de vérifier l’événement. Ajoutez un lien ou des informations plus fiables.",
    out_of_scope:
      "La suggestion ne rentre pas encore clairement dans le périmètre OutLive. Ajoutez du contexte pour nous aider à la valider.",
  },
  reject: {
    duplicate: "Cette demande a été refusée car l’événement est déjà présent dans l’app.",
    invalid_date:
      "Cette demande a été refusée car la date ou l’horaire ne peut pas être validé.",
    insufficient_info:
      "Cette demande a été refusée car les informations disponibles ne permettent pas une publication fiable.",
    unreliable_source:
      "Cette demande a été refusée car la source ne permet pas de vérifier l’événement.",
    out_of_scope:
      "Cette demande a été refusée car elle ne correspond pas au périmètre OutLive.",
  },
};

export function getDefaultContributorMessage(
  action: AdminRequestReviewAction,
  reason: AdminModerationReason,
) {
  return CONTRIBUTOR_MESSAGE_TEMPLATES[action][reason];
}

export function buildRequestReviewUpdate({
  action,
  reviewedBy,
  internalNotes,
  moderationReason,
  contributorMessage,
}: {
  action: AdminRequestReviewAction;
  reviewedBy?: string | null;
  internalNotes: string;
  moderationReason: AdminModerationReason | "";
  contributorMessage: string;
}) {
  const normalizedInternalNotes = internalNotes.trim();
  const normalizedContributorMessage = contributorMessage.trim();

  if (!moderationReason) {
    throw new Error("Le motif structuré est obligatoire");
  }

  if (!normalizedContributorMessage) {
    throw new Error("Le message contributeur est obligatoire");
  }

  return {
    status: "rejected",
    notes: normalizedInternalNotes || null,
    internal_notes: normalizedInternalNotes || null,
    moderation_reason: moderationReason,
    contributor_message: normalizedContributorMessage,
    allow_user_resubmission: action === "request_changes",
    reviewed_by: reviewedBy || null,
    reviewed_at: new Date().toISOString(),
  };
}
