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

export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Erreur d'authentification dans /api/facebook/events:", authError);
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
      console.error("Aucun utilisateur trouvé dans la session pour /api/facebook/events");
      // Vérifier les cookies reçus
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

    console.log("Utilisateur authentifié:", user.email, "Rôle:", user.user_metadata?.role);

    // Vérifier que l'utilisateur est admin
    const userRole = user.user_metadata?.role;
    if (userRole !== "admin") {
      return NextResponse.json(
        { error: "Accès refusé. Administrateur requis." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { facebookPageId } = body;

    if (!facebookPageId) {
      return NextResponse.json(
        { error: "ID de page Facebook requis" },
        { status: 400 }
      );
    }

    // Récupérer le token d'accès Facebook depuis les variables d'environnement
    const facebookAccessToken = process.env.FACEBOOK_ACCESS_TOKEN?.trim();

    if (!facebookAccessToken) {
      return NextResponse.json(
        {
          error:
            "Token d'accès Facebook non configuré. Veuillez configurer FACEBOOK_ACCESS_TOKEN dans les variables d'environnement.",
        },
        { status: 500 }
      );
    }

    // Diagnostic : Vérifier les permissions du token (pour déboguer)
    try {
      const debugResponse = await fetch(
        `https://graph.facebook.com/v21.0/me/permissions?access_token=${facebookAccessToken}`
      );
      if (debugResponse.ok) {
        const debugData = await debugResponse.json();
        console.log("Permissions du token:", JSON.stringify(debugData, null, 2));
        
        // Vérifier si les permissions nécessaires sont présentes
        const permissions = debugData.data || [];
        const hasPagesReadEngagement = permissions.some(
          (p: any) => p.permission === "pages_read_engagement" && p.status === "granted"
        );
        const hasPagesReadUserContent = permissions.some(
          (p: any) => p.permission === "pages_read_user_content" && p.status === "granted"
        );
        
        console.log("Permission pages_read_engagement:", hasPagesReadEngagement ? "✅ Accordée" : "❌ Manquante ou non accordée");
        console.log("Permission pages_read_user_content:", hasPagesReadUserContent ? "✅ Accordée" : "❌ Manquante ou non accordée");
        
        if (!hasPagesReadEngagement || !hasPagesReadUserContent) {
          console.warn("⚠️ Token avec permissions incomplètes - cela peut causer l'erreur code 10");
        }
      }
    } catch (debugError) {
      console.warn("Impossible de vérifier les permissions du token:", debugError);
    }

    // Récupérer les événements depuis l'API Facebook Graph
    // Documentation: https://developers.facebook.com/docs/graph-api/reference/page/events
    // 
    // Cette requête fonctionne pour :
    // 1. Les pages que vous administrez (Page Access Token de la page)
    // 2. Les pages publiques qui ne vous appartiennent pas (si le token a 'pages_read_user_content')
    // 
    // Pour les pages publiques, le token doit avoir la permission 'pages_read_user_content'
    // en plus de 'pages_read_engagement' et 'pages_show_list'
    // 
    // Voir docs/FACEBOOK_PUBLIC_PAGES.md pour plus de détails
    const fields =
      "id,name,description,start_time,end_time,place{name,location{city,country,latitude,longitude,street,zip}},cover,ticket_uri";
    const url = `https://graph.facebook.com/v21.0/${facebookPageId}/events?fields=${fields}&access_token=${facebookAccessToken}&limit=100`;

    console.log(`Tentative de récupération des événements pour la page Facebook: ${facebookPageId}`);
    console.log(`Token présent: ${facebookAccessToken ? "Oui (" + facebookAccessToken.substring(0, 20) + "...)" : "Non"}`);
    
    const response = await fetch(url);
    const responseText = await response.text();
    console.log(`Réponse Facebook - Status: ${response.status}, Body: ${responseText.substring(0, 500)}`);

    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        console.error("Erreur lors du parsing de la réponse Facebook:", e);
        errorData = { error: { message: responseText || "Erreur inconnue" } };
      }
      
      const errorMessage = errorData.error?.message || "Erreur inconnue";
      const errorCode = errorData.error?.code;
      const errorType = errorData.error?.type;
      const errorSubcode = errorData.error?.error_subcode;
      
      console.error("Erreur Facebook détaillée:", {
        errorMessage,
        errorCode,
        errorType,
        errorSubcode,
        fullError: errorData.error
      });
      
      // Messages d'erreur plus explicites
      let userFriendlyMessage = "Erreur lors de la récupération des événements Facebook";
      let troubleshooting = "";
      
      if (errorMessage.includes("Accounts Center") || errorCode === 190) {
        userFriendlyMessage = "Token d'accès invalide. Vous devez utiliser un Page Access Token, pas un User Access Token.";
        troubleshooting = "Consultez docs/FACEBOOK_SETUP.md pour obtenir le bon type de token.";
      } else if (errorCode === 200 || (errorType === "OAuthException" && errorCode !== 10)) {
        // Code 200 peut avoir plusieurs significations selon le subcode
        if (errorSubcode === 463 || errorMessage.includes("expired") || errorMessage.includes("expiré")) {
          userFriendlyMessage = "Le token d'accès a expiré.";
          troubleshooting = 
            "Le token dans .env.local a expiré. Actions à faire:\n\n" +
            "1. Générez un nouveau token (voir ci-dessous)\n" +
            "2. Mettez à jour FACEBOOK_ACCESS_TOKEN dans .env.local\n" +
            "3. ⚠️ IMPORTANT : Redémarrez le serveur (arrêtez npm run dev et relancez)\n\n" +
            "Pour générer un nouveau token:\n" +
            "- Consultez docs/FACEBOOK_SETUP.md pour obtenir un Page Access Token\n" +
            "ou\n" +
            "- Consultez docs/FACEBOOK_SYSTEM_USER_SETUP.md pour un System User Token (ne expire pas)";
        } else if (errorSubcode === 467 || errorMessage.includes("invalid") || errorMessage.includes("invalide")) {
          userFriendlyMessage = "Le token d'accès n'est pas valide.";
          troubleshooting = 
            "Le token dans .env.local n'est pas valide. Vérifications:\n\n" +
            "1. ✅ Le token est bien copié en entier (sans espaces avant/après)\n" +
            "2. ✅ Pas de guillemets ou caractères invisibles autour du token\n" +
            "3. ✅ Le token est un Page Access Token ou System User Token (pas un User Access Token)\n" +
            "4. ✅ Le serveur a été redémarré après modification de .env.local\n\n" +
            "Format attendu dans .env.local:\n" +
            "FACEBOOK_ACCESS_TOKEN=votre_token_ici_sans_guillemets\n\n" +
            "Pour générer un nouveau token:\n" +
            "- Consultez docs/FACEBOOK_SETUP.md";
        } else {
          userFriendlyMessage = "Erreur d'authentification avec le token.";
          troubleshooting = 
            `Erreur détaillée: ${errorMessage}\n` +
            `Code: ${errorCode}, Type: ${errorType}, Subcode: ${errorSubcode || "N/A"}\n\n` +
            "Vérifications:\n" +
            "1. Le token dans .env.local est correct\n" +
            "2. Le serveur a été redémarré après modification de .env.local\n" +
            "3. Le token a les bonnes permissions (pages_read_engagement, pages_read_user_content pour pages publiques)\n" +
            "4. Le token est un Page Access Token ou System User Token\n\n" +
            "Consultez docs/FACEBOOK_SETUP.md pour générer un nouveau token si nécessaire.";
        }
      } else if (errorCode === 10 || errorMessage.includes("pages_read_engagement") || errorMessage.includes("Page Public Content Access") || errorMessage.includes("Page Public Metadata Access")) {
        // Vérifier si c'est une page qui n'est pas dans l'app
        const isPublicPageIssue = errorMessage.includes("Page Public Content Access") || errorMessage.includes("Page Public Metadata Access");
        
        if (isPublicPageIssue) {
          userFriendlyMessage = "Feature requise : L'application Facebook doit activer 'Page Public Content Access' ou 'Page Public Metadata Access'.";
          troubleshooting = 
            "🔴 PROBLÈME : Pour accéder aux pages publiques, votre APPLICATION FACEBOOK doit activer une FEATURE.\n\n" +
            "⚠️ IMPORTANT : Ce n'est pas juste une permission sur le token, c'est une FEATURE à activer dans l'app !\n\n" +
            "✅ SOLUTION : Activer la Feature dans votre application Facebook\n\n" +
            "📌 ÉTAPE 1 : Trouver et activer 'Page Public Metadata Access'\n\n" +
            "📍 OÙ TROUVER LA FEATURE (2025) :\n\n" +
            "1. Allez sur https://developers.facebook.com/apps\n" +
            "2. Sélectionnez votre application Facebook\n" +
            "3. Dans le menu de gauche, cliquez sur :\n" +
            "   → \"Révision de l'app\" ou \"App Review\"\n" +
            "   (C'est ici que se trouvent les features, PAS dans une section séparée)\n\n" +
            "4. Dans la page App Review, vous devriez voir une liste de features/permissions\n" +
            "   Cherchez \"Page Public Metadata Access\" dans cette liste\n" +
            "   Ou utilisez la barre de recherche de la page si disponible\n\n" +
            "5. Si vous ne voyez pas la feature :\n" +
            "   → Vérifiez que votre app est en mode \"Développement\" ou \"Live\"\n" +
            "   → Essayez de chercher directement via la documentation :\n" +
            "     https://developers.facebook.com/docs/apps/review/feature#page-public-metadata-access\n" +
            "   → Ou essayez \"Page Public Content Access\" comme alternative\n\n" +
            "6. Cliquez sur \"Demander l'accès\" ou \"Request Access\" à côté de la feature\n\n" +
            "📌 ÉTAPE 2 : Remplir le formulaire de demande\n\n" +
            "⚠️ Cette feature nécessite une REVIEW de Facebook :\n\n" +
            "1. Remplissez le formulaire qui s'affiche :\n" +
            "   - **Justification** : Expliquez que vous affichez les événements publics de pages Facebook\n" +
            "   - **Captures d'écran** : Montrez votre interface admin et comment vous utilisez les données\n" +
            "   - **Démonstration** : Fournissez une vidéo ou instructions pour tester\n" +
            "   - **Données demandées** : Sélectionnez les champs (événements, métadonnées de page, etc.)\n\n" +
            "2. Soumettez la demande\n" +
            "3. Attendez l'approbation (peut prendre plusieurs jours/semaines)\n\n" +
            "📌 ÉTAPE 3 : Utiliser la Feature\n\n" +
            "Une fois la feature activée (et approuvée si review nécessaire) :\n" +
            "1. Votre System User Token avec les permissions peut maintenant accéder aux pages publiques\n" +
            "2. Les permissions nécessaires sur le token :\n" +
            "   ✓ pages_read_engagement\n" +
            "   ✓ pages_read_user_content (si disponible)\n" +
            "   ✓ pages_show_list\n\n" +
            "📌 DIFFÉRENCE ENTRE LES DEUX FEATURES :\n\n" +
            "- \"Page Public Metadata Access\" : Accès aux métadonnées publiques des pages (recommandé 2025)\n" +
            "- \"Page Public Content Access\" : Accès au contenu public des pages (plus large, peut nécessiter plus de justification)\n\n" +
            "💡 CONSEIL : Commencez par \"Page Public Metadata Access\" car elle est généralement plus facile à obtenir.\n\n" +
            "📚 Consultez :\n" +
            "- https://developers.facebook.com/docs/apps/review/feature#page-public-metadata-access\n" +
            "- https://developers.facebook.com/docs/apps/review/feature#reference-PAGES_ACCESS\n" +
            "- docs/FACEBOOK_SYSTEM_USER_SETUP.md pour plus de détails\n\n" +
            "💡 ASTUCE : Les logs serveur affichent les permissions détectées sur votre token.";
        } else {
          userFriendlyMessage = "Permissions insuffisantes : le token n'a pas la permission 'pages_read_engagement'.";
          troubleshooting = 
            "⚠️ ERREUR CODE 10 : Le token utilisé n'a PAS la permission 'pages_read_engagement'.\n\n" +
            "🔍 DIAGNOSTIC :\n" +
            "Cette erreur se produit généralement si:\n" +
            "1. ❌ Vous utilisez un USER Access Token au lieu d'un PAGE Access Token\n" +
            "2. ❌ Le Page Access Token n'a pas hérité des bonnes permissions\n" +
            "3. ❌ Les permissions n'ont pas été acceptées lors de la génération du token\n\n" +
            "✅ SOLUTION : Obtenir un Page Access Token avec les bonnes permissions\n\n" +
            "📌 ÉTAPE 1 : Obtenir un User Access Token avec les permissions\n" +
            "1. Allez sur https://developers.facebook.com/tools/explorer/\n" +
            "2. Sélectionnez votre application Facebook\n" +
            "3. Cliquez sur 'Get Token' → 'Get User Access Token'\n" +
            "4. ⚠️ CRUCIAL : Sélectionnez et ACCEPTEZ ces permissions:\n" +
            "   ✓ pages_read_engagement (OBLIGATOIRE - doit être coché ET accepté dans le popup)\n" +
            "   ✓ pages_show_list\n" +
            "   ✓ pages_read_user_content (OBLIGATOIRE pour pages publiques)\n" +
            "5. Cliquez sur 'Generate Access Token'\n" +
            "6. ⚠️ IMPORTANT : Dans le popup Facebook, ACCEPTEZ TOUTES les permissions demandées\n" +
            "   Si vous refusez ou ignorez, le token n'aura pas les permissions\n\n" +
            "📌 ÉTAPE 2 : Vérifier les permissions du User Access Token\n" +
            "Dans Graph API Explorer, testez votre User Access Token:\n" +
            "GET /me/permissions?access_token={votre-user-token}\n" +
            "Vous devriez voir 'pages_read_engagement' avec status: 'granted'\n\n" +
            "📌 ÉTAPE 3 : Obtenir le Page Access Token\n" +
            "1. Toujours avec votre User Access Token dans Graph API Explorer:\n" +
            "   GET /me/accounts?access_token={votre-user-token}\n" +
            "2. Cette requête retourne la liste de vos pages avec leurs Page Access Tokens\n" +
            "3. Trouvez la page que vous voulez utiliser (ID: " + facebookPageId + ")\n" +
            "4. ⚠️ IMPORTANT : Copiez le 'access_token' de cette page spécifique\n" +
            "   (pas le User Access Token, mais le access_token dans la réponse)\n\n" +
            "📌 ÉTAPE 4 : Vérifier le Page Access Token\n" +
            "Testez le Page Access Token copié:\n" +
            "GET /me?access_token={votre-page-token}\n" +
            "Si ça fonctionne, vous avez le bon token.\n\n" +
            "📌 ÉTAPE 5 : Utiliser le Page Access Token\n" +
            "1. Collez le Page Access Token dans FACEBOOK_ACCESS_TOKEN de votre .env.local\n" +
            "2. Format (sans guillemets): FACEBOOK_ACCESS_TOKEN=EAAxxxxx...\n" +
            "3. ⚠️ CRUCIAL : Redémarrez complètement le serveur (Ctrl+C puis npm run dev)\n\n" +
            "🔴 ERREURS COURANTES :\n" +
            "- Utiliser un User Access Token au lieu d'un Page Access Token\n" +
            "- Ne pas accepter les permissions dans le popup Facebook\n" +
            "- Oublier de redémarrer le serveur après modification de .env.local\n" +
            "- Utiliser le token d'une autre page\n\n" +
            "📚 Consultez docs/FACEBOOK_SETUP.md pour plus de détails.";
        }
      } else if (errorCode === 100 || errorMessage.includes("does not exist") || errorMessage.includes("cannot be loaded")) {
        userFriendlyMessage = `L'ID de page Facebook '${facebookPageId}' n'est pas accessible.`;
        troubleshooting = `Vérifications à faire:\n` +
          `1. Vérifiez que l'ID de page est correct (format numérique, ex: 123456789012345)\n` +
          `2. Si vous utilisez un nom d'utilisateur (ex: @nompage), vous devez d'abord obtenir l'ID numérique via l'API Graph\n` +
          `3. Vérifiez que le token a accès à cette page (permissions pages_read_engagement)\n` +
          `4. Pour les pages publiques, utilisez un token avec la permission 'pages_read_user_content'\n` +
          `5. Si c'est votre propre page, assurez-vous d'utiliser un Page Access Token de cette page spécifique\n\n` +
          `Pour trouver l'ID d'une page:\n` +
          `- Allez sur la page Facebook\n` +
          `- Cliquez sur "À propos" puis cherchez "ID de page"\n` +
          `- Ou utilisez l'outil Facebook: https://www.facebook.com/help/contact/571927962365970`;
      } else if (errorCode === 803 || errorCode === 200) {
        userFriendlyMessage = "Accès refusé à cette page.";
        troubleshooting = 
          "Cette erreur peut avoir plusieurs causes:\n\n" +
          "🔴 Pour une page que vous ADMINISTREZ:\n" +
          "- Vérifiez que vous utilisez le Page Access Token spécifique à cette page\n" +
          "- Obtenez-le via GET /me/accounts après avoir généré un User Access Token\n\n" +
          "🔴 Pour une page PUBLIQUE qui ne vous appartient PAS:\n" +
          "- Le token doit avoir la permission 'pages_read_user_content' ⭐\n" +
          "- Utilisez un System User Token avec cette permission (voir docs/FACEBOOK_SYSTEM_USER_SETUP.md)\n" +
          "- Ou un User Access Token avec cette permission, puis obtenez le Page Access Token\n" +
          "- Vérifiez que la page et ses événements sont bien publics\n\n" +
          "📚 Consultez docs/FACEBOOK_PUBLIC_PAGES.md pour un guide complet sur l'accès aux pages publiques.";
      }
      
      return NextResponse.json(
        {
          error: userFriendlyMessage,
          details: errorMessage,
          errorCode,
          errorType,
          errorSubcode,
          troubleshooting,
          facebookPageId, // Inclure l'ID pour le débogage
          hint: "Vérifiez les logs serveur (console où npm run dev) pour voir l'erreur Facebook complète avec tous les détails.",
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const events: FacebookEvent[] = data.data || [];

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Erreur lors de la récupération des événements Facebook:", error);
    return NextResponse.json(
      {
        error: "Erreur interne du serveur",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}

