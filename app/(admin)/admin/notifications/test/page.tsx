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

export default function TestNotificationsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [tokensData, setTokensData] = useState<any>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);

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

  return (
    <AdminLayout title="Test Notifications Admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Test des Notifications Admin</h1>
          <p className="text-muted-foreground">
            Testez l'envoi de notifications push aux administrateurs
          </p>
        </div>

        {result && (
          <Alert variant={result.success ? "default" : "destructive"}>
            {result.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertDescription>
              {result.message}
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
      </div>
    </AdminLayout>
  );
}

