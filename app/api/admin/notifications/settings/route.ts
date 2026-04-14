import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/admin/notifications/settings
 * 
 * Récupère les paramètres globaux de notifications
 * Admin uniquement
 */
export async function GET() {
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

    // Récupérer les paramètres (il ne devrait y en avoir qu'un seul)
    const serviceClient = createServiceClient();
    const { data: settings, error: settingsError } = await serviceClient
      .from("notification_settings")
      .select("*")
      .maybeSingle(); // maybeSingle retourne null si aucun résultat

    if (settingsError) {
      console.error("❌ Erreur lors de la récupération des paramètres:", settingsError);
      return NextResponse.json(
        { error: "Erreur lors de la récupération des paramètres", details: settingsError.message },
        { status: 500 }
      );
    }

    // Si aucun paramètre n'existe, retourner des valeurs par défaut
    if (!settings) {
      return NextResponse.json({
        id: null,
        notification_time: "09:00:00",
        is_active: true,
        is_password_auth_enabled: true,
        in_app_popup_enabled: false,
        in_app_popup_title: null,
        in_app_popup_message: null,
        in_app_popup_image_url: null,
        in_app_popup_cta_label: null,
        in_app_popup_cta_url: null,
        in_app_popup_badge: null,
        in_app_popup_theme: "default",
        created_at: null,
        updated_at: null,
        updated_by: null,
      });
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("❌ Erreur lors de la récupération des paramètres:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/notifications/settings
 * 
 * Met à jour les paramètres globaux de notifications
 * Admin uniquement
 * 
 * Body:
 * {
 *   notification_time?: string - Heure au format HH:MM (ex: "09:00")
 *   is_active?: boolean - Activation globale des notifications
  *   is_password_auth_enabled?: boolean - Afficher la connexion email / mot de passe dans l'app
 * }
 */
export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const {
      notification_time,
      is_active,
      is_password_auth_enabled,
      in_app_popup_enabled,
      in_app_popup_title,
      in_app_popup_message,
      in_app_popup_image_url,
      in_app_popup_cta_label,
      in_app_popup_cta_url,
      in_app_popup_badge,
      in_app_popup_theme,
    } = body;

    // Validation
    if (notification_time !== undefined) {
      // Valider le format HH:MM
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(notification_time)) {
        return NextResponse.json(
          { error: "Format d'heure invalide. Utilisez HH:MM (ex: 09:00)" },
          { status: 400 }
        );
      }
      // Convertir en format TIME PostgreSQL (HH:MM:SS)
      const [hours, minutes] = notification_time.split(":");
      body.notification_time = `${hours}:${minutes}:00`;
    }

    if (is_active !== undefined && typeof is_active !== "boolean") {
      return NextResponse.json(
        { error: "is_active doit être un booléen" },
        { status: 400 }
      );
    }

    if (
      is_password_auth_enabled !== undefined &&
      typeof is_password_auth_enabled !== "boolean"
    ) {
      return NextResponse.json(
        { error: "is_password_auth_enabled doit être un booléen" },
        { status: 400 }
      );
    }

    if (
      in_app_popup_enabled !== undefined &&
      typeof in_app_popup_enabled !== "boolean"
    ) {
      return NextResponse.json(
        { error: "in_app_popup_enabled doit être un booléen" },
        { status: 400 }
      );
    }

    const normalizeNullableText = (value: unknown): string | null | undefined => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const text = String(value).trim();
      return text.length > 0 ? text : null;
    };

    const normalizedPopupTitle = normalizeNullableText(in_app_popup_title);
    const normalizedPopupMessage = normalizeNullableText(in_app_popup_message);
    const normalizedPopupImageUrl = normalizeNullableText(in_app_popup_image_url);
    const normalizedPopupCtaLabel = normalizeNullableText(in_app_popup_cta_label);
    const normalizedPopupCtaUrl = normalizeNullableText(in_app_popup_cta_url);
    const normalizedPopupBadge = normalizeNullableText(in_app_popup_badge);

    const allowedThemes = new Set(["default", "highlight", "update", "warning"]);
    if (
      in_app_popup_theme !== undefined &&
      (typeof in_app_popup_theme !== "string" || !allowedThemes.has(in_app_popup_theme))
    ) {
      return NextResponse.json(
        {
          error:
            "in_app_popup_theme doit être l'une des valeurs suivantes: default, highlight, update, warning",
        },
        { status: 400 }
      );
    }

    if (in_app_popup_enabled === true) {
      if (!normalizedPopupTitle) {
        return NextResponse.json(
          { error: "Le titre de la popup est requis lorsqu'elle est activée" },
          { status: 400 }
        );
      }
      if (!normalizedPopupMessage) {
        return NextResponse.json(
          { error: "Le message de la popup est requis lorsqu'elle est activée" },
          { status: 400 }
        );
      }
    }

    if (normalizedPopupCtaUrl && !normalizedPopupCtaLabel) {
      return NextResponse.json(
        { error: "Le libellé du bouton est requis si une URL CTA est définie" },
        { status: 400 }
      );
    }

    // Mettre à jour les paramètres
    const serviceClient = createServiceClient();
    
    // Récupérer les paramètres existants pour vérifier s'ils existent
    const { data: existingSettings } = await serviceClient
      .from("notification_settings")
      .select("id")
      .maybeSingle();

    let result;
    if (existingSettings) {
      // Mettre à jour les paramètres existants
      result = await serviceClient
        .from("notification_settings")
        .update({
          notification_time: body.notification_time,
          is_active: is_active !== undefined ? is_active : undefined,
          is_password_auth_enabled:
            is_password_auth_enabled !== undefined
              ? is_password_auth_enabled
              : undefined,
          in_app_popup_enabled:
            in_app_popup_enabled !== undefined
              ? in_app_popup_enabled
              : undefined,
          in_app_popup_title: normalizedPopupTitle,
          in_app_popup_message: normalizedPopupMessage,
          in_app_popup_image_url: normalizedPopupImageUrl,
          in_app_popup_cta_label: normalizedPopupCtaLabel,
          in_app_popup_cta_url: normalizedPopupCtaUrl,
          in_app_popup_badge: normalizedPopupBadge,
          in_app_popup_theme: in_app_popup_theme ?? undefined,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSettings.id)
        .select()
        .single();
    } else {
      // Créer les paramètres s'ils n'existent pas
      result = await serviceClient
        .from("notification_settings")
        .insert({
          notification_time: body.notification_time || "09:00:00",
          is_active: is_active !== undefined ? is_active : true,
          is_password_auth_enabled:
            is_password_auth_enabled !== undefined
              ? is_password_auth_enabled
              : true,
          in_app_popup_enabled:
            in_app_popup_enabled !== undefined
              ? in_app_popup_enabled
              : false,
          in_app_popup_title: normalizedPopupTitle,
          in_app_popup_message: normalizedPopupMessage,
          in_app_popup_image_url: normalizedPopupImageUrl,
          in_app_popup_cta_label: normalizedPopupCtaLabel,
          in_app_popup_cta_url: normalizedPopupCtaUrl,
          in_app_popup_badge: normalizedPopupBadge,
          in_app_popup_theme: in_app_popup_theme ?? "default",
          updated_by: user.id,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error("❌ Erreur lors de la mise à jour des paramètres:", result.error);
      return NextResponse.json(
        { error: "Erreur lors de la mise à jour des paramètres", details: result.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      settings: result.data,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de la mise à jour des paramètres:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}





