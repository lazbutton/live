"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, Eye, Search, Filter, XCircle } from "lucide-react";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import { useRouter } from "next/navigation";
import { MobileTableView, MobileCard, MobileCardRow, MobileCardActions } from "./mobile-table-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserRequest {
  id: string;
  email: string | null;
  name: string | null;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  request_type?: "user_account" | "event_creation";
  event_data?: {
    title?: string;
    description?: string;
    date?: string;
    end_date?: string;
    end_time?: string;
    category?: string;
    location_id?: string;
    organizer_id?: string;
    price?: number;
    address?: string;
    capacity?: number;
    image_url?: string;
    door_opening_time?: string;
    external_url?: string;
    external_url_label?: string;
    [key: string]: any; // Pour les champs supplémentaires
  };
  requested_by?: string | null;
}

export function UserRequestsManagement() {
  const router = useRouter();
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<UserRequest | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // États des filtres
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [filterType, setFilterType] = useState<"all" | "user_account" | "event_creation">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    try {
      // Vérifier d'abord la session
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error("Erreur d'authentification:", authError);
        setLoading(false);
        return;
      }

      console.log("Utilisateur connecté:", {
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role
      });

      const { data, error } = await supabase
        .from("user_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .order("request_type", { ascending: true });

      if (error) {
        // Afficher toutes les propriétés de l'erreur
        console.error("Erreur Supabase complète:", JSON.stringify(error, null, 2));
        console.error("Erreur Supabase détails:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          // Afficher toutes les propriétés
          allKeys: Object.keys(error)
        });
        
        // Vérifier si c'est une erreur de table inexistante
        if (error.code === "42P01" || error.message?.includes("does not exist")) {
          alert("La table 'user_requests' n'existe pas. Veuillez appliquer la migration 003.");
        } else if (error.code === "42501" || error.message?.includes("permission denied")) {
          alert("Permission refusée. Vérifiez que vous êtes admin et que la migration 005 a été appliquée.");
        }
        
        setRequests([]);
        return;
      }

      console.log("Demandes chargées avec succès:", data?.length || 0);
      setRequests(data || []);
      setFilteredRequests(data || []);
    } catch (error: any) {
      // Erreur générale
      console.error("Erreur générale:", error);
      console.error("Type d'erreur:", typeof error);
      console.error("Erreur stringifiée:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      
      if (error instanceof Error) {
        console.error("Message:", error.message);
        console.error("Stack:", error.stack);
      }
      
      setRequests([]);
      setFilteredRequests([]);
    } finally {
      setLoading(false);
    }
  }

  // Appliquer les filtres
  useEffect(() => {
    let filtered = [...requests];

    // Filtre par statut
    if (filterStatus !== "all") {
      filtered = filtered.filter((r) => r.status === filterStatus);
    }

    // Filtre par type
    if (filterType !== "all") {
      filtered = filtered.filter((r) => r.request_type === filterType);
    }

    // Filtre par recherche textuelle
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r) => {
        const nameMatch = r.name?.toLowerCase().includes(query);
        const emailMatch = r.email?.toLowerCase().includes(query);
        const eventTitleMatch = r.event_data?.title?.toLowerCase().includes(query);
        const eventDescriptionMatch = r.event_data?.description?.toLowerCase().includes(query);
        return nameMatch || emailMatch || eventTitleMatch || eventDescriptionMatch;
      });
    }

    setFilteredRequests(filtered);
  }, [requests, filterStatus, filterType, searchQuery]);

  async function updateRequestStatus(
    requestId: string,
    status: "approved" | "rejected",
    notes?: string
  ) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("user_requests")
        .update({
          status,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          notes: notes || null,
        })
        .eq("id", requestId);

      if (error) throw error;
      await loadRequests();
      setIsDialogOpen(false);
      setSelectedRequest(null);
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
      alert("Erreur lors de la mise à jour de la demande");
    }
  }

  function openEventCreatePage(request: UserRequest) {
    router.push(`/admin/requests/${request.id}/create-event`);
  }


  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      approved: "default",
      pending: "secondary",
      rejected: "destructive",
    };

    const labels: Record<string, string> = {
      approved: "Approuvé",
      pending: "En attente",
      rejected: "Rejeté",
    };

    return (
      <Badge variant={variants[status] || "secondary"}>{labels[status] || status}</Badge>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Chargement des demandes...</div>;
  }

  const pendingRequests = filteredRequests.filter((r) => r.status === "pending");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestion des demandes</CardTitle>
        <CardDescription>
          Validez les demandes de création de comptes utilisateurs et les demandes d'événements
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filtres */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Recherche textuelle */}
            <div className="flex-1">
              <Input
                placeholder="Rechercher par nom, email, titre d'événement..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-h-[44px] text-base"
              />
            </div>
            
            {/* Filtre par statut */}
            <div className="w-full sm:w-[180px]">
              <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                <SelectTrigger className="min-h-[44px] text-base">
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="approved">Approuvées</SelectItem>
                  <SelectItem value="rejected">Rejetées</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Filtre par type */}
            <div className="w-full sm:w-[200px]">
              <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                <SelectTrigger className="min-h-[44px] text-base">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="user_account">Comptes utilisateur</SelectItem>
                  <SelectItem value="event_creation">Événements</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Statistiques */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>
              Total: <span className="font-medium text-foreground">{filteredRequests.length}</span>
            </span>
            <span>
              En attente: <span className="font-medium text-foreground">{pendingRequests.length}</span>
            </span>
            {(filterStatus !== "all" || filterType !== "all" || searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterStatus("all");
                  setFilterType("all");
                  setSearchQuery("");
                }}
                className="h-auto py-1 px-2 text-xs cursor-pointer"
              >
                Réinitialiser les filtres
              </Button>
            )}
          </div>
        </div>

        {pendingRequests.length > 0 && (
          <div className="mb-4 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium">
              {pendingRequests.length} demande{pendingRequests.length > 1 ? "s" : ""} en attente
            </p>
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div className="mb-4 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              Aucune demande trouvée. Si vous voyez une erreur dans la console, vérifiez :
            </p>
            <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside">
              <li>La migration 003 (user_requests) a été appliquée</li>
              <li>La migration 005 (fix_user_requests_rls) a été appliquée</li>
              <li>Vous êtes bien connecté avec un compte admin</li>
            </ul>
          </div>
        )}

        <MobileTableView
          desktopView={
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Email / Titre</TableHead>
                    <TableHead>Nom / Catégorie</TableHead>
                    <TableHead>Date de demande</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {requests.length === 0 
                          ? "Aucune demande trouvée" 
                          : "Aucune demande ne correspond aux filtres"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map((request) => {
                      const isEventRequest = request.request_type === "event_creation";
                      return (
                        <TableRow key={request.id}>
                          <TableCell>
                            <Badge variant={isEventRequest ? "default" : "secondary"}>
                              {isEventRequest ? "Événement" : "Compte"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {isEventRequest
                              ? request.event_data?.title || "-"
                              : request.email || "-"}
                          </TableCell>
                          <TableCell>
                            {isEventRequest
                              ? request.event_data?.category || "-"
                              : request.name || "-"}
                          </TableCell>
                          <TableCell>
                            {formatDateWithoutTimezone(request.requested_at, "PPp")}
                          </TableCell>
                          <TableCell>{getStatusBadge(request.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setIsDialogOpen(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {request.status === "pending" && (
                                <>
                                  {isEventRequest ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openEventCreatePage(request)}
                                        title="Créer un événement avec modification"
                                        className="cursor-pointer"
                                      >
                                        Éditer
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateRequestStatus(request.id, "approved")}
                                      >
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateRequestStatus(request.id, "rejected")}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          }
          mobileView={
            filteredRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {requests.length === 0 
                  ? "Aucune demande trouvée" 
                  : "Aucune demande ne correspond aux filtres"}
              </div>
            ) : (
              filteredRequests.map((request) => {
                const isEventRequest = request.request_type === "event_creation";
                return (
                  <MobileCard
                    key={request.id}
                    onClick={() => {
                      setSelectedRequest(request);
                      setIsDialogOpen(true);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge variant={isEventRequest ? "default" : "secondary"}>
                        {isEventRequest ? "Événement" : "Compte"}
                      </Badge>
                      {getStatusBadge(request.status)}
                    </div>
                    <MobileCardRow
                      label={isEventRequest ? "Titre" : "Email"}
                      value={
                        isEventRequest
                          ? request.event_data?.title || "-"
                          : request.email || "-"
                      }
                    />
                    <MobileCardRow
                      label={isEventRequest ? "Catégorie" : "Nom"}
                      value={
                        isEventRequest
                          ? request.event_data?.category || "-"
                          : request.name || "-"
                      }
                    />
                    <MobileCardRow
                      label="Date de demande"
                      value={formatDateWithoutTimezone(request.requested_at, "PPp")}
                    />
                    <MobileCardActions>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 min-h-[44px]"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setSelectedRequest(request);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Détails
                      </Button>
                      {request.status === "pending" && (
                        <>
                          {isEventRequest ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 min-h-[44px]"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  openEventCreatePage(request);
                                }}
                              >
                                Éditer
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 min-h-[44px]"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  updateRequestStatus(request.id, "approved");
                                }}
                              >
                                <Check className="h-4 w-4 mr-2" />
                                Approuver
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 min-h-[44px]"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  updateRequestStatus(request.id, "rejected");
                                }}
                              >
                                <X className="h-4 w-4 mr-2" />
                                Rejeter
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </MobileCardActions>
                  </MobileCard>
                );
              })
            )
          }
        />

        <RequestDetailDialog
          request={selectedRequest}
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onApprove={(notes) => {
            if (selectedRequest) {
              updateRequestStatus(selectedRequest.id, "approved", notes);
            }
          }}
          onReject={(notes) => {
            if (selectedRequest) {
              updateRequestStatus(selectedRequest.id, "rejected", notes);
            }
          }}
          onConvert={() => {
            if (selectedRequest) {
              openEventCreatePage(selectedRequest);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

// EventCreateDialog moved to separate page: /admin/requests/[id]/create-event
// This component is no longer used - code removed

function RequestDetailDialog({
  request,
  open,
  onOpenChange,
  onApprove,
  onReject,
  onConvert,
}: {
  request: UserRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (notes?: string) => void;
  onReject: (notes?: string) => void;
  onConvert?: () => void;
}) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (request) {
      setNotes(request.notes || "");
    } else {
      setNotes("");
    }
  }, [request, open]);

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Détails de la demande</DialogTitle>
          <DialogDescription>
            {request.request_type === "event_creation"
              ? "Informations sur la demande de création d'événement"
              : "Informations sur la demande de création de compte"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {request.request_type === "event_creation" ? (
            <>
              <div>
                <Label>Type</Label>
                <p className="text-sm font-medium">Demande d'événement</p>
              </div>
              <div>
                <Label>Titre</Label>
                <p className="text-sm font-medium">{request.event_data?.title || "-"}</p>
              </div>
              {request.event_data?.description && (
                <div>
                  <Label>Description</Label>
                  <p className="text-sm whitespace-pre-wrap">{request.event_data.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Catégorie</Label>
                  <p className="text-sm">{request.event_data?.category || "-"}</p>
                </div>
                {request.event_data?.date && (
                  <div>
                    <Label>Date de début</Label>
                    <p className="text-sm">
                      {formatDateWithoutTimezone(request.event_data?.date, "PPp")}
                    </p>
                  </div>
                )}
                {request.event_data?.end_date && (
                  <div>
                    <Label>Date de fin</Label>
                    <p className="text-sm">
                      {formatDateWithoutTimezone(request.event_data?.end_date, "PPp")}
                    </p>
                  </div>
                )}
              </div>
              {request.event_data?.end_time && (
                <div>
                  <Label>Heure de fin</Label>
                  <p className="text-sm">{request.event_data.end_time}</p>
                </div>
              )}
              {request.event_data?.door_opening_time && (
                <div>
                  <Label>Heure d'ouverture des portes</Label>
                  <p className="text-sm">{request.event_data.door_opening_time}</p>
                </div>
              )}
              {request.event_data?.price !== undefined && request.event_data?.price !== null && (
                <div>
                  <Label>Prix</Label>
                  <p className="text-sm">{request.event_data.price}€</p>
                </div>
              )}
              {request.event_data?.capacity && (
                <div>
                  <Label>Capacité</Label>
                  <p className="text-sm">{request.event_data.capacity} personnes</p>
                </div>
              )}
              {request.event_data?.address && (
                <div>
                  <Label>Adresse</Label>
                  <p className="text-sm">{request.event_data.address}</p>
                </div>
              )}
              {request.event_data?.external_url && (
                <div>
                  <Label>{request.event_data?.external_url_label || "Lien externe"}</Label>
                  <p className="text-sm">
                    <a href={request.event_data.external_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {request.event_data.external_url}
                    </a>
                  </p>
                </div>
              )}
              {request.email && (
                <div>
                  <Label>Email du demandeur</Label>
                  <p className="text-sm">{request.email}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <Label>Email</Label>
                <p className="text-sm font-medium">{request.email || "-"}</p>
              </div>
              <div>
                <Label>Nom</Label>
                <p className="text-sm">{request.name || "-"}</p>
              </div>
            </>
          )}

          <div>
            <Label>Date de demande</Label>
            <p className="text-sm">
              {formatDateWithoutTimezone(request.requested_at, "PPp")}
            </p>
          </div>

          {request.reviewed_at && (
            <div>
              <Label>Revisé le</Label>
              <p className="text-sm">
                {formatDateWithoutTimezone(request.reviewed_at, "PPp")}
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ajoutez des notes sur cette demande..."
              rows={4}
            />
          </div>

          {request.status === "pending" && (
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              {request.request_type === "event_creation" ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      onReject(notes);
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Rejeter
                  </Button>
                  {onConvert && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        onConvert();
                      }}
                    >
                      Éditer puis créer
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      onReject(notes);
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Rejeter
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      onApprove(notes);
                    }}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Approuver
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
