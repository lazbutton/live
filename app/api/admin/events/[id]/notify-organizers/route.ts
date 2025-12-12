import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * POST : Créer des notifications pour les organisateurs d'un événement
 * Utilisé lors de l'approbation/rejet d'événements
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const supabase = await createClient();
    const supabaseAdmin = createServiceClient();

    // Vérifier que l'utilisateur est admin
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = user.user_metadata?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await request.json();
    const { type, title, message, metadata } = body;

    if (!type || !title || !message) {
      return NextResponse.json(
        { error: "type, title et message sont requis" },
        { status: 400 }
      );
    }

    // Récupérer l'événement pour obtenir son titre
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select("title, status")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Événement non trouvé" },
        { status: 404 }
      );
    }

    // Récupérer tous les utilisateurs associés aux organisateurs de l'événement
    const { data: eventOrganizers, error: orgError } = await supabaseAdmin
      .from("event_organizers")
      .select("organizer_id, location_id")
      .eq("event_id", eventId);

    if (orgError) {
      return NextResponse.json(
        { error: "Erreur lors de la récupération des organisateurs" },
        { status: 500 }
      );
    }

    if (!eventOrganizers || eventOrganizers.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Aucun organisateur associé à cet événement",
        notificationsCreated: 0,
      });
    }

    // Récupérer les IDs de tous les organisateurs (classiques et lieux-organisateurs)
    const organizerIds = eventOrganizers
      .map((eo) => eo.organizer_id || eo.location_id)
      .filter(Boolean) as string[];

    if (organizerIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Aucun organisateur trouvé",
        notificationsCreated: 0,
      });
    }

    // Récupérer tous les user_id associés à ces organisateurs
    const { data: userOrganizers, error: userOrgError } = await supabaseAdmin
      .from("user_organizers")
      .select("user_id")
      .in("organizer_id", organizerIds);

    if (userOrgError) {
      return NextResponse.json(
        { error: "Erreur lors de la récupération des utilisateurs organisateurs" },
        { status: 500 }
      );
    }

    if (!userOrganizers || userOrganizers.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Aucun utilisateur organisateur trouvé",
        notificationsCreated: 0,
      });
    }

    // Créer les notifications pour chaque utilisateur
    const userIds = [...new Set(userOrganizers.map((uo) => uo.user_id))];
    const notifications = userIds.map((userId) => ({
      user_id: userId,
      event_id: eventId,
      type,
      title,
      message,
      read: false,
      metadata: metadata || null,
    }));

    const { data: insertedNotifications, error: insertError } = await supabaseAdmin
      .from("organizer_notifications")
      .insert(notifications)
      .select();

    if (insertError) {
      console.error("Erreur lors de la création des notifications:", insertError);
      return NextResponse.json(
        { error: "Erreur lors de la création des notifications" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      notificationsCreated: insertedNotifications?.length || 0,
    });
  } catch (error: any) {
    console.error("Erreur API /api/admin/events/[id]/notify-organizers:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

