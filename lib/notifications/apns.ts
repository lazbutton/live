import apn from "apn";
import fs from "fs";
import path from "path";

let apnProvider: apn.Provider | null = null;

/**
 * Initialise le provider APNs avec la Push Notification Key (.p8)
 * Selon la documentation ios-apns-setup.md
 */
function getAPNsProvider(): apn.Provider | null {
  if (apnProvider) {
    return apnProvider;
  }

  const keyPath = process.env.APNS_KEY_PATH;
  const keyContent = process.env.APNS_KEY_CONTENT; // Nouvelle option : contenu direct du fichier
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;

  // Si la configuration n'est pas complète, retourner null
  if ((!keyPath && !keyContent) || !keyId || !teamId || !bundleId) {
    console.warn(
      "⚠️ Configuration APNs incomplète. Variables requises: (APNS_KEY_PATH ou APNS_KEY_CONTENT), APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID"
    );
    console.warn("   APNS_KEY_PATH:", keyPath ? "✓" : "✗");
    console.warn("   APNS_KEY_CONTENT:", keyContent ? "✓" : "✗");
    console.warn("   APNS_KEY_ID:", keyId ? "✓" : "✗");
    console.warn("   APNS_TEAM_ID:", teamId ? "✓" : "✗");
    console.warn("   APNS_BUNDLE_ID:", bundleId ? "✓" : "✗");
    return null;
  }

  try {
    let key: Buffer | string;

    // Option 1 : Lire depuis une variable d'environnement (pour production/Vercel)
    if (keyContent) {
      // Le contenu peut être directement le contenu du fichier ou avec des \n
      key = keyContent.replace(/\\n/g, "\n");
      console.log("✅ Clé APNs chargée depuis APNS_KEY_CONTENT");
    }
    // Option 2 : Lire depuis un fichier (pour développement local)
    else if (keyPath) {
      // Vérifier que le fichier existe
      const resolvedPath = path.resolve(keyPath);
      if (!fs.existsSync(resolvedPath)) {
        console.error(`❌ Fichier APNs key introuvable: ${resolvedPath}`);
        console.error("   💡 Pour la production (Vercel), utilisez APNS_KEY_CONTENT au lieu de APNS_KEY_PATH");
        return null;
      }

      // Lire la clé .p8
      key = fs.readFileSync(resolvedPath);

      if (!key || key.length === 0) {
        console.error("❌ Le fichier APNs key est vide");
        return null;
      }
      console.log("✅ Clé APNs chargée depuis fichier");
    } else {
      console.error("❌ Aucune source de clé APNs trouvée (ni APNS_KEY_PATH ni APNS_KEY_CONTENT)");
      return null;
    }

    apnProvider = new apn.Provider({
      token: {
        key: key,
        keyId: keyId,
        teamId: teamId,
      },
      production: process.env.NODE_ENV === "production", // true pour production, false pour sandbox
    });

    console.log("✅ Provider APNs initialisé avec succès");
    return apnProvider;
  } catch (error) {
    console.error("❌ Erreur lors de l'initialisation du provider APNs:", error);
    return null;
  }
}

/**
 * Envoie une notification APNs à un token iOS
 */
export async function sendAPNsNotification(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  // Vérifier si c'est un token valide (format hexadécimal, ~64 caractères)
  if (!deviceToken || deviceToken.length < 32 || deviceToken.length > 200) {
    return {
      success: false,
      error: `Token APNs invalide (format/longueur incorrecte): ${deviceToken.substring(0, 20)}...`,
    };
  }

  const provider = getAPNsProvider();

  if (!provider) {
    const keyPath = process.env.APNS_KEY_PATH;
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;
    const bundleId = process.env.APNS_BUNDLE_ID;

    const keyContent = process.env.APNS_KEY_CONTENT;
    
    console.error("❌ Provider APNs non initialisé. Configuration actuelle:");
    console.error(`   APNS_KEY_PATH: ${keyPath || "NON DÉFINI"}`);
    console.error(`   APNS_KEY_CONTENT: ${keyContent ? "✓ DÉFINI" : "✗ NON DÉFINI"}`);
    console.error(`   APNS_KEY_ID: ${keyId || "NON DÉFINI"}`);
    console.error(`   APNS_TEAM_ID: ${teamId || "NON DÉFINI"}`);
    console.error(`   APNS_BUNDLE_ID: ${bundleId || "NON DÉFINI"}`);
    if (!keyContent && keyPath) {
      console.error("   💡 Pour la production (Vercel), utilisez APNS_KEY_CONTENT au lieu de APNS_KEY_PATH");
    }

    return {
      success: false,
      error: "Provider APNs non initialisé. Vérifiez les variables d'environnement APNS_* (utilisez APNS_KEY_CONTENT en production)",
    };
  }

  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!bundleId) {
    return {
      success: false,
      error: "APNS_BUNDLE_ID non défini",
    };
  }

  try {
    const notification = new apn.Notification();

    // Configuration de base (2025)
    notification.alert = {
      title: title,
      body: body,
    };
    notification.topic = bundleId;
    notification.badge = 1;
    notification.sound = "default";
    notification.priority = 10; // 10 = high priority, 5 = low priority
    notification.expiry = Math.floor(Date.now() / 1000) + 3600; // Expire dans 1 heure

    // Données personnalisées (pour la navigation dans l'app)
    if (data) {
      notification.payload = data;
    }

    // Envoyer la notification
    const result = await provider.send(notification, deviceToken);

    if (result.sent.length > 0) {
      console.log("✅ Notification APNs envoyée avec succès");
      return { success: true };
    }

    if (result.failed.length > 0) {
      const failure = result.failed[0];
      const error = failure.error as any;
      const errorMessage = error?.reason || error?.message || "Erreur inconnue";

      console.error("❌ Échec d'envoi APNs:", errorMessage);

      // Gérer les erreurs spécifiques
      if (error?.reason === "BadDeviceToken" || error?.reason === "Unregistered") {
        // Le token est invalide, il faudra le supprimer de la base
        return {
          success: false,
          error: `Token invalide: ${error.reason}`,
        };
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    return { success: false, error: "Aucun résultat" };
  } catch (error: any) {
    console.error("❌ Erreur lors de l'envoi APNs:", error);
    return {
      success: false,
      error: error?.message || "Erreur inconnue",
    };
  }
}

/**
 * Ferme la connexion APNs (à appeler lors de l'arrêt de l'application)
 */
export function closeAPNsConnection() {
  if (apnProvider) {
    apnProvider.shutdown();
    apnProvider = null;
    console.log("🔌 Connexion APNs fermée");
  }
}

