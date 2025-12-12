import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isOwnerOfOrganizer } from "@/lib/auth-helpers";

// GET : Récupérer l'historique des actions pour un organisateur
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = user.user_metadata?.role;
    const isAdmin = role === "admin";

    // Vérifier que l'utilisateur est admin ou propriétaire (owner) de l'organisateur
    if (!isAdmin) {
      const isOwner = await isOwnerOfOrganizer(id, supabase);
      if (!isOwner) {
        return NextResponse.json({ error: "Accès refusé : vous devez être propriétaire de cet organisateur" }, { status: 403 });
      }
    }

    // Récupérer l'historique avec les détails des utilisateurs
    const supabaseAdmin = createServiceClient();

    const { data: auditLogs, error } = await supabaseAdmin
      .from("organizer_audit_log")
      .select(`
        id,
        action,
        performed_by,
        target_user_id,
        target_user_email,
        old_value,
        new_value,
        metadata,
        created_at
      `)
      .eq("organizer_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Erreur lors de la récupération de l'historique:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Récupérer les emails des utilisateurs
    const userIds = new Set<string>();
    auditLogs?.forEach((log: any) => {
      if (log.performed_by) userIds.add(log.performed_by);
      if (log.target_user_id) userIds.add(log.target_user_id);
    });

    const emailMap = new Map<string, string>();
    if (userIds.size > 0) {
      try {
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
        usersData?.users.forEach((u) => {
          if (u.email) emailMap.set(u.id, u.email);
        });
      } catch (error) {
        console.error("Erreur lors de la récupération des emails:", error);
      }
    }

    // Formater les résultats pour inclure les emails
    const formattedLogs = auditLogs?.map((log: any) => ({
      id: log.id,
      action: log.action,
      performed_by: log.performed_by,
      performer_email: emailMap.get(log.performed_by) || null,
      target_user_id: log.target_user_id,
      target_email: log.target_user_id ? (emailMap.get(log.target_user_id) || log.target_user_email || null) : log.target_user_email || null,
      old_value: log.old_value,
      new_value: log.new_value,
      metadata: log.metadata,
      created_at: log.created_at,
    })) || [];

    return NextResponse.json({ logs: formattedLogs });
  } catch (error: any) {
    console.error("Erreur API /api/admin/organizers/[id]/audit:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

// POST : Enregistrer une action dans l'historique (utilisé par les autres API routes)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabaseAdmin = createServiceClient();
    const body = await request.json();

    const {
      action,
      performed_by,
      target_user_id,
      target_user_email,
      old_value,
      new_value,
      metadata,
    } = body;

    if (!action || !performed_by) {
      return NextResponse.json(
        { error: "action et performed_by sont requis" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("organizer_audit_log")
      .insert({
        organizer_id: id,
        action,
        performed_by,
        target_user_id: target_user_id || null,
        target_user_email: target_user_email || null,
        old_value: old_value || null,
        new_value: new_value || null,
        metadata: metadata || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Erreur lors de l'enregistrement de l'audit:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, log: data });
  } catch (error: any) {
    console.error("Erreur API POST /api/admin/organizers/[id]/audit:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

