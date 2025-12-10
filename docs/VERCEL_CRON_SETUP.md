# Configuration des Cron Jobs dans Vercel

Vercel permet d'exécuter des tâches programmées (cron jobs) pour appeler vos API routes à intervalles réguliers.

## Méthode 1 : Configuration via `vercel.json` (Recommandé)

### 1. Créer le fichier `vercel.json`

Créez un fichier `vercel.json` à la racine de votre projet :

```json
{
  "crons": [
    {
      "path": "/api/cron/scrape-events",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/send-notifications",
      "schedule": "0 9 * * *"
    }
  ]
}
```

### 2. Créer les endpoints API

Pour chaque cron, créez une route API correspondante dans `app/api/cron/[nom]/route.ts`.

**Exemple : `app/api/cron/scrape-events/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Vérifier que la requête vient de Vercel Cron
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  
  // Vercel envoie le token dans le header Authorization
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.error("❌ CRON_SECRET n'est pas défini dans les variables d'environnement");
    return false;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  // Vérifier que la requête vient bien de Vercel Cron
  if (!verifyCronRequest(request)) {
    return NextResponse.json(
      { error: "Non autorisé" },
      { status: 401 }
    );
  }

  try {
    const supabase = createServiceClient();
    
    // Votre logique de scraping ici
    // Par exemple : récupérer tous les organisateurs et scraper leurs événements
    
    console.log("🔄 Exécution du cron de scraping des événements");
    
    // Exemple de logique
    const { data: organizers } = await supabase
      .from("organizers")
      .select("id, name, scraping_config");
    
    if (!organizers) {
      return NextResponse.json({
        success: false,
        message: "Aucun organisateur trouvé",
      });
    }
    
    // Scraper les événements pour chaque organisateur
    for (const organizer of organizers) {
      // Votre logique de scraping
      console.log(`📋 Scraping pour ${organizer.name}...`);
    }
    
    return NextResponse.json({
      success: true,
      message: `Scraping terminé pour ${organizers.length} organisateurs`,
    });
    
  } catch (error: any) {
    console.error("❌ Erreur lors du cron:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}
```

### 3. Configurer la variable d'environnement `CRON_SECRET`

Dans le dashboard Vercel :

1. Allez dans **Project Settings > Environment Variables**
2. Ajoutez `CRON_SECRET` avec une valeur aléatoire (ex: généré avec `openssl rand -hex 32`)
3. Sélectionnez tous les environnements (Production, Preview, Development)

⚠️ **Important** : Ne partagez jamais cette valeur publiquement. Elle doit rester secrète.

### 4. Mettre à jour `vercel.json` avec le secret

Vercel ajoutera automatiquement le header `Authorization: Bearer ${CRON_SECRET}` à vos requêtes cron. Vous devez juste vérifier ce header dans votre code.

## Méthode 2 : Configuration via le Dashboard Vercel

### Étapes

1. **Aller dans votre projet Vercel**
2. **Onglet Settings > Cron Jobs**
3. **Cliquer sur "Add Cron Job"**
4. **Configurer le cron** :
   - **Path** : `/api/cron/scrape-events`
   - **Schedule** : `0 * * * *` (toutes les heures)
   - **Timezone** : `Europe/Paris` (optionnel)

### Avantages du Dashboard

- Interface visuelle
- Gestion des timezones
- Historique des exécutions
- Logs détaillés

## Formats de Schedule (Cron Expressions)

Vercel utilise le format standard cron avec 5 champs :

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Jour de la semaine (0-7, 0 et 7 = dimanche)
│ │ │ └───── Mois (1-12)
│ │ └─────── Jour du mois (1-31)
│ └───────── Heure (0-23)
└─────────── Minute (0-59)
```

### Exemples

#### Heures exactes
- `0 * * * *` : Toutes les heures à minute 0 (8h00, 9h00, 10h00...)
- `0 9 * * *` : Tous les jours à 9h00 exactement
- `0 8 * * *` : Tous les jours à 8h00 exactement

#### Avec minutes spécifiques
- `15 8 * * *` : Tous les jours à 8h15
- `30 9 * * *` : Tous les jours à 9h30
- `45 18 * * *` : Tous les jours à 18h45
- `15 8 * * 1-5` : Du lundi au vendredi à 8h15

#### Intervalles de minutes
- `*/15 * * * *` : Toutes les 15 minutes (00, 15, 30, 45)
- `*/30 * * * *` : Toutes les 30 minutes (00, 30)
- `0,15,30,45 * * * *` : Toutes les heures aux minutes 0, 15, 30 et 45

#### Autres exemples
- `0 0 * * 0` : Tous les dimanches à minuit
- `0 9-17 * * 1-5` : Du lundi au vendredi, de 9h à 17h à chaque heure pile
- `15 9-17 * * 1-5` : Du lundi au vendredi, de 9h15 à 17h15 toutes les heures
- `0 0 1 * *` : Le 1er de chaque mois à minuit
- `30 14 * * *` : Tous les jours à 14h30

## Sécurité

### Vérification de l'origine

Vercel ajoute automatiquement un header `Authorization` avec votre `CRON_SECRET`. **Toujours vérifier ce header** pour éviter que des tiers n'appellent vos endpoints cron :

```typescript
const authHeader = request.headers.get("authorization");
const cronSecret = process.env.CRON_SECRET;

if (authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}
```

### Alternative : Utiliser `x-vercel-signature`

Vercel signe aussi les requêtes avec un header `x-vercel-signature`. Vous pouvez utiliser `@vercel/edge` pour vérifier :

```typescript
import { verifySignature } from "@vercel/edge";

export async function GET(request: NextRequest) {
  const isValid = await verifySignature(request);
  
  if (!isValid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  
  // Votre logique...
}
```

## Exemples d'utilisation

### 1. Scraping automatique des événements

**`app/api/cron/scrape-events/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: NextRequest) {
  // Vérifier l'authentification
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceClient();
  
  // Récupérer tous les organisateurs avec scraping configuré
  const { data: organizers } = await supabase
    .from("organizers")
    .select("id, name, scraping_config")
    .not("scraping_config", "is", null);
  
  if (!organizers || organizers.length === 0) {
    return NextResponse.json({ success: true, message: "Aucun organisateur à scraper" });
  }
  
  let scraped = 0;
  let errors = 0;
  
  for (const organizer of organizers) {
    try {
      // Appeler votre logique de scraping
      // await scrapeOrganizerEvents(organizer.id);
      scraped++;
    } catch (error) {
      console.error(`Erreur pour ${organizer.name}:`, error);
      errors++;
    }
  }
  
  return NextResponse.json({
    success: true,
    scraped,
    errors,
    total: organizers.length,
  });
}
```

### 2. Crons de notifications (Déjà configurés dans le projet)

Trois crons de notifications sont déjà configurés et fonctionnels :

#### a. Notifications quotidiennes (`/api/cron/notifications/daily-events`)
- **Schedule** : `0 8 * * *` (Tous les jours à 8h)
- **Fonction** : Envoie une notification à tous les utilisateurs avec les événements du jour
- **Fichier** : `app/api/cron/notifications/daily-events/route.ts`

#### b. Rappels pour événements à venir (`/api/cron/notifications/upcoming-reminders`)
- **Schedule** : `0 18 * * *` (Tous les jours à 18h)
- **Fonction** : Envoie un rappel sur les événements prévus pour le lendemain
- **Fichier** : `app/api/cron/notifications/upcoming-reminders/route.ts`

#### c. Résumé hebdomadaire (`/api/cron/notifications/weekly-summary`)
- **Schedule** : `0 10 * * 0` (Tous les dimanches à 10h)
- **Fonction** : Envoie un résumé des événements de la semaine à venir
- **Fichier** : `app/api/cron/notifications/weekly-summary/route.ts`

**Fonctionnalités communes :**
- ✅ Vérifient l'authentification via `CRON_SECRET`
- ✅ Récupèrent uniquement les événements avec `status = 'approved'`
- ✅ Envoient uniquement aux utilisateurs ayant activé les notifications (`user_notification_preferences.is_enabled = true`)
- ✅ Log les résultats dans `notification_logs`
- ✅ Gèrent automatiquement les tokens invalides (suppression)

### 3. Exemple simple d'envoi de notifications

**`app/api/cron/send-daily-notifications/route.ts`** (Exemple basique)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { sendNotificationToAll } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    // Récupérer les événements du jour
    const today = new Date().toISOString().split("T")[0];
    
    // Envoyer les notifications pour les événements du jour
    const result = await sendNotificationToAll({
      title: "Événements du jour",
      body: `Découvrez les événements d'aujourd'hui !`,
      data: { date: today },
    });
    
    return NextResponse.json({
      success: result.success,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### 4. Nettoyage de la base de données

**`app/api/cron/cleanup/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceClient();
  
  try {
    // Supprimer les événements passés depuis plus de 30 jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { error } = await supabase
      .from("events")
      .delete()
      .lt("date", thirtyDaysAgo.toISOString())
      .eq("status", "approved");
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      message: "Nettoyage terminé",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

## Vérification locale

Pour tester vos endpoints cron en local, vous pouvez utiliser `curl` :

```bash
# Générer un secret de test
export CRON_SECRET="test-secret-123"

# Appeler votre endpoint avec le header Authorization
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/scrape-events
```

## Limitations Vercel

- **Gratuit** : 2 cron jobs maximum par projet
- **Pro** : 20 cron jobs maximum
- **Enterprise** : Illimité

Les crons sont uniquement disponibles en **Production** sur Vercel (pas en Preview/Development).

## Dépannage

### Le cron ne s'exécute pas

1. Vérifiez que `CRON_SECRET` est bien configuré dans Vercel
2. Vérifiez les logs dans Vercel Dashboard > Functions > Logs
3. Vérifiez que le format cron est correct
4. Assurez-vous que l'endpoint retourne un code HTTP 200

### Erreur 401

- Vérifiez que `CRON_SECRET` correspond entre Vercel et votre code
- Vérifiez que le header `Authorization` est bien vérifié

### Logs

Vercel enregistre automatiquement les exécutions de cron dans les logs. Accédez-y via :
**Dashboard > Project > Functions > Logs**

