import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/*
 * Plafond de l'analyse d'affiche de l'app (POST /api/mobile/events/extract-from-image), ouverte à
 * tous depuis le 2026-10-21 (../live/docs/AMELIORATIONS.md, § 5) : « Proposer un événement » ne
 * demande le compte qu'à l'envoi. Compté en base, par session et par jour (heure de Paris), par
 * take_poster_analysis() (migration 20261021200000_create_poster_analysis_quota.sql).
 */

/** Analyses par jour pour une session, invitée ou compte. */
export const POSTER_ANALYSIS_DAILY_LIMIT = 10;

/**
 * Analyses par jour pour l'ensemble des sessions invitées : une session invitée ne coûte rien à
 * créer, ce total borne la dépense.
 */
export const POSTER_ANALYSIS_DAILY_GUEST_TOTAL = 200;

/** Réponse 429 quand le plafond du jour est atteint ; l'app propose alors de remplir à la main. */
export const POSTER_ANALYSIS_LIMIT_MESSAGE =
  "Tu as fait lire beaucoup d'affiches aujourd'hui. Remplis les infos à la main, ou réessaie demain.";

/**
 * - `ok` : analyse réservée pour aujourd'hui ;
 * - `user_limit` / `guest_limit` : plafond de la session, ou de l'ensemble des invités, atteint ;
 * - `unavailable` : le compteur n'a pas répondu (migration pas encore appliquée, base injoignable).
 */
export type PosterAnalysisQuota = "ok" | "user_limit" | "guest_limit" | "unavailable";

/**
 * Réserve une analyse d'affiche du jour pour la session [userId]. [serviceClient] crée le client
 * service role (créé ici : une configuration absente rend `unavailable`, pas une erreur 500).
 */
export async function takePosterAnalysis(
  serviceClient: () => SupabaseClient<Database>,
  { userId, isGuest }: { userId: string; isGuest: boolean },
): Promise<PosterAnalysisQuota> {
  try {
    const { data, error } = await serviceClient().rpc("take_poster_analysis", {
      user_id: userId,
      is_guest: isGuest,
      per_user_limit: POSTER_ANALYSIS_DAILY_LIMIT,
      guest_total_limit: POSTER_ANALYSIS_DAILY_GUEST_TOTAL,
    });
    if (error) {
      console.error("Plafond de l'analyse d'affiche indisponible:", error.message);
      return "unavailable";
    }
    if (data === "ok" || data === "user_limit" || data === "guest_limit") return data;
    console.error("Plafond de l'analyse d'affiche : réponse inattendue", data);
    return "unavailable";
  } catch (error) {
    console.error(
      "Plafond de l'analyse d'affiche indisponible:",
      error instanceof Error ? error.message : error,
    );
    return "unavailable";
  }
}
