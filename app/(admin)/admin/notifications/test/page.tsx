"use client";

import { useState, useEffect } from "react";
import { AdminLayout } from "../../components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, Send } from "lucide-react";

const FLOW_EXPLANATIONS = [
  {
    title: "Tests admin publics",
    description:
      "Les routes admin utilisent sendNotificationToAdmins et ignorent les préférences / catégories utilisateur.",
  },
  {
    title: "Envois utilisateurs",
    description:
      "Les routes send/send-test passent par sendNotificationToUser et dépendent des préférences, des catégories et du dernier token.",
  },
  {
    title: "Crons réels",
    description:
      "Les crons ajoutent en plus notification_settings.is_active, la fenêtre horaire Paris et l'anti-doublon notification_logs.",
  },
];

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function extractDiagnosticHighlights(details: any) {
  const highlights: string[] = [];

  const flow = details?.flow;
  if (flow?.authMode) {
    highlights.push(`Auth: ${flow.authMode}`);
  }
  if (flow?.sender) {
    highlights.push(`Sender: ${flow.sender}`);
  }

  const totals = details?.diagnostics?.totals;
  if (totals?.usersWithoutTokens) {
    highlights.push(`Sans token: ${totals.usersWithoutTokens}`);
  }
  if (totals?.usersWithoutCategories) {
    highlights.push(`Sans catégories: ${totals.usersWithoutCategories}`);
  }
  if (totals?.usersCategoryMismatch) {
    highlights.push(`Catégories non alignées: ${totals.usersCategoryMismatch}`);
  }
  if (totals?.usersWithDisabledPreferences) {
    highlights.push(`Prefs désactivées: ${totals.usersWithDisabledPreferences}`);
  }
  if (totals?.adminsWithoutTokens) {
    highlights.push(`Admins sans token: ${totals.adminsWithoutTokens}`);
  }
  if (totals?.tokensFailed) {
    highlights.push(`Tokens en échec: ${totals.tokensFailed}`);
  }

  if (details?.debug?.usersWithoutTokens) {
    highlights.push(`Cron sans token: ${details.debug.usersWithoutTokens}`);
  }
  if (details?.debug?.usersWithoutCategories) {
    highlights.push(`Cron sans catégories: ${details.debug.usersWithoutCategories}`);
  }

  return highlights;
}

export default function TestNotificationsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [tokensData, setTokensData] = useState<any>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [manualSendData, setManualSendData] = useState({
    title: "Test ciblé utilisateur",
    body: "Diagnostic manuel depuis l'admin",
    userId: "",
    categoryIds: "",
  });
  const [broadcastData, setBroadcastData] = useState({
    title: "Test global utilisateurs",
    body: "Diffusion de test depuis l'admin",
    categoryIds: "",
  });
  const [cronLoading, setCronLoading] = useState<"daily" | "weekly" | null>(null);

  const [requestData, setRequestData] = useState({
    requestId: "test-request-" + Date.now(),
    requestType: "event_creation",
    eventTitle: "Événement de test",
    sourceUrl: "https://example.com/event",
  });

  const [feedbackData, setFeedbackData] = useState({
    feedbackId: "test-feedback-" + Date.now(),
    message: "Ceci est un feedback de test",
    userId: "",
  });

  async function testRequestNotification() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/notifications/admin/new-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResult({
          success: true,
          message: `✅ Notification envoyée avec succès ! ${data.sent} admin(s) notifié(s)`,
          details: data,
        });
      } else {
        setResult({
          success: false,
          message: `❌ Erreur : ${data.error || "Erreur inconnue"}`,
          details: data,
        });
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: `❌ Erreur réseau : ${error.message}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function testFeedbackNotification() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/notifications/admin/new-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(feedbackData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResult({
          success: true,
          message: `✅ Notification envoyée avec succès ! ${data.sent} admin(s) notifié(s)`,
          details: data,
        });
      } else {
        setResult({
          success: false,
          message: `❌ Erreur : ${data.error || "Erreur inconnue"}`,
          details: data,
        });
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: `❌ Erreur réseau : ${error.message}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function testManualUserSend() {
    setLoading(true);
    setResult(null);

    try {
      const categoryIds = manualSendData.categoryIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: manualSendData.userId.trim() || undefined,
          title: manualSendData.title,
          body: manualSendData.body,
          data: categoryIds.length > 0 ? { categories: categoryIds, type: "manual_debug" } : { type: "manual_debug" },
        }),
      });

      const data = await response.json();
      setResult({
        success: response.ok && Boolean(data?.success),
        message:
          response.ok && data?.success
            ? `✅ Envoi ciblé terminé (${data.sent} envoyé(s), ${data.failed} échec(s))`
            : `❌ Envoi ciblé en échec : ${data?.error || data?.errors?.[0] || "Erreur inconnue"}`,
        details: data,
      });
    } catch (error: any) {
      setResult({
        success: false,
        message: `❌ Erreur réseau : ${error.message}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function testBroadcastSend() {
    setLoading(true);
    setResult(null);

    try {
      const categoryIds = broadcastData.categoryIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: broadcastData.title,
          body: broadcastData.body,
          data: categoryIds.length > 0 ? { categories: categoryIds, type: "broadcast_debug" } : { type: "broadcast_debug" },
        }),
      });

      const data = await response.json();
      setResult({
        success: response.ok && Boolean(data?.success),
        message:
          response.ok && data?.success
            ? `✅ Envoi global terminé (${data.sent} envoyé(s), ${data.failed} échec(s))`
            : `❌ Envoi global en échec : ${data?.error || data?.errors?.[0] || "Erreur inconnue"}`,
        details: data,
      });
    } catch (error: any) {
      setResult({
        success: false,
        message: `❌ Erreur réseau : ${error.message}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function runCronDebug(flow: "daily" | "weekly") {
    setCronLoading(flow);
    setResult(null);

    try {
      const response = await fetch("/api/admin/notifications/debug", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ flow }),
      });

      const data = await response.json();
      setResult({
        success: response.ok && Boolean(data?.success),
        message:
          response.ok && data?.success
            ? `✅ Cron ${flow} exécuté (${data.notificationsSent ?? 0} envoi(s))`
            : `❌ Cron ${flow} en échec : ${data?.error || data?.message || "Erreur inconnue"}`,
        details: data,
      });
    } catch (error: any) {
      setResult({
        success: false,
        message: `❌ Erreur réseau : ${error.message}`,
      });
    } finally {
      setCronLoading(null);
    }
  }

  async function loadTokens() {
    setLoadingTokens(true);
    try {
      const response = await fetch("/api/admin/notifications/tokens");
      const data = await response.json();
      setTokensData(data);
    } catch (error: any) {
      console.error("Erreur lors du chargement des tokens:", error);
    } finally {
      setLoadingTokens(false);
    }
  }

  useEffect(() => {
    loadTokens();
  }, []);

  const diagnosticHighlights = extractDiagnosticHighlights(result?.details);

  return (
    <AdminLayout title="Test Notifications Admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Test des Notifications Admin</h1>
          <p className="text-muted-foreground">
            Comparez les flux tests admin, envois utilisateurs réels et crons.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Comparer les flux</CardTitle>
            <CardDescription>
              Tous les panneaux ci-dessous renvoient maintenant les diagnostics backend du flux réellement exécuté.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {FLOW_EXPLANATIONS.map((item) => (
              <div key={item.title} className="rounded-lg border p-3">
                <div className="font-medium">{item.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {result && (
          <Alert variant={result.success ? "default" : "destructive"}>
            {result.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertDescription>
              {result.message}
              {diagnosticHighlights.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {diagnosticHighlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="rounded-full border border-current/20 px-2 py-1 text-xs"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              )}
              {result.details && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    Détails
                  </summary>
                  <pre className="mt-2 text-xs overflow-auto bg-muted p-2 rounded">
                    {JSON.stringify(result.details, null, 2)}
                  </pre>
                </details>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Test Notification Nouvelle Demande */}
          <Card>
            <CardHeader>
              <CardTitle>Test : Nouvelle Demande</CardTitle>
              <CardDescription>
                Envoie une notification pour une nouvelle demande d'événement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="requestId">Request ID</Label>
                <Input
                  id="requestId"
                  value={requestData.requestId}
                  onChange={(e) =>
                    setRequestData({ ...requestData, requestId: e.target.value })
                  }
                  placeholder="ID de la demande"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="requestType">Type de demande</Label>
                <select
                  id="requestType"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={requestData.requestType}
                  onChange={(e) =>
                    setRequestData({ ...requestData, requestType: e.target.value })
                  }
                >
                  <option value="event_creation">Création d'événement</option>
                  <option value="event_from_url">Événement depuis URL</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventTitle">Titre de l'événement</Label>
                <Input
                  id="eventTitle"
                  value={requestData.eventTitle}
                  onChange={(e) =>
                    setRequestData({ ...requestData, eventTitle: e.target.value })
                  }
                  placeholder="Titre de l'événement"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sourceUrl">URL source (optionnel)</Label>
                <Input
                  id="sourceUrl"
                  value={requestData.sourceUrl}
                  onChange={(e) =>
                    setRequestData({ ...requestData, sourceUrl: e.target.value })
                  }
                  placeholder="https://example.com/event"
                />
              </div>
              <Button
                onClick={testRequestNotification}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Envoyer la notification
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Test Notification Nouveau Feedback */}
          <Card>
            <CardHeader>
              <CardTitle>Test : Nouveau Feedback</CardTitle>
              <CardDescription>
                Envoie une notification pour un nouveau feedback
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="feedbackId">Feedback ID</Label>
                <Input
                  id="feedbackId"
                  value={feedbackData.feedbackId}
                  onChange={(e) =>
                    setFeedbackData({ ...feedbackData, feedbackId: e.target.value })
                  }
                  placeholder="ID du feedback"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message du feedback</Label>
                <Textarea
                  id="message"
                  value={feedbackData.message}
                  onChange={(e) =>
                    setFeedbackData({ ...feedbackData, message: e.target.value })
                  }
                  placeholder="Message du feedback"
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userId">User ID (optionnel)</Label>
                <Input
                  id="userId"
                  value={feedbackData.userId}
                  onChange={(e) =>
                    setFeedbackData({ ...feedbackData, userId: e.target.value })
                  }
                  placeholder="ID de l'utilisateur"
                />
              </div>
              <Button
                onClick={testFeedbackNotification}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Envoyer la notification
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Test : Envoi ciblé utilisateur</CardTitle>
              <CardDescription>
                Passe par <code className="bg-muted px-1 rounded">/api/notifications/send</code> et applique préférences, catégories et dernier token.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual-user-id">User ID cible</Label>
                <Input
                  id="manual-user-id"
                  value={manualSendData.userId}
                  onChange={(e) =>
                    setManualSendData({ ...manualSendData, userId: e.target.value })
                  }
                  placeholder="UUID utilisateur"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-title">Titre</Label>
                <Input
                  id="manual-title"
                  value={manualSendData.title}
                  onChange={(e) =>
                    setManualSendData({ ...manualSendData, title: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-body">Corps</Label>
                <Textarea
                  id="manual-body"
                  value={manualSendData.body}
                  onChange={(e) =>
                    setManualSendData({ ...manualSendData, body: e.target.value })
                  }
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-categories">Catégories (IDs, séparés par des virgules)</Label>
                <Input
                  id="manual-categories"
                  value={manualSendData.categoryIds}
                  onChange={(e) =>
                    setManualSendData({ ...manualSendData, categoryIds: e.target.value })
                  }
                  placeholder="uuid-1, uuid-2"
                />
              </div>
              <Button
                onClick={testManualUserSend}
                disabled={loading || !manualSendData.userId.trim()}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Envoyer à cet utilisateur
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test : Diffusion globale utilisateurs</CardTitle>
              <CardDescription>
                Permet de voir combien d’utilisateurs sont réellement bloqués par préférences, catégories ou tokens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="broadcast-title">Titre</Label>
                <Input
                  id="broadcast-title"
                  value={broadcastData.title}
                  onChange={(e) =>
                    setBroadcastData({ ...broadcastData, title: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="broadcast-body">Corps</Label>
                <Textarea
                  id="broadcast-body"
                  value={broadcastData.body}
                  onChange={(e) =>
                    setBroadcastData({ ...broadcastData, body: e.target.value })
                  }
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="broadcast-categories">Catégories (IDs, séparés par des virgules)</Label>
                <Input
                  id="broadcast-categories"
                  value={broadcastData.categoryIds}
                  onChange={(e) =>
                    setBroadcastData({ ...broadcastData, categoryIds: e.target.value })
                  }
                  placeholder="Laisser vide pour désactiver le filtre catégories"
                />
              </div>
              <Button
                onClick={testBroadcastSend}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Envoyer à tous les utilisateurs
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Test : Crons réels</CardTitle>
            <CardDescription>
              Exécute les routes cron via un proxy admin avec le même <code className="bg-muted px-1 rounded">CRON_SECRET</code> que Vercel.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => runCronDebug("daily")}
              disabled={cronLoading !== null}
            >
              {cronLoading === "daily" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cron quotidien...
                </>
              ) : (
                "Exécuter le cron quotidien"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => runCronDebug("weekly")}
              disabled={cronLoading !== null}
            >
              {cronLoading === "weekly" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cron hebdo...
                </>
              ) : (
                "Exécuter le cron hebdomadaire"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Diagnostic de l'erreur 400 APNs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Erreur 400 détectée :</strong> Le bundle ID ne correspond probablement pas au token iOS.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <p className="font-semibold">Causes possibles :</p>
              <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
                <li>Le token iOS a été généré avec un bundle ID différent de celui configuré</li>
                <li>La variable <code className="bg-muted px-1 rounded">APNS_BUNDLE_ID</code> ne correspond pas au bundle ID de l'app mobile</li>
                <li>La clé APNs n'est pas configurée pour ce bundle ID sur Apple Developer Portal</li>
                <li>L'app mobile utilise un bundle ID différent lors de l'enregistrement du token</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-semibold">Solutions :</p>
              <ol className="list-decimal list-inside space-y-1 ml-4 text-muted-foreground">
                <li>Vérifiez que <code className="bg-muted px-1 rounded">APNS_BUNDLE_ID</code> correspond exactement au bundle ID de votre app iOS (ex: <code className="bg-muted px-1 rounded">com.votreapp.nom</code>)</li>
                <li>Vérifiez dans l'app mobile que le token est enregistré avec le bon bundle ID</li>
                <li>Assurez-vous que la clé APNs (.p8) est configurée pour ce bundle ID sur Apple Developer Portal</li>
                <li>Vérifiez que vous utilisez le bon environnement (Production vs Sandbox) avec <code className="bg-muted px-1 rounded">APNS_PRODUCTION</code></li>
              </ol>
            </div>

            <div className="space-y-2">
              <p className="font-semibold">Vérification de la configuration :</p>
              <p className="text-muted-foreground">
                Vérifiez vos variables d'environnement :
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
                <li><code className="bg-muted px-1 rounded">APNS_BUNDLE_ID</code> : doit correspondre au bundle ID de l'app</li>
                <li><code className="bg-muted px-1 rounded">APNS_KEY_ID</code> : ID de la clé APNs</li>
                <li><code className="bg-muted px-1 rounded">APNS_TEAM_ID</code> : Team ID Apple</li>
                <li><code className="bg-muted px-1 rounded">APNS_KEY_CONTENT</code> ou <code className="bg-muted px-1 rounded">APNS_KEY_PATH</code> : clé .p8</li>
                <li><code className="bg-muted px-1 rounded">APNS_PRODUCTION</code> : true pour production, false pour sandbox</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Diagnostic des Tokens</CardTitle>
                <CardDescription>Vérifiez les tokens push enregistrés pour les admins</CardDescription>
              </div>
              <Button onClick={loadTokens} disabled={loadingTokens} variant="outline" size="sm">
                {loadingTokens ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Chargement...
                  </>
                ) : (
                  "Actualiser"
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {tokensData && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{tokensData.stats?.total_admins || 0}</div>
                    <div className="text-xs text-muted-foreground">Admins</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{tokensData.stats?.total_tokens || 0}</div>
                    <div className="text-xs text-muted-foreground">Tokens totaux</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{tokensData.stats?.ios_tokens || 0}</div>
                    <div className="text-xs text-muted-foreground">Tokens iOS</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{tokensData.stats?.android_tokens || 0}</div>
                    <div className="text-xs text-muted-foreground">Tokens Android</div>
                  </div>
                </div>

                {tokensData.stats?.ios_tokens === 0 && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Aucun token iOS trouvé.</strong> Les admins doivent enregistrer leur token push depuis l'app mobile iOS.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-3">
                  {tokensData.admins?.map((adminData: any) => (
                    <div key={adminData.admin.id} className="border rounded-lg p-3">
                      <div className="font-semibold">{adminData.admin.email}</div>
                      <div className="text-sm text-muted-foreground mb-2">
                        {adminData.total_count} token(s) - {adminData.ios_count} iOS, {adminData.android_count} Android
                      </div>
                      {adminData.tokens.length > 0 ? (
                        <div className="space-y-1">
                          {adminData.tokens.map((token: any, idx: number) => (
                            <div key={idx} className="text-xs bg-muted p-2 rounded">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  token.platform === "ios" ? "bg-blue-100 text-blue-700" :
                                  token.platform === "android" ? "bg-green-100 text-green-700" :
                                  "bg-gray-100 text-gray-700"
                                }`}>
                                  {token.platform.toUpperCase()}
                                </span>
                                <span className="font-mono">{token.token_preview}</span>
                                <span className="text-muted-foreground">({token.token_length} chars)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">Aucun token enregistré</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {!tokensData && (
              <div className="text-center py-4 text-muted-foreground">
                Cliquez sur "Actualiser" pour charger les tokens
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>Note :</strong> Pour que les notifications fonctionnent, les admins doivent :
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Avoir le rôle <code className="bg-muted px-1 rounded">"admin"</code> dans leurs user_metadata</li>
              <li>Avoir enregistré un token push via l'app mobile</li>
              <li>Être connectés à l'app mobile pour recevoir la notification</li>
            </ul>
            <p className="mt-4">
              <strong>Vérification :</strong> Vous pouvez vérifier les admins et leurs tokens avec cette requête SQL :
            </p>
            <pre className="bg-muted p-3 rounded text-xs overflow-auto">
{`SELECT 
  u.email,
  u.raw_user_meta_data->>'role' as role,
  COUNT(t.id) as token_count,
  STRING_AGG(t.platform, ', ') as platforms
FROM auth.users u
LEFT JOIN user_push_tokens t ON t.user_id = u.id
WHERE u.raw_user_meta_data->>'role' = 'admin'
GROUP BY u.id, u.email, u.raw_user_meta_data->>'role';`}
            </pre>
          </CardContent>
        </Card>

        {result?.details?.flow && (
          <Card>
            <CardHeader>
              <CardTitle>Lecture du flux exécuté</CardTitle>
              <CardDescription>
                Résumé du chemin réellement utilisé pour le dernier test.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded bg-muted p-3 text-xs">
                {prettyJson(result.details.flow)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

