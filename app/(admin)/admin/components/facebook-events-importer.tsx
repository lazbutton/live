"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectSearchable } from "@/components/ui/select-searchable";
import { Label } from "@/components/ui/label";
import { Loader2, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Organizer {
  id: string;
  name: string;
  facebook_page_id: string | null;
  type: "organizer" | "location";
}

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

interface FacebookEventsImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function FacebookEventsImporter({
  open,
  onOpenChange,
  onSuccess,
}: FacebookEventsImporterProps) {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fetchingEvents, setFetchingEvents] = useState(false);
  const [events, setEvents] = useState<FacebookEvent[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(
    new Set()
  );
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    count?: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      loadOrganizers();
    } else {
      // Reset states when dialog closes
      setSelectedOrganizerId("");
      setEvents([]);
      setSelectedEventIds(new Set());
      setImportResult(null);
    }
  }, [open]);

  async function loadOrganizers() {
    try {
      setLoading(true);
      
      // Charger les organisateurs classiques
      const { data: organizersData, error: organizersError } = await supabase
        .from("organizers")
        .select("id, name, facebook_page_id")
        .order("name", { ascending: true });

      if (organizersError) throw organizersError;

      // Charger les lieux qui sont aussi organisateurs
      // Note: facebook_page_id est ajouté dans la migration 033
      const { data: locationsData, error: locationsError } = await supabase
        .from("locations")
        .select("id, name, facebook_page_id")
        .eq("is_organizer", true)
        .order("name", { ascending: true });

      if (locationsError) throw locationsError;

      // Combiner les organisateurs et les lieux-organisateurs
      const allOrganizers = [
        ...(organizersData || []).map((org) => ({ ...org, type: "organizer" as const })),
        ...(locationsData || []).map((loc) => ({ ...loc, type: "location" as const })),
      ];

      setOrganizers(allOrganizers);
    } catch (error) {
      console.error("Erreur lors du chargement des organisateurs:", error);
      alert("Erreur lors du chargement des organisateurs");
    } finally {
      setLoading(false);
    }
  }

  async function fetchFacebookEvents() {
    if (!selectedOrganizerId) {
      alert("Veuillez sélectionner un organisateur");
      return;
    }

    const selectedOrganizer = organizers.find(
      (o) => o.id === selectedOrganizerId
    );

    if (!selectedOrganizer?.facebook_page_id) {
      alert(
        "Cet organisateur n'a pas d'ID de page Facebook configuré.\n\n" +
        "Pour configurer l'ID:\n" +
        "1. Ouvrez les paramètres de l'organisateur\n" +
        "2. Entrez l'ID numérique de la page Facebook (format: 123456789012345)\n" +
        "3. Pour trouver l'ID d'une page:\n" +
        "   - Allez sur la page Facebook\n" +
        "   - Cliquez sur 'À propos' puis cherchez 'ID de page'\n" +
        "   - Ou utilisez: https://www.facebook.com/help/contact/571927962365970"
      );
      return;
    }

    // Validation basique de l'ID (doit être numérique)
    if (!/^\d+$/.test(selectedOrganizer.facebook_page_id)) {
      alert(
        "L'ID de page Facebook semble invalide.\n\n" +
        "L'ID doit être un nombre (format: 123456789012345).\n" +
        "Si vous avez utilisé un nom d'utilisateur (ex: @nompage), vous devez d'abord obtenir l'ID numérique."
      );
      return;
    }

    try {
      setFetchingEvents(true);
      setEvents([]);
      setSelectedEventIds(new Set());
      setImportResult(null);

      const response = await fetch("/api/facebook/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Inclure les cookies pour l'authentification
        body: JSON.stringify({
          facebookPageId: selectedOrganizer.facebook_page_id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || "Erreur lors de la récupération des événements";
        
        // Si erreur d'authentification, donner des instructions claires
        if (response.status === 401 || errorMessage.includes("Non authentifié") || errorMessage.includes("authentification")) {
          throw new Error(
            `Erreur d'authentification: ${errorMessage}\n\n` +
            `Détails: ${data.details || "Aucun détail"}\n\n` +
            `Actions possibles:\n` +
            `1. Vérifiez que vous êtes connecté en tant qu'admin\n` +
            `2. Rafraîchissez la page et reconnectez-vous si nécessaire\n` +
            `3. Vérifiez que votre session n'a pas expiré\n\n` +
            `Note: Le serveur lit automatiquement .env.local pour les variables d'environnement.`
          );
        }
        
        // Si c'est une erreur de token (code 200 ou OAuthException)
        if ((data.errorCode === 200 || data.errorType === "OAuthException") && data.errorCode !== 10) {
          // Utiliser le troubleshooting de l'API qui contient déjà les instructions détaillées
          const troubleshooting = data.troubleshooting || 
            "Le token semble avoir un problème. Vérifiez les logs serveur pour plus de détails.";
          
          throw new Error(
            `${errorMessage}\n\n${troubleshooting}\n\n` +
            `Détails techniques: Code ${data.errorCode}, Type: ${data.errorType || "N/A"}, Subcode: ${data.errorSubcode || "N/A"}`
          );
        }
        
        // Si c'est une erreur de permissions (code 10)
        if (data.errorCode === 10 || errorMessage.includes("pages_read_engagement") || errorMessage.includes("Page Public Content Access")) {
          // Utiliser le troubleshooting de l'API qui contient déjà les instructions détaillées
          const troubleshooting = data.troubleshooting || 
            "Le token n'a pas la permission 'pages_read_engagement'. " +
            "Vous devez obtenir un User Access Token avec cette permission, puis récupérer le Page Access Token via /me/accounts. " +
            "Voir docs/FACEBOOK_SETUP.md pour plus de détails.";
          
          throw new Error(
            `${errorMessage}\n\n${troubleshooting}`
          );
        }
        
        // Si c'est une erreur de token Facebook (token invalide ou Accounts Center)
        if (errorMessage.includes("Accounts Center") || data.errorCode === 190) {
          throw new Error(
            "Token d'accès invalide. Vous devez utiliser un Page Access Token, pas un User Access Token.\n\n" +
            "Pour obtenir un Page Access Token:\n" +
            "1. Allez sur https://developers.facebook.com/tools/explorer/\n" +
            "2. Obtenez un User Access Token avec les permissions pages_read_engagement\n" +
            "3. Faites une requête GET /me/accounts pour obtenir le Page Access Token de votre page\n" +
            "4. Ajoutez ce token dans FACEBOOK_ACCESS_TOKEN de votre .env.local\n" +
            "5. Redémarrez le serveur de développement (npm run dev)\n\n" +
            "Voir docs/FACEBOOK_SETUP.md pour plus de détails."
          );
        }
        
        // Si c'est une erreur liée à l'ID de page
        if (data.errorCode === 100 || errorMessage.includes("does not exist") || errorMessage.includes("cannot be loaded")) {
          const fullMessage = errorMessage;
          const troubleshooting = data.troubleshooting || "";
          throw new Error(
            `${fullMessage}\n\n` +
            (troubleshooting ? `${troubleshooting}\n\n` : "") +
            `ID de page utilisé: ${selectedOrganizer.facebook_page_id}\n\n` +
            `Assurez-vous que:\n` +
            `- L'ID de page est correct (format numérique)\n` +
            `- Le token a les bonnes permissions\n` +
            `- La page est accessible avec ce token`
          );
        }
        
        // Pour les autres erreurs, inclure les détails et le troubleshooting si disponible
        const fullErrorMessage = errorMessage + (data.details ? `\n\nDétails: ${data.details}` : "");
        const troubleshootingMsg = data.troubleshooting ? `\n\n${data.troubleshooting}` : "";
        throw new Error(fullErrorMessage + troubleshootingMsg);
      }

      setEvents(data.events || []);
    } catch (error) {
      console.error("Erreur lors de la récupération des événements:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Erreur lors de la récupération des événements Facebook"
      );
    } finally {
      setFetchingEvents(false);
    }
  }

  function toggleEventSelection(eventId: string) {
    const newSelection = new Set(selectedEventIds);
    if (newSelection.has(eventId)) {
      newSelection.delete(eventId);
    } else {
      newSelection.add(eventId);
    }
    setSelectedEventIds(newSelection);
  }

  async function importSelectedEvents() {
    if (selectedEventIds.size === 0) {
      alert("Veuillez sélectionner au moins un événement");
      return;
    }

    try {
      setImporting(true);
      setImportResult(null);

      const response = await fetch("/api/facebook/events/create-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Inclure les cookies pour l'authentification
        body: JSON.stringify({
          organizerId: selectedOrganizerId,
          organizerType: selectedOrganizer?.type || "organizer", // Passer le type
          eventIds: Array.from(selectedEventIds),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || "Erreur lors de l'importation";
        
        // Si erreur d'authentification, donner des instructions claires
        if (response.status === 401 || errorMessage.includes("Non authentifié") || errorMessage.includes("authentification")) {
          throw new Error(
            `Erreur d'authentification: ${errorMessage}\n\n` +
            `Détails: ${data.details || "Aucun détail"}\n\n` +
            `Actions possibles:\n` +
            `1. Vérifiez que vous êtes connecté en tant qu'admin\n` +
            `2. Rafraîchissez la page et reconnectez-vous si nécessaire\n` +
            `3. Vérifiez que votre session n'a pas expiré`
          );
        }
        
        throw new Error(errorMessage + (data.details ? `\n\nDétails: ${data.details}` : ""));
      }

      setImportResult({
        success: true,
        message: `${data.count || 0} demande(s) d'événement(s) créée(s) avec succès`,
        count: data.count,
      });

      // Clear selection and events
      setSelectedEventIds(new Set());
      setEvents([]);

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Erreur lors de l'importation:", error);
      setImportResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Erreur lors de l'importation des événements",
      });
    } finally {
      setImporting(false);
    }
  }

  const selectedOrganizer = organizers.find(
    (o) => o.id === selectedOrganizerId
  );
  const hasFacebookPageId = selectedOrganizer?.facebook_page_id != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer les événements Facebook</DialogTitle>
          <DialogDescription>
            Récupérez les événements Facebook d'un organisateur et transformez-les en demandes d'événements
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Sélection de l'organisateur */}
          <div className="space-y-2">
            <Label htmlFor="organizer">Organisateur</Label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des organisateurs...
              </div>
            ) : (
              <SelectSearchable
                options={organizers.map((organizer) => ({
                  value: organizer.id,
                  label: `${organizer.name}${organizer.type === "location" ? " (Lieu)" : ""}${!organizer.facebook_page_id ? " (Pas d'ID Facebook)" : ""}`,
                }))}
                value={selectedOrganizerId}
                onValueChange={setSelectedOrganizerId}
                placeholder="Sélectionnez un organisateur"
                searchPlaceholder="Rechercher un organisateur..."
              />
            )}
          </div>

          {/* Bouton pour récupérer les événements */}
          {selectedOrganizerId && hasFacebookPageId && (
            <Button
              onClick={fetchFacebookEvents}
              disabled={fetchingEvents}
              className="w-full"
            >
              {fetchingEvents ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Récupération des événements...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Récupérer les événements Facebook
                </>
              )}
            </Button>
          )}

          {selectedOrganizerId && !hasFacebookPageId && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Cet organisateur n'a pas d'ID de page Facebook configuré.
                Veuillez d'abord configurer l'ID dans les paramètres de l'organisateur.
              </AlertDescription>
            </Alert>
          )}

          {/* Liste des événements */}
          {events.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>
                  {events.length} événement(s) trouvé(s). Sélectionnez ceux à importer:
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedEventIds.size === events.length) {
                      setSelectedEventIds(new Set());
                    } else {
                      setSelectedEventIds(new Set(events.map((e) => e.id)));
                    }
                  }}
                >
                  {selectedEventIds.size === events.length
                    ? "Tout désélectionner"
                    : "Tout sélectionner"}
                </Button>
              </div>

              <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                {events.map((event) => {
                  const isSelected = selectedEventIds.has(event.id);
                  const startDate = event.start_time
                    ? new Date(event.start_time).toLocaleDateString("fr-FR", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Date non spécifiée";

                  return (
                    <div
                      key={event.id}
                      className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                        isSelected ? "bg-muted" : ""
                      }`}
                      onClick={() => toggleEventSelection(event.id)}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleEventSelection(event.id)}
                          className="mt-1 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 space-y-1">
                          <div className="font-medium">{event.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {startDate}
                          </div>
                          {event.place?.name && (
                            <div className="text-sm text-muted-foreground">
                              📍 {event.place.name}
                            </div>
                          )}
                          {event.description && (
                            <div className="text-sm text-muted-foreground line-clamp-2">
                              {event.description}
                            </div>
                          )}
                        </div>
                        {event.cover?.source && (
                          <img
                            src={event.cover.source}
                            alt={event.name}
                            className="w-20 h-20 object-cover rounded"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bouton d'importation */}
              {selectedEventIds.size > 0 && (
                <div className="space-y-2">
                  <Button
                    onClick={importSelectedEvents}
                    disabled={importing}
                    className="w-full"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importation en cours...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Importer {selectedEventIds.size} événement(s)
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Résultat de l'importation */}
          {importResult && (
            <Alert variant={importResult.success ? "default" : "destructive"}>
              {importResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{importResult.message}</AlertDescription>
            </Alert>
          )}

          {events.length === 0 && !fetchingEvents && selectedOrganizerId && hasFacebookPageId && (
            <div className="text-center text-muted-foreground py-8">
              Aucun événement trouvé. Cliquez sur "Récupérer les événements Facebook" pour charger les événements.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

