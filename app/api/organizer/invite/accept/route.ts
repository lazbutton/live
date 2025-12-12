import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// POST : Accepter une invitation
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Token manquant" },
        { status: 400 }
      );
    }

    // Vérifier que l'utilisateur est connecté
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Vous devez être connecté" },
        { status: 401 }
      );
    }

    // Vérifier l'invitation
    const { data: invitation, error: inviteError } = await supabase
      .from("organizer_invitations")
      .select("id, organizer_id, role, email, accepted_at, expires_at")
      .eq("token", token)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: "Invitation non trouvée" },
        { status: 404 }
      );
    }

    // Vérifier l'expiration
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Cette invitation a expiré" },
        { status: 410 }
      );
    }

    // Vérifier si déjà acceptée
    if (invitation.accepted_at) {
      return NextResponse.json(
        { error: "Cette invitation a déjà été acceptée" },
        { status: 410 }
      );
    }

    // Vérifier que l'email correspond
    const userEmail = user.email?.toLowerCase().trim();
    const invitationEmail = invitation.email.toLowerCase().trim();
    
    if (userEmail !== invitationEmail) {
      console.error("Email mismatch:", {
        userEmail,
        invitationEmail,
        user: user.email,
        invitation: invitation.email,
      });
      return NextResponse.json(
        { 
          error: "Cette invitation n'est pas pour votre adresse email",
          details: `L'invitation est pour ${invitation.email} mais vous êtes connecté avec ${user.email}. Veuillez vous déconnecter et vous connecter avec le bon compte.`
        },
        { status: 403 }
      );
    }

    // Accepter l'invitation via la fonction SQL
    const { data: result, error: acceptError } = await supabase.rpc(
      "accept_organizer_invitation",
      {
        invitation_token: token,
        user_id_param: user.id,
      }
    );

    if (acceptError) {
      console.error("Erreur lors de l'acceptation:", acceptError);
      return NextResponse.json(
        { error: "Erreur lors de l'acceptation de l'invitation" },
        { status: 500 }
      );
    }

    if (result?.success === false) {
      return NextResponse.json(
        { error: result.error || "Erreur lors de l'acceptation" },
        { status: 400 }
      );
    }

    // Enregistrer dans l'audit log
    if (result?.organizer_id) {
      const supabaseAdmin = createServiceClient();
      await supabaseAdmin
        .from("organizer_audit_log")
        .insert({
          organizer_id: result.organizer_id,
          action: "invitation_accepted",
          performed_by: user.id,
          target_user_id: user.id,
          target_user_email: user.email || invitation.email,
          new_value: result.role || invitation.role,
          metadata: { invitation_id: invitation.id },
        });
    }

    return NextResponse.json({
      success: true,
      organizer_id: result?.organizer_id,
      role: result?.role,
    });
  } catch (error: any) {
    console.error("Erreur API:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

