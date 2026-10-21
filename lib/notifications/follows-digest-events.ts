import { createServiceClient } from "@/lib/supabase/service";
import type { FollowsDigestRow } from "./follows-digest";

/**
 * Les nouveaux événements des suivis de chacun, publiés jusqu'à [atTime] (ISO) : `follows_digest()`
 * (migration 20261021142000), qui reprend chaque personne là où son dernier message s'est arrêté.
 * Service role : la fonction n'est exécutable que par lui.
 */
export async function loadFollowsDigest(atTime: string): Promise<FollowsDigestRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("follows_digest", { at_time: atTime });

  if (error) {
    throw error;
  }

  return (data ?? []) as FollowsDigestRow[];
}

/** Au plus autant d'ids par requête : ils passent dans l'adresse (`user_id=in.(…)`). */
const USER_IDS_PER_REQUEST = 100;

/**
 * Parmi [userIds], ceux qui veulent la notification des suivis : notifications activées
 * (`is_enabled`, l'interrupteur général) et `follows_enabled` (« Mes suivis », activé par défaut).
 * Sans préférences en base, pas de message : `sendNotificationToUser` le refuserait aussi.
 */
export async function loadFollowsRecipients(userIds: string[]): Promise<Set<string>> {
  const supabase = createServiceClient();
  const recipients = new Set<string>();

  for (let start = 0; start < userIds.length; start += USER_IDS_PER_REQUEST) {
    const { data, error } = await supabase
      .from("user_notification_preferences")
      .select("user_id, is_enabled, follows_enabled")
      .in("user_id", userIds.slice(start, start + USER_IDS_PER_REQUEST));

    if (error) {
      throw error;
    }

    for (const row of data ?? []) {
      if (row.is_enabled === true && row.follows_enabled !== false) {
        recipients.add(row.user_id);
      }
    }
  }

  return recipients;
}
