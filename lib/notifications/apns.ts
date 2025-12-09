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
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;

  // Si la configuration n'est pas complète, retourner null
  if (!keyPath || !keyId || !teamId || !bundleId) {
    console.warn(
      "⚠️ Configuration APNs incomplète. Variables requises: APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID"
    );
    return null;
  }

  try {
    // Lire la clé .p8
    const key = fs.readFileSync(path.resolve(keyPath));

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
  const provider = getAPNsProvider();

  if (!provider) {
    return {
      success: false,
      error: "Provider APNs non initialisé. Vérifiez la configuration.",
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

