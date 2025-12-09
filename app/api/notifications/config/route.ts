import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import fs from "fs";
import path from "path";

/**
 * GET /api/notifications/config
 * 
 * Récupère l'état de la configuration des notifications (sans exposer les secrets)
 * Admin uniquement
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifier l'authentification (admin uniquement)
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      );
    }

    // Vérifier que l'utilisateur est admin
    const isAdmin =
      user.user_metadata?.role === "admin" ||
      user.app_metadata?.role === "admin";

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Accès refusé. Admin uniquement." },
        { status: 403 }
      );
    }

    // Vérifier la configuration APNs (iOS)
    const apnsKeyPath = process.env.APNS_KEY_PATH;
    const apnsKeyId = process.env.APNS_KEY_ID;
    const apnsTeamId = process.env.APNS_TEAM_ID;
    const apnsBundleId = process.env.APNS_BUNDLE_ID;

    let apnsStatus = {
      configured: false,
      keyFileExists: false,
      keyId: apnsKeyId ? "✓ Défini" : "✗ Non défini",
      teamId: apnsTeamId ? "✓ Défini" : "✗ Non défini",
      bundleId: apnsBundleId || null,
    };

    if (apnsKeyPath) {
      try {
        const fullPath = path.resolve(apnsKeyPath);
        apnsStatus.keyFileExists = fs.existsSync(fullPath);
      } catch {
        apnsStatus.keyFileExists = false;
      }
    }

    apnsStatus.configured =
      apnsStatus.keyFileExists &&
      !!apnsKeyId &&
      !!apnsTeamId &&
      !!apnsBundleId;

    // Vérifier la configuration FCM (Android)
    const fcmServiceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH;
    const fcmServiceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON;

    let fcmStatus = {
      configured: false,
      filePath: fcmServiceAccountPath || null,
      fileExists: false,
      jsonDefined: !!fcmServiceAccountJson,
    };

    if (fcmServiceAccountPath) {
      try {
        const fullPath = path.resolve(fcmServiceAccountPath);
        fcmStatus.fileExists = fs.existsSync(fullPath);
      } catch {
        fcmStatus.fileExists = false;
      }
    }

    fcmStatus.configured = fcmStatus.fileExists || fcmStatus.jsonDefined;

    // Récupérer les statistiques des tokens (avec service client pour bypass RLS)
    const serviceClient = createServiceClient();
    const { data: tokens, error: tokensError } = await serviceClient
      .from("user_push_tokens")
      .select("platform");

    const tokenStats = {
      ios: 0,
      android: 0,
      web: 0,
      total: 0,
    };

    if (!tokensError && tokens) {
      tokens.forEach((token) => {
        if (token.platform === "ios") tokenStats.ios++;
        else if (token.platform === "android") tokenStats.android++;
        else if (token.platform === "web") tokenStats.web++;
        tokenStats.total++;
      });
    }

    // Récupérer le nombre de logs récents
    const { count: logsCount } = await serviceClient
      .from("notification_logs")
      .select("*", { count: "exact", head: true });

    return NextResponse.json({
      apns: apnsStatus,
      fcm: fcmStatus,
      tokens: tokenStats,
      logsCount: logsCount || 0,
      environment: process.env.NODE_ENV || "development",
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de la récupération de la config:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

