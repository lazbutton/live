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
} from "@/base_components/ui/table";
import { Button } from "@/base_components/ui/button";
import { Badge } from "@/base_components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/base_components/ui/card";
import { Input } from "@/base_components/ui/input";
import { Label } from "@/base_components/ui/label";
import { Textarea } from "@/base_components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/base_components/ui/dialog";
import { Check, X, Eye } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface UserRequest {
  id: string;
  email: string;
  name: string | null;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
}

export function UserRequestsManagement() {
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<UserRequest | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
        .order("requested_at", { ascending: false });

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
    } finally {
      setLoading(false);
    }
  }

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

  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestion des demandes d'utilisateurs</CardTitle>
        <CardDescription>
          Validez ou rejetez les demandes de création de comptes utilisateurs
        </CardDescription>
      </CardHeader>
      <CardContent>
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

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Date de demande</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Aucune demande trouvée
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">{request.email}</TableCell>
                    <TableCell>{request.name || "-"}</TableCell>
                    <TableCell>
                      {format(new Date(request.requested_at), "PPp", { locale: fr })}
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

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
        />
      </CardContent>
    </Card>
  );
}

function RequestDetailDialog({
  request,
  open,
  onOpenChange,
  onApprove,
  onReject,
}: {
  request: UserRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (notes?: string) => void;
  onReject: (notes?: string) => void;
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Détails de la demande</DialogTitle>
          <DialogDescription>Informations sur la demande de création de compte</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Email</Label>
            <p className="text-sm font-medium">{request.email}</p>
          </div>

          <div>
            <Label>Nom</Label>
            <p className="text-sm">{request.name || "-"}</p>
          </div>

          <div>
            <Label>Date de demande</Label>
            <p className="text-sm">
              {format(new Date(request.requested_at), "PPp", { locale: fr })}
            </p>
          </div>

          {request.reviewed_at && (
            <div>
              <Label>Revisé le</Label>
              <p className="text-sm">
                {format(new Date(request.reviewed_at), "PPp", { locale: fr })}
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

