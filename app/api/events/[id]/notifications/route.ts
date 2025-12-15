import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/events/[id]/notifications
 * 
 * Récupère la notification d'événement de l'utilisateur connecté pour cet événement
 * Authentification requise
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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

    // Récupérer la notification de l'utilisateur pour cet événement
    const { data: notification, error: notifError } = await supabase
      .from("event_notifications")
      .select("*")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (notifError) {
      console.error("❌ Erreur lors de la récupération de la notification:", notifError);
      return NextResponse.json(
        { error: "Erreur lors de la récupération", details: notifError.message },
        { status: 500 }
      );
    }

    // Si aucune notification, retourner null
    if (!notification) {
      return NextResponse.json({ notification: null });
    }

    return NextResponse.json({ notification });
  } catch (error: any) {
    console.error("❌ Erreur lors de la récupération:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/events/[id]/notifications
 * 
 * Crée ou met à jour une notification d'événement pour l'utilisateur connecté
 * Authentification requise
 * 
 * Body:
 * {
 *   reminder_timing?: "1_day" | "3_hours" | "1_hour" - Timing du rappel
 *   is_enabled?: boolean - Activation/désactivation (par défaut: true)
 * }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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

    const body = await request.json();
    const { reminder_timing, is_enabled = true } = body;

    // Valider reminder_timing si fourni
    if (reminder_timing !== undefined) {
      const validTimings = ["1_day", "3_hours", "1_hour"];
      if (!validTimings.includes(reminder_timing)) {
        return NextResponse.json(
          { error: `reminder_timing doit être l'un des suivants: ${validTimings.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // Récupérer les informations de l'événement pour calculer notification_scheduled_at
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, date")
      .eq("id", id)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Événement non trouvé" },
        { status: 404 }
      );
    }

    // Calculer notification_scheduled_at en fonction du reminder_timing
    let notification_scheduled_at: string | null = null;
    if (reminder_timing && event.date) {
      const eventDate = new Date(event.date);
      const now = new Date();

      switch (reminder_timing) {
        case "1_day":
          // 1 jour avant l'événement (24 heures avant)
          notification_scheduled_at = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
          // Vérifier que c'est dans le futur
          if (new Date(notification_scheduled_at) <= now) {
            return NextResponse.json(
              { error: "L'événement a lieu dans moins de 24 heures. Le rappel '1 jour avant' n'est plus disponible." },
              { status: 400 }
            );
          }
          break;
        case "3_hours":
          // 3 heures avant l'événement
          notification_scheduled_at = new Date(eventDate.getTime() - 3 * 60 * 60 * 1000).toISOString();
          // Vérifier que c'est dans le futur
          if (new Date(notification_scheduled_at) <= now) {
            return NextResponse.json(
              { error: "L'événement a lieu dans moins de 3 heures. Le rappel '3 heures avant' n'est plus disponible." },
              { status: 400 }
            );
          }
          break;
        case "1_hour":
          // 1 heure avant l'événement
          notification_scheduled_at = new Date(eventDate.getTime() - 60 * 60 * 1000).toISOString();
          // Vérifier que c'est dans le futur
          if (new Date(notification_scheduled_at) <= now) {
            return NextResponse.json(
              { error: "L'événement a lieu dans moins d'1 heure. Le rappel '1 heure avant' n'est plus disponible." },
              { status: 400 }
            );
          }
          break;
      }
    }

    // Vérifier si une notification existe déjà
    const { data: existing } = await supabase
      .from("event_notifications")
      .select("id")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    let result;
    if (existing) {
      // Mettre à jour la notification existante
      const updateData: any = {};
      if (reminder_timing !== undefined) {
        updateData.reminder_timing = reminder_timing;
        updateData.notification_scheduled_at = notification_scheduled_at;
      }
      if (is_enabled !== undefined) {
        updateData.is_enabled = is_enabled;
      }

      result = await supabase
        .from("event_notifications")
        .update(updateData)
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      // Créer une nouvelle notification
      result = await supabase
        .from("event_notifications")
        .insert({
          event_id: id,
          user_id: user.id,
          reminder_timing: reminder_timing || null,
          notification_scheduled_at,
          is_enabled,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error("❌ Erreur lors de la sauvegarde:", result.error);
      return NextResponse.json(
        { error: "Erreur lors de la sauvegarde", details: result.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      notification: result.data,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de la sauvegarde:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/events/[id]/notifications
 * 
 * Supprime la notification d'événement de l'utilisateur connecté
 * Authentification requise
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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

    // Supprimer la notification
    const { error: deleteError } = await supabase
      .from("event_notifications")
      .delete()
      .eq("event_id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("❌ Erreur lors de la suppression:", deleteError);
      return NextResponse.json(
        { error: "Erreur lors de la suppression", details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Erreur lors de la suppression:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

