import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    
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

    // Utiliser le service role key pour récupérer la liste des utilisateurs depuis auth.users
    const supabaseAdmin = createServiceClient();
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      console.error("Erreur lors de la récupération des utilisateurs:", error);
      return NextResponse.json({ 
        users: [],
        error: "Impossible de récupérer la liste des utilisateurs" 
      });
    }

    // Transformer les données pour retourner uniquement les informations nécessaires
    const usersList = (users || []).map((u) => ({
      id: u.id,
      email: u.email || "",
      role: u.user_metadata?.role || null,
      first_name: u.user_metadata?.first_name || u.user_metadata?.firstName || null,
      last_name: u.user_metadata?.last_name || u.user_metadata?.lastName || null,
      full_name: u.user_metadata?.full_name || u.user_metadata?.fullName || null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at || null,
    }));

    return NextResponse.json({ users: usersList });
  } catch (error: any) {
    console.error("Erreur API:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

