"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Bell, CheckCircle2, XCircle, Clock, Send, User, Smartphone, Globe, Loader2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";

interface ConfigStatus {
  apns: {
    configured: boolean;
    keyFileExists: boolean;
    keyId: string;
    teamId: string;
    bundleId: string | null;
  };
  fcm: {
    configured: boolean;
    filePath: string | null;
    fileExists: boolean;
    jsonDefined: boolean;
  };
  tokens: {
    ios: number;
    android: number;
    web: number;
    total: number;
  };
  logsCount: number;
  environment: string;
}

interface NotificationLog {
  id: string;
  title: string;
  body: string;
  event_ids: string[];
  sent_at: string;
  created_at: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
}

interface UserWithTokens {
  id: string;
  email: string | null;
  name: string | null;
  tokens: Array<{
    platform: string;
    token: string;
    device_id: string | null;
    app_version: string | null;
    updated_at: string;
  }>;
}

export function NotificationsManagement() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [users, setUsers] = useState<UserWithTokens[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [testForm, setTestForm] = useState({
    userId: "",
    title: "Notification de test",
    body: "Ceci est une notification de test envoyée depuis l'interface d'administration.",
    data: "",
  });

  const isMobile = useIsMobile();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Charger la configuration
      const configRes = await fetch("/api/notifications/config");
      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }

      // Charger les logs
      const logsRes = await fetch("/api/notifications/logs?limit=50");
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.logs || []);
      }

      // Charger les utilisateurs
      const usersRes = await fetch("/api/notifications/users");
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        console.log("📊 Données utilisateurs reçues:", usersData);
        setUsers(usersData.users || []);
      } else {
        const errorData = await usersRes.json().catch(() => ({}));
        console.error("❌ Erreur lors du chargement des utilisateurs:", usersRes.status, errorData);
      }
    } catch (error) {
      console.error("Erreur lors du chargement des données:", error);
    } finally {
      setLoading(false);
    }
  }

  async function sendTestNotification() {
    if (!testForm.userId || !testForm.title || !testForm.body) {
      alert("Veuillez remplir tous les champs obligatoires");
      return;
    }

    setSending(true);
    try {
      const body: any = {
        userId: testForm.userId,
        title: testForm.title,
        body: testForm.body,
      };

      if (testForm.data) {
        try {
          body.data = JSON.parse(testForm.data);
        } catch {
          alert("Les données JSON sont invalides");
          setSending(false);
          return;
        }
      }

      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = await res.json();

      if (res.ok) {
        alert(`Notification envoyée avec succès !\nEnvoyées: ${result.sent}\nÉchecs: ${result.failed}`);
        setIsTestDialogOpen(false);
        setTestForm({
          userId: "",
          title: "Notification de test",
          body: "Ceci est une notification de test envoyée depuis l'interface d'administration.",
          data: "",
        });
        loadData(); // Recharger les logs
      } else {
        alert(`Erreur: ${result.error || "Erreur inconnue"}`);
      }
    } catch (error: any) {
      console.error("Erreur lors de l'envoi:", error);
      alert(`Erreur: ${error?.message || "Erreur inconnue"}`);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Configuration des notifications
              </CardTitle>
              <CardDescription>
                État de la configuration APNs (iOS) et FCM (Android)
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="cursor-pointer"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {config && (
            <>
              {/* APNs (iOS) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  <Label className="font-semibold">APNs (iOS)</Label>
                  {config.apns.configured ? (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configuré
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      Non configuré
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground space-y-1 pl-6">
                  <p>Fichier clé: {config.apns.keyFileExists ? "✓ Trouvé" : "✗ Non trouvé"}</p>
                  <p>Key ID: {config.apns.keyId}</p>
                  <p>Team ID: {config.apns.teamId}</p>
                  <p>Bundle ID: {config.apns.bundleId || "Non défini"}</p>
                </div>
              </div>

              <Separator />

              {/* FCM (Android) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  <Label className="font-semibold">FCM (Android)</Label>
                  {config.fcm.configured ? (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configuré
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      Non configuré
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground space-y-1 pl-6">
                  <p>Fichier service account: {config.fcm.fileExists ? "✓ Trouvé" : config.fcm.jsonDefined ? "✓ JSON défini" : "✗ Non trouvé"}</p>
                  {config.fcm.filePath && <p>Chemin: {config.fcm.filePath}</p>}
                </div>
              </div>

              <Separator />

              {/* Statistiques */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Tokens iOS</p>
                  <p className="text-2xl font-bold">{config.tokens.ios}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Tokens Android</p>
                  <p className="text-2xl font-bold">{config.tokens.android}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Tokens Web</p>
                  <p className="text-2xl font-bold">{config.tokens.web}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{config.tokens.total}</p>
                </div>
              </div>

              <Alert>
                <AlertDescription>
                  Environnement: <strong>{config.environment}</strong> | 
                  Logs enregistrés: <strong>{config.logsCount}</strong>
                </AlertDescription>
              </Alert>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabs pour Logs et Utilisateurs */}
      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs">Logs de notifications</TabsTrigger>
          <TabsTrigger value="users">Utilisateurs</TabsTrigger>
        </TabsList>

        {/* Logs */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Logs des notifications</CardTitle>
                  <CardDescription>
                    Historique des notifications envoyées
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTestDialogOpen(true)}
                  className="cursor-pointer"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Envoyer un test
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun log pour le moment
                </div>
              ) : isMobile ? (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <Card key={log.id}>
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-semibold">{log.title}</p>
                            <p className="text-sm text-muted-foreground mt-1">{log.body}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {log.user && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {log.user.name || log.user.email || "Utilisateur"}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(log.sent_at), {
                              addSuffix: true,
                              locale: fr,
                            })}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Titre</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          {log.user ? (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span>{log.user.name || log.user.email || "Utilisateur"}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{log.title}</TableCell>
                        <TableCell className="max-w-md truncate">{log.body}</TableCell>
                        <TableCell>
                          {formatDistanceToNow(new Date(log.sent_at), {
                            addSuffix: true,
                            locale: fr,
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Utilisateurs */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Utilisateurs avec tokens push</CardTitle>
              <CardDescription>
                Liste des utilisateurs ayant enregistré des tokens de notification
              </CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun utilisateur avec token enregistré
                </div>
              ) : isMobile ? (
                <div className="space-y-3">
                  {users.map((user) => (
                    <Card key={user.id}>
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-semibold">{user.name || user.email || "Utilisateur"}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                          <Badge>{user.tokens.length} token(s)</Badge>
                        </div>
                        <div className="space-y-1">
                          {user.tokens.map((token, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              {token.platform === "ios" && <Smartphone className="h-3 w-3" />}
                              {token.platform === "android" && <Smartphone className="h-3 w-3" />}
                              {token.platform === "web" && <Globe className="h-3 w-3" />}
                              <span className="capitalize">{token.platform}</span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground">{token.token}</span>
                            </div>
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full cursor-pointer"
                          onClick={() => {
                            setTestForm((prev) => ({ ...prev, userId: user.id }));
                            setIsTestDialogOpen(true);
                          }}
                        >
                          <Send className="h-3 w-3 mr-2" />
                          Envoyer un test
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.name || "Utilisateur"}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {user.tokens.map((token, idx) => (
                              <Badge key={idx} variant="outline" className="capitalize">
                                {token.platform === "ios" && <Smartphone className="h-3 w-3 mr-1" />}
                                {token.platform === "android" && <Smartphone className="h-3 w-3 mr-1" />}
                                {token.platform === "web" && <Globe className="h-3 w-3 mr-1" />}
                                {token.platform}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="cursor-pointer"
                            onClick={() => {
                              setTestForm((prev) => ({ ...prev, userId: user.id }));
                              setIsTestDialogOpen(true);
                            }}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Test
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog pour envoyer un test */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Envoyer une notification de test</DialogTitle>
            <DialogDescription>
              Envoyez une notification à un utilisateur spécifique pour tester la configuration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="test-user">Utilisateur avec notifications activées *</Label>
              {users.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    Aucun utilisateur n'a activé les notifications push pour le moment.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={testForm.userId}
                  onValueChange={(value) =>
                    setTestForm((prev) => ({ ...prev, userId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un utilisateur" />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((user) => user.tokens.length > 0) // S'assurer qu'on n'affiche que ceux avec tokens
                      .map((user) => {
                        const platforms = user.tokens.map((t) => t.platform);
                        const platformLabels = {
                          ios: "iOS",
                          android: "Android",
                          web: "Web",
                        };
                        const platformText = platforms
                          .map((p) => platformLabels[p as keyof typeof platformLabels] || p)
                          .join(", ");

                        return (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name || user.email || "Utilisateur"} - {user.tokens.length} token(s) ({platformText})
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-title">Titre *</Label>
              <Input
                id="test-title"
                value={testForm.title}
                onChange={(e) =>
                  setTestForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Titre de la notification"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-body">Message *</Label>
              <Textarea
                id="test-body"
                value={testForm.body}
                onChange={(e) =>
                  setTestForm((prev) => ({ ...prev, body: e.target.value }))
                }
                placeholder="Message de la notification"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-data">Données JSON (optionnel)</Label>
              <Textarea
                id="test-data"
                value={testForm.data}
                onChange={(e) =>
                  setTestForm((prev) => ({ ...prev, data: e.target.value }))
                }
                placeholder='{"event_id": "123", "type": "test"}'
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Données personnalisées au format JSON qui seront transmises avec la notification
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsTestDialogOpen(false)}
                className="cursor-pointer"
              >
                Annuler
              </Button>
              <Button
                onClick={sendTestNotification}
                disabled={sending || !testForm.userId || !testForm.title || !testForm.body || users.length === 0}
                className="cursor-pointer"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Envoi...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Envoyer
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

