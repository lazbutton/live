import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET : Récupérer les notifications d'un organisateur
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    let query = supabase
      .from("organizer_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (unreadOnly) {
      query = query.eq("read", false);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Erreur lors de la récupération des notifications:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ notifications: data || [] });
  } catch (error: any) {
    console.error("Erreur API /api/organizer/notifications:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * PATCH : Marquer une notification comme lue
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const { notificationId, read } = body;

    if (!notificationId) {
      return NextResponse.json(
        { error: "notificationId est requis" },
        { status: 400 }
      );
    }

    // Vérifier que la notification appartient à l'utilisateur
    const { data: notification, error: checkError } = await supabase
      .from("organizer_notifications")
      .select("user_id")
      .eq("id", notificationId)
      .single();

    if (checkError || !notification) {
      return NextResponse.json(
        { error: "Notification non trouvée" },
        { status: 404 }
      );
    }

    if (notification.user_id !== user.id) {
      return NextResponse.json(
        { error: "Accès refusé" },
        { status: 403 }
      );
    }

    const { error: updateError } = await supabase
      .from("organizer_notifications")
      .update({ read: read !== undefined ? read : true })
      .eq("id", notificationId);

    if (updateError) {
      console.error("Erreur lors de la mise à jour:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erreur API /api/organizer/notifications (PATCH):", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}


