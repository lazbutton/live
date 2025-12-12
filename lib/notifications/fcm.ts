import admin from "firebase-admin";

let firebaseApp: admin.app.App | null = null;

/**
 * Initialise Firebase Admin SDK pour FCM
 */
function getFirebaseApp(): admin.app.App | null {
  if (firebaseApp) {
    return firebaseApp;
  }

  // Vérifier si Firebase est déjà initialisé
  try {
    firebaseApp = admin.app();
    return firebaseApp;
  } catch {
    // Firebase n'est pas encore initialisé
  }

  // Vérifier les variables d'environnement
  const serviceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH;
  const serviceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountPath && !serviceAccountJson) {
    console.warn(
      "⚠️ Configuration FCM incomplète. Variables requises: FCM_SERVICE_ACCOUNT_PATH ou FCM_SERVICE_ACCOUNT_JSON"
    );
    return null;
  }

  try {
    let serviceAccount;

    if (serviceAccountJson) {
      // Utiliser le JSON directement depuis les variables d'environnement
      serviceAccount = JSON.parse(serviceAccountJson);
    } else if (serviceAccountPath) {
      // Lire depuis un fichier
      const fs = require("fs");
      const path = require("path");
      const serviceAccountFile = fs.readFileSync(
        path.resolve(serviceAccountPath),
        "utf8"
      );
      serviceAccount = JSON.parse(serviceAccountFile);
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });

    console.log("✅ Firebase Admin SDK initialisé avec succès");
    return firebaseApp;
  } catch (error) {
    console.error("❌ Erreur lors de l'initialisation Firebase Admin:", error);
    return null;
  }
}

/**
 * Envoie une notification FCM à un token Android
 */
export async function sendFCMNotification(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  const app = getFirebaseApp();

  if (!app) {
    return {
      success: false,
      error: "Firebase Admin SDK non initialisé. Vérifiez la configuration.",
    };
  }

  try {
    const message: admin.messaging.Message = {
      token: deviceToken,
      notification: {
        title: title,
        body: body,
      },
      data: data
        ? Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
              key,
              String(value),
            ])
          )
        : undefined,
      android: {
        priority: "high" as const,
        notification: {
          sound: "default",
          channelId: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Notification FCM envoyée avec succès:", response);
    return { success: true };
  } catch (error: any) {
    console.error("❌ Erreur lors de l'envoi FCM:", error);

    // Gérer les erreurs spécifiques
    if (error.code === "messaging/invalid-registration-token") {
      return {
        success: false,
        error: "Token invalide",
      };
    }

    if (error.code === "messaging/registration-token-not-registered") {
      return {
        success: false,
        error: "Token non enregistré",
      };
    }

    return {
      success: false,
      error: error?.message || "Erreur inconnue",
    };
  }
}







