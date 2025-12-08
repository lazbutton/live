import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface FacebookEvent {
  id: string;
  name: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  place?: {
    name?: string;
    location?: {
      city?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      street?: string;
      zip?: string;
    };
  };
  cover?: {
    source?: string;
  };
  ticket_uri?: string;
}

interface CreateRequestPayload {
  organizerId: string;
  organizerType?: "organizer" | "location"; // Type de l'organisateur (organizer ou location)
  eventIds: string[]; // IDs des événements Facebook à transformer en demandes
}

export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Erreur d'authentification dans /api/facebook/events/create-requests:", authError);
      return NextResponse.json(
        { 
          error: "Erreur d'authentification",
          details: authError.message,
          hint: "Vérifiez que vous êtes connecté et que les cookies sont envoyés avec la requête."
        },
        { status: 401 }
      );
    }

    if (!user) {
      console.error("Aucun utilisateur trouvé dans la session pour /api/facebook/events/create-requests");
      const cookieHeader = request.headers.get("cookie");
      console.log("Cookies reçus:", cookieHeader ? "Présents" : "Absents");
      return NextResponse.json(
        { 
          error: "Non authentifié. Veuillez vous reconnecter.",
          hint: "Vérifiez que vous êtes connecté et que votre session est toujours active."
        },
        { status: 401 }
      );
    }

    // Vérifier que l'utilisateur est admin
    const userRole = user.user_metadata?.role;
    if (userRole !== "admin") {
      return NextResponse.json(
        { error: "Accès refusé. Administrateur requis." },
        { status: 403 }
      );
    }

    const body: CreateRequestPayload = await request.json();
    const { organizerId, organizerType = "organizer", eventIds } = body;

    if (!organizerId || !eventIds || eventIds.length === 0) {
      return NextResponse.json(
        { error: "ID d'organisateur et liste d'événements requis" },
        { status: 400 }
      );
    }

    // Récupérer l'organisateur (qui peut être un organisateur classique ou un lieu-organisateur)
    let organizer: { id: string; name: string; facebook_page_id: string | null } | null = null;
    
    if (organizerType === "location") {
      // C'est un lieu-organisateur
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, facebook_page_id")
        .eq("id", organizerId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Lieu-organisateur non trouvé" },
          { status: 404 }
        );
      }
      organizer = data;
    } else {
      // C'est un organisateur classique
      const { data, error } = await supabase
        .from("organizers")
        .select("id, name, facebook_page_id")
        .eq("id", organizerId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Organisateur non trouvé" },
          { status: 404 }
        );
      }
      organizer = data;
    }

    if (!organizer) {
      return NextResponse.json(
        { error: "Organisateur non trouvé" },
        { status: 404 }
      );
    }

    if (!organizer.facebook_page_id) {
      return NextResponse.json(
        { error: "Cet organisateur n'a pas d'ID de page Facebook configuré" },
        { status: 400 }
      );
    }

    // Récupérer le token d'accès Facebook
    const facebookAccessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    if (!facebookAccessToken) {
      return NextResponse.json(
        {
          error:
            "Token d'accès Facebook non configuré. Veuillez configurer FACEBOOK_ACCESS_TOKEN dans les variables d'environnement.",
        },
        { status: 500 }
      );
    }

    // Récupérer les détails des événements Facebook
    const fields =
      "id,name,description,start_time,end_time,place{name,location{city,country,latitude,longitude,street,zip}},cover,ticket_uri";
    const eventPromises = eventIds.map(async (eventId) => {
      const url = `https://graph.facebook.com/v21.0/${eventId}?fields=${fields}&access_token=${facebookAccessToken}`;
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || "Erreur inconnue";
        const errorCode = errorData.error?.code;
        
        if (errorMessage.includes("Accounts Center") || errorCode === 190) {
          throw new Error(`Token d'accès invalide pour l'événement ${eventId}. Vous devez utiliser un Page Access Token, pas un User Access Token. Consultez la documentation pour obtenir le bon type de token.`);
        }
        
        throw new Error(`Erreur lors de la récupération de l'événement ${eventId}: ${errorMessage}`);
      }
      return response.json();
    });

    const facebookEvents: FacebookEvent[] = await Promise.all(eventPromises);

    // Transformer les événements Facebook en demandes d'événements
    const requests = facebookEvents.map((fbEvent) => {
      // Construire l'adresse depuis les informations de lieu
      let address = "";
      if (fbEvent.place?.name) {
        address = fbEvent.place.name;
      }
      if (fbEvent.place?.location?.street) {
        address = address
          ? `${fbEvent.place.location.street}, ${address}`
          : fbEvent.place.location.street;
      }
      if (fbEvent.place?.location?.city) {
        address = address
          ? `${address}, ${fbEvent.place.location.city}`
          : fbEvent.place.location.city;
      }
      if (fbEvent.place?.location?.zip) {
        address = `${address} ${fbEvent.place.location.zip}`;
      }

      // Formater les dates
      const startDate = fbEvent.start_time
        ? new Date(fbEvent.start_time).toISOString()
        : undefined;
      const endDate = fbEvent.end_time
        ? new Date(fbEvent.end_time).toISOString()
        : undefined;

      return {
        request_type: "event_creation" as const,
        email: null, // Les demandes d'événements n'ont pas besoin d'email
        name: fbEvent.name || "Événement sans titre",
        requested_by: user.id,
        status: "pending" as const,
        event_data: {
          title: fbEvent.name || "Événement sans titre",
          description: fbEvent.description || "",
          date: startDate,
          end_date: endDate,
          address: address || undefined,
          latitude:
            fbEvent.place?.location?.latitude != null
              ? fbEvent.place.location.latitude
              : undefined,
          longitude:
            fbEvent.place?.location?.longitude != null
              ? fbEvent.place.location.longitude
              : undefined,
          organizer_id: organizerType === "organizer" ? organizerId : undefined,
          location_id: organizerType === "location" ? organizerId : undefined,
          image_url: fbEvent.cover?.source || undefined,
          external_url: fbEvent.ticket_uri || `https://www.facebook.com/events/${fbEvent.id}` || undefined,
          external_url_label: "Voir sur Facebook",
          facebook_event_id: fbEvent.id, // Stocker l'ID de l'événement Facebook pour référence
        },
      };
    });

    // Insérer les demandes dans la base de données
    const { data: insertedRequests, error: insertError } = await supabase
      .from("user_requests")
      .insert(requests)
      .select();

    if (insertError) {
      console.error("Erreur lors de l'insertion des demandes:", insertError);
      return NextResponse.json(
        {
          error: "Erreur lors de la création des demandes",
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: insertedRequests?.length || 0,
      requests: insertedRequests,
    });
  } catch (error) {
    console.error("Erreur lors de la création des demandes:", error);
    return NextResponse.json(
      {
        error: "Erreur interne du serveur",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}

