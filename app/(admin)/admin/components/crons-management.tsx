"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Play, Loader2, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Toast notifications - utiliser une alerte simple pour l'instant

interface Cron {
  path: string;
  schedule: string;
  scheduleDescription: string;
  name: string;
  description: string;
}

export function CronsManagement() {
  const [crons, setCrons] = useState<Cron[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<Record<string, any>>({});
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    loadCrons();
  }, []);

  async function loadCrons() {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/crons");
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Erreur lors du chargement des crons");
      }

      setCrons(data.crons || []);
    } catch (error: any) {
      console.error("Erreur lors du chargement des crons:", error);
      setToastMessage({ type: "error", message: error.message || "Impossible de charger les crons" });
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setLoading(false);
    }
  }

  async function triggerCron(cronPath: string) {
    try {
      setTriggering(cronPath);
      const response = await fetch("/api/admin/crons/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: cronPath }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Erreur lors du déclenchement du cron");
      }

      setLastResults((prev) => ({
        ...prev,
        [cronPath]: {
          success: true,
          result: data.result,
          timestamp: new Date(),
        },
      }));

      setToastMessage({ type: "success", message: `Cron "${getCronName(cronPath)}" déclenché avec succès` });
      setTimeout(() => setToastMessage(null), 5000);
    } catch (error: any) {
      console.error("Erreur lors du déclenchement du cron:", error);
      setLastResults((prev) => ({
        ...prev,
        [cronPath]: {
          success: false,
          error: error.message,
          timestamp: new Date(),
        },
      }));
      setToastMessage({ type: "error", message: error.message || "Impossible de déclencher le cron" });
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setTriggering(null);
    }
  }

  function getCronName(path: string): string {
    const cron = crons.find((c) => c.path === path);
    return cron?.name || path;
  }

  function formatSchedule(schedule: string): string {
    const parts = schedule.split(" ");
    if (parts.length !== 5) return schedule;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return "Toutes les heures";
    }
    
    return schedule;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Crons</h1>
          <p className="text-muted-foreground">
            Visualisez et déclenchez manuellement les tâches programmées
          </p>
        </div>
        <Button onClick={loadCrons} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {toastMessage && (
        <Alert variant={toastMessage.type === "error" ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{toastMessage.message}</AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Les crons sont configurés dans <code>vercel.json</code> et s'exécutent automatiquement selon leur schedule.
          Vous pouvez les déclencher manuellement pour tester ou forcer une exécution.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">Liste des crons</TabsTrigger>
          <TabsTrigger value="results">Résultats</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="grid gap-4">
            {crons.map((cron) => (
              <Card key={cron.path}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-xl">{cron.name}</CardTitle>
                      <CardDescription>{cron.description}</CardDescription>
                    </div>
                    <Button
                      onClick={() => triggerCron(cron.path)}
                      disabled={triggering === cron.path}
                      size="sm"
                      variant="outline"
                    >
                      {triggering === cron.path ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          En cours...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Déclencher
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Schedule:</span>
                      <code className="px-2 py-1 bg-muted rounded text-xs">{cron.schedule}</code>
                    </div>
                    <div className="text-muted-foreground">
                      {cron.scheduleDescription}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Path:</span>
                      <code className="px-2 py-1 bg-muted rounded text-xs">{cron.path}</code>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {Object.keys(lastResults).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Aucun résultat pour le moment. Déclenchez un cron pour voir les résultats.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(lastResults).map(([path, result]: [string, any]) => (
                <Card key={path}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{getCronName(path)}</CardTitle>
                      <div className="flex items-center gap-2">
                        {result.success ? (
                          <Badge variant="default" className="bg-success text-success-foreground">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Succès
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Échec
                          </Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {result.timestamp?.toLocaleString("fr-FR")}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {result.success ? (
                      <div className="space-y-2">
                        {result.result?.message && (
                          <p className="text-sm">{result.result.message}</p>
                        )}
                        <details className="mt-4">
                          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                            Détails de l'exécution
                          </summary>
                          <pre className="mt-2 p-4 bg-muted rounded-lg text-xs overflow-auto">
                            {JSON.stringify(result.result, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ) : (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{result.error}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

