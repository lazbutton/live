import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { claimNotificationDelivery, sendNotificationToUser } from "@/lib/notifications";
import {
  FOLLOWS_DIGEST_FLOW_TYPE,
  followsDigestBody,
  followsDigestData,
  followsDigestDeliveryKey,
  followsDigestTitle,
  planFollowsDigests,
} from "@/lib/notifications/follows-digest";
import { loadFollowsDigest, loadFollowsRecipients } from "@/lib/notifications/follows-digest-events";
import { getIsoLocalDate, getIsoLocalTime, getZonedDateParts } from "@/lib/cron-timezone";

const FOLLOWS_FLOW = {
  route: "/api/cron/notifications/follows-digest",
  path: "cron_follows_digest",
  authMode: "cron_secret",
  sender: "sendNotificationToUser",
  honorsPreferences: true,
  honorsCategories: false,
  latestTokenOnly: true,
  scheduleMode: "vercel_hobby_daily",
  schedulePrecision: "hour",
};
const MAX_ROUTE_DIAGNOSTICS = 25;

/**
 * Vérifie que la requête vient bien de Vercel Cron
 */
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("❌ CRON_SECRET n'est pas défini dans les variables d'environnement");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/notifications/follows-digest
 *
 * La notification des suivis (U8, `lib/notifications/follows-digest.ts`) : à chaque personne dont un
 * lieu, un organisateur ou un artiste suivi a publié, « 3 nouveaux événements chez tes suivis » (ou
 * « chez L’Astrolabe » quand une seule cible a publié). Au plus un message par personne et par jour
 * (`follows_digest:<jour>:<utilisateur>`), avec l'interrupteur général et « Mes suivis »
 * (`follows_enabled`). Le log garde l'instant du calcul (`covered_until`) : le message suivant
 * reprend de là (`follows_digest()`, migration 20261021142000). Toucher : la page du suivi, sinon
 * l'onglet Favoris (données : `docs/API_APP.md`, « Suivis »).
 * Sur Vercel Hobby, l'horaire est piloté par vercel.json avec une précision à l'heure.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const now = new Date();
    const atTime = now.toISOString();
    const nowInParis = getZonedDateParts(now);
    const todayLabel = getIsoLocalDate(nowInParis);

    console.log(`👀 Notification des suivis, ${todayLabel} ${getIsoLocalTime(nowInParis)} (Europe/Paris)`);

    const { data: globalSettings } = await supabase
      .from("notification_settings")
      .select("is_active")
      .maybeSingle();

    if (!globalSettings || !globalSettings.is_active) {
      console.log("ℹ️ Les notifications globales sont désactivées");
      return NextResponse.json({
        success: true,
        message: "Notifications globales désactivées",
        notificationsSent: 0,
        flow: FOLLOWS_FLOW,
      });
    }

    let plans;
    let recipients;
    try {
      plans = planFollowsDigests(await loadFollowsDigest(atTime));
      recipients = await loadFollowsRecipients([...plans.keys()]);
    } catch (loadError: any) {
      console.error("❌ Erreur lors de la lecture des suivis:", loadError);
      return NextResponse.json(
        { success: false, error: loadError?.message || "Impossible de lire les suivis" },
        { status: 500 },
      );
    }

    if (plans.size === 0) {
      console.log("ℹ️ Rien de nouveau chez les suivis");
      return NextResponse.json({
        success: true,
        message: "Rien de nouveau chez les suivis",
        usersWithNews: 0,
        notificationsSent: 0,
        flow: FOLLOWS_FLOW,
      });
    }

    let totalSent = 0;
    let totalFailed = 0;
    let skippedAlreadySent = 0;
    let skippedPreferences = 0;
    const errors: string[] = [];
    const deliveryDiagnostics: Array<Record<string, any>> = [];

    for (const [userId, plan] of plans) {
      if (!recipients.has(userId)) {
        skippedPreferences++;
        continue;
      }

      try {
        const payload = {
          title: followsDigestTitle(plan),
          body: followsDigestBody(plan),
          data: followsDigestData({ date: todayLabel, plan }),
        };
        const deliveryKey = followsDigestDeliveryKey(todayLabel, userId);
        const claim = await claimNotificationDelivery({
          userId,
          payload,
          deliveryDate: todayLabel,
          deliveryKey,
          flowType: FOLLOWS_DIGEST_FLOW_TYPE,
          coveredUntil: atTime,
        });

        if (!claim.claimed || !claim.logId) {
          skippedAlreadySent++;
          if (deliveryDiagnostics.length < MAX_ROUTE_DIAGNOSTICS) {
            deliveryDiagnostics.push({
              userId,
              status: "skipped",
              reason:
                claim.reason === "in_progress"
                  ? "Notification déjà réservée par une autre exécution en cours"
                  : "Notification des suivis déjà envoyée aujourd'hui",
              eventsCount: plan.events.length,
              followsCount: plan.targets.length,
              deliveryKey,
            });
          }
          continue;
        }

        const result = await sendNotificationToUser(userId, payload, {
          notificationLogId: claim.logId,
        });

        if (result.success && result.sent > 0) {
          totalSent++;
        } else {
          totalFailed++;
          if (result.errors.length > 0) {
            errors.push(`Utilisateur ${userId}: ${result.errors[0]}`);
          }
        }

        if (deliveryDiagnostics.length < MAX_ROUTE_DIAGNOSTICS) {
          deliveryDiagnostics.push({
            userId,
            status: result.success && result.sent > 0 ? "sent" : "failed",
            eventsCount: plan.events.length,
            followsCount: plan.targets.length,
            deliveryKey,
            reclaimedStaleClaim: claim.reclaimedStale ?? false,
            diagnostics: result.diagnostics,
          });
        }
      } catch (error: any) {
        console.error(`❌ Erreur lors de l'envoi à l'utilisateur ${userId}:`, error);
        totalFailed++;
        errors.push(`Utilisateur ${userId}: ${error.message}`);
        if (deliveryDiagnostics.length < MAX_ROUTE_DIAGNOSTICS) {
          deliveryDiagnostics.push({ userId, status: "failed", reason: error.message || "Erreur inconnue" });
        }
      }
    }

    console.log(
      `✅ Suivis : ${totalSent} envoyé(s), ${totalFailed} échec(s), ${skippedAlreadySent} déjà envoyé(s), ${skippedPreferences} coupé(s) dans les réglages`,
    );

    return NextResponse.json({
      success: totalFailed === 0,
      message: `Notification des suivis pour ${plans.size} personne(s)`,
      usersWithNews: plans.size,
      notificationsSent: totalSent,
      notificationsFailed: totalFailed,
      notificationsSkipped: skippedAlreadySent,
      skippedPreferences,
      errors: errors.length > 0 ? errors : undefined,
      flow: FOLLOWS_FLOW,
      debug: { deliveryDiagnostics },
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de l'exécution du cron des suivis:", error);
    return NextResponse.json({ success: false, error: error.message || "Erreur inconnue" }, { status: 500 });
  }
}
