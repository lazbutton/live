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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Eye, Search, Filter, Plus, Edit, Trash2, CheckCircle2, Archive } from "lucide-react";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTableView, MobileCard, MobileCardRow, MobileCardActions } from "./mobile-table-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Switch } from "@/components/ui/switch";

interface FeedbackObject {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface Feedback {
  id: string;
  user_id: string;
  feedback_object_id: string;
  description: string;
  status: "pending" | "read" | "resolved" | "archived";
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  feedback_object?: FeedbackObject;
  user?: {
    id: string;
    email?: string;
  };
}

export function FeedbackManagement() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [filteredFeedbacks, setFilteredFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [feedbackObjects, setFeedbackObjects] = useState<FeedbackObject[]>([]);
  const [isObjectDialogOpen, setIsObjectDialogOpen] = useState(false);
  const [selectedObject, setSelectedObject] = useState<FeedbackObject | null>(null);
  const [activeTab, setActiveTab] = useState<"feedbacks" | "types">("feedbacks");

  // États des filtres
  const [filterStatus, setFilterStatus] = useState<string[]>(["pending", "read"]);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const isMobile = useIsMobile();

  useEffect(() => {
    loadFeedbacks();
    loadFeedbackObjects();
  }, []);

  async function loadFeedbacks() {
    try {
      const { data: feedbacksData, error: feedbacksError } = await supabase
        .from("feedbacks")
        .select(`
          *,
          feedback_object:feedback_objects(*)
        `)
        .order("created_at", { ascending: false });

      if (feedbacksError) throw feedbacksError;

      // Récupérer les emails des utilisateurs séparément
      const userIds = [...new Set((feedbacksData || []).map((f) => f.user_id))];
      
      // Pour chaque user_id, on ne peut pas récupérer l'email directement depuis auth.users
      // On va simplement stocker le user_id et afficher "Utilisateur #{id}" ou essayer via une fonction
      const feedbacksWithUser = (feedbacksData || []).map((feedback) => ({
        ...feedback,
        user: { id: feedback.user_id } as { id: string; email?: string },
      }));

      setFeedbacks(feedbacksWithUser);
      setFilteredFeedbacks(feedbacksWithUser);
    } catch (error) {
      console.error("Erreur lors du chargement des feedbacks:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadFeedbackObjects() {
    try {
      const { data, error } = await supabase
        .from("feedback_objects")
        .select("*")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      setFeedbackObjects(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des types:", error);
    }
  }

  // Appliquer les filtres
  useEffect(() => {
    let filtered = [...feedbacks];

    // Filtre par statut (plusieurs statuts possibles)
    // Si "all" est sélectionné, on affiche tous les feedbacks (pas de filtre)
    if (filterStatus.length > 0 && !filterStatus.includes("all")) {
      filtered = filtered.filter((f) => filterStatus.includes(f.status));
    }

    // Filtre par type
    if (filterType !== "all") {
      filtered = filtered.filter((f) => f.feedback_object_id === filterType);
    }

    // Filtre par recherche textuelle
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((f) => {
        const descriptionMatch = f.description?.toLowerCase().includes(query);
        const typeMatch = f.feedback_object?.name?.toLowerCase().includes(query);
        const userMatch = (f.user as any)?.email?.toLowerCase().includes(query);
        return descriptionMatch || typeMatch || userMatch;
      });
    }

    setFilteredFeedbacks(filtered);
  }, [feedbacks, filterStatus, filterType, searchQuery]);

  async function updateFeedbackStatus(feedbackId: string, status: Feedback["status"], adminNotes?: string) {
    try {
      const { error } = await supabase
        .from("feedbacks")
        .update({
          status,
          admin_notes: adminNotes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", feedbackId);

      if (error) throw error;

      await loadFeedbacks();
      setIsDialogOpen(false);
      setSelectedFeedback(null);
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
      alert("Erreur lors de la mise à jour du feedback");
    }
  }

  async function saveFeedbackObject(object: Partial<FeedbackObject>) {
    try {
      if (selectedObject) {
        // Mise à jour - on garde l'ordre existant si non fourni
        const updateData = {
          ...object,
          display_order: object.display_order !== undefined ? object.display_order : selectedObject.display_order,
        };

        const { error, data } = await supabase
          .from("feedback_objects")
          .update(updateData)
          .eq("id", selectedObject.id)
          .select();

        if (error) {
          console.error("Erreur Supabase (update):", error);
          throw new Error(`Erreur lors de la mise à jour: ${error.message || JSON.stringify(error)}`);
        }
      } else {
        // Création - on calcule automatiquement l'ordre (max + 1)
        // On récupère tous les objets pour calculer le max (plus simple et plus fiable)
        const { data: existingObjects, error: selectError } = await supabase
          .from("feedback_objects")
          .select("display_order");

        let maxOrder = 0;

        if (selectError) {
          // Si erreur de select, on log mais on continue avec 0
          // Cela peut arriver si la table est vide ou en cas de problème de permissions
          console.warn("Impossible de récupérer l'ordre existant, utilisation de 0 par défaut:", selectError);
        } else if (existingObjects && existingObjects.length > 0) {
          // Calculer le max manuellement
          maxOrder = Math.max(
            ...existingObjects.map(obj => obj.display_order || 0),
            0
          );
        }

        const newObject = {
          ...object,
          display_order: maxOrder + 1,
        };

        const { error: insertError, data } = await supabase
          .from("feedback_objects")
          .insert([newObject])
          .select();

        if (insertError) {
          console.error("Erreur Supabase (insert):", insertError);
          throw new Error(`Erreur lors de la création: ${insertError.message || JSON.stringify(insertError)}`);
        }
      }

      await loadFeedbackObjects();
      setIsObjectDialogOpen(false);
      setSelectedObject(null);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      const errorMessage = error instanceof Error ? error.message : `Erreur inconnue: ${JSON.stringify(error)}`;
      alert(`Erreur lors de la sauvegarde du type:\n${errorMessage}`);
    }
  }

  async function deleteFeedbackObject(objectId: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce type ? Les feedbacks associés seront conservés mais ce type ne sera plus disponible.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("feedback_objects")
        .delete()
        .eq("id", objectId);

      if (error) throw error;

      await loadFeedbackObjects();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert("Erreur lors de la suppression du type");
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      read: "outline",
      resolved: "default",
      archived: "destructive",
    };

    const labels: Record<string, string> = {
      pending: "En attente",
      read: "Lu",
      resolved: "Résolu",
      archived: "Archivé",
    };

    return (
      <Badge variant={variants[status] || "secondary"}>{labels[status] || status}</Badge>
    );
  };

  const pendingCount = feedbacks.filter((f) => f.status === "pending").length;

  if (loading) {
    return <div className="text-center py-8">Chargement des feedbacks...</div>;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gestion des feedbacks</CardTitle>
              <CardDescription>
                Gérez les feedbacks utilisateurs et les types de feedback
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b">
            <button
              onClick={() => setActiveTab("feedbacks")}
              className={`px-4 py-2 font-medium transition-colors cursor-pointer ${
                activeTab === "feedbacks"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Feedbacks ({feedbacks.length})
              {pendingCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingCount}
                </Badge>
              )}
            </button>
            <button
              onClick={() => setActiveTab("types")}
              className={`px-4 py-2 font-medium transition-colors cursor-pointer ${
                activeTab === "types"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Types ({feedbackObjects.length})
            </button>
          </div>

          {activeTab === "feedbacks" && (
            <>
              {/* Filtres */}
              <div className="mb-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Rechercher par description, type, email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="min-h-[44px] text-base"
                    />
                  </div>
                  <div className="w-full sm:w-[240px]">
                    <MultiSelect
                      options={[
                        { label: "Tout", value: "all" },
                        { label: "En attente", value: "pending" },
                        { label: "Lu", value: "read" },
                        { label: "Résolu", value: "resolved" },
                        { label: "Archivé", value: "archived" },
                      ]}
                      selected={filterStatus}
                      onChange={(selected) => {
                        // Si "Tout" est sélectionné, on garde seulement "all"
                        if (selected.includes("all")) {
                          // Si "all" vient d'être ajouté, on garde seulement "all"
                          if (!filterStatus.includes("all")) {
                            setFilterStatus(["all"]);
                          } else {
                            // Si "all" était déjà sélectionné et qu'on ajoute autre chose, on retire "all"
                            setFilterStatus(selected.filter((s) => s !== "all"));
                          }
                        } else {
                          // Si on sélectionne autre chose sans "all", on retire "all" s'il était là
                          setFilterStatus(selected);
                        }
                      }}
                      placeholder="Sélectionner les statuts"
                    />
                  </div>
                  <div className="w-full sm:w-[200px]">
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="min-h-[44px] text-base">
                        <SelectValue placeholder="Tous les types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les types</SelectItem>
                        {feedbackObjects
                          .filter((obj) => obj.is_active)
                          .map((obj) => (
                            <SelectItem key={obj.id} value={obj.id}>
                              {obj.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {pendingCount > 0 && (
                <div className="mb-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium">
                    {pendingCount} feedback{pendingCount > 1 ? "s" : ""} en attente
                  </p>
                </div>
              )}

              <MobileTableView
                desktopView={
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Utilisateur</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredFeedbacks.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              Aucun feedback trouvé
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredFeedbacks.map((feedback) => (
                            <TableRow key={feedback.id}>
                              <TableCell>
                                <Badge variant="outline">
                                  {feedback.feedback_object?.name || "Inconnu"}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-md">
                                <p className="truncate">{feedback.description}</p>
                              </TableCell>
                              <TableCell>
                                {(feedback.user as any)?.email || `Utilisateur ${feedback.user_id.slice(0, 8)}...`}
                              </TableCell>
                              <TableCell>
                                {formatDateWithoutTimezone(feedback.created_at, "PPp")}
                              </TableCell>
                              <TableCell>{getStatusBadge(feedback.status)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setSelectedFeedback(feedback);
                                          setIsDialogOpen(true);
                                        }}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Voir les détails</p>
                                    </TooltipContent>
                                  </Tooltip>
                                  {feedback.status === "pending" && (
                                    <>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => updateFeedbackStatus(feedback.id, "read")}
                                          >
                                            Marquer lu
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Marquer comme lu</p>
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => updateFeedbackStatus(feedback.id, "resolved")}
                                          >
                                            Résoudre
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Marquer comme résolu</p>
                                        </TooltipContent>
                                      </Tooltip>
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
                }
                mobileView={
                  filteredFeedbacks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Aucun feedback trouvé
                    </div>
                  ) : (
                    filteredFeedbacks.map((feedback) => (
                      <MobileCard
                        key={feedback.id}
                        onClick={() => {
                          setSelectedFeedback(feedback);
                          setIsDialogOpen(true);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <Badge variant="outline">
                            {feedback.feedback_object?.name || "Inconnu"}
                          </Badge>
                          {getStatusBadge(feedback.status)}
                        </div>
                        <MobileCardRow
                          label="Description"
                          value={feedback.description}
                        />
                        <MobileCardRow
                          label="Utilisateur"
                          value={(feedback.user as any)?.email || `Utilisateur ${feedback.user_id.slice(0, 8)}...`}
                        />
                        <MobileCardRow
                          label="Date"
                          value={formatDateWithoutTimezone(feedback.created_at, "PPp")}
                        />
                        <MobileCardActions>
                          {feedback.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 min-h-[44px]"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  updateFeedbackStatus(feedback.id, "read");
                                }}
                              >
                                Marquer lu
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 min-h-[44px]"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  updateFeedbackStatus(feedback.id, "resolved");
                                }}
                              >
                                Résoudre
                              </Button>
                            </>
                          )}
                        </MobileCardActions>
                      </MobileCard>
                    ))
                  )
                }
              />
            </>
          )}

          {activeTab === "types" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setSelectedObject(null);
                    setIsObjectDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter un type
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Ordre</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedbackObjects.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Aucun type de feedback
                        </TableCell>
                      </TableRow>
                    ) : (
                      feedbackObjects.map((obj) => (
                        <TableRow key={obj.id}>
                          <TableCell className="font-medium">{obj.name}</TableCell>
                          <TableCell>{obj.description || "-"}</TableCell>
                          <TableCell>{obj.display_order}</TableCell>
                          <TableCell>
                            <Badge variant={obj.is_active ? "default" : "secondary"}>
                              {obj.is_active ? "Actif" : "Inactif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedObject(obj);
                                      setIsObjectDialogOpen(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Modifier le type</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => deleteFeedbackObject(obj.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Supprimer le type</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog détail feedback */}
      <FeedbackDetailDialog
        feedback={selectedFeedback}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onUpdateStatus={updateFeedbackStatus}
      />

      {/* Dialog type feedback */}
      <FeedbackObjectDialog
        object={selectedObject}
        open={isObjectDialogOpen}
        onOpenChange={setIsObjectDialogOpen}
        onSave={saveFeedbackObject}
      />
      </div>
    </TooltipProvider>
  );
}

function FeedbackDetailDialog({
  feedback,
  open,
  onOpenChange,
  onUpdateStatus,
}: {
  feedback: Feedback | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: string, status: Feedback["status"], notes?: string) => void;
}) {
  const [adminNotes, setAdminNotes] = useState("");

  useEffect(() => {
    if (feedback) {
      setAdminNotes(feedback.admin_notes || "");
    } else {
      setAdminNotes("");
    }
  }, [feedback, open]);

  if (!feedback) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Détails du feedback</DialogTitle>
          <DialogDescription>
            Informations sur le feedback utilisateur
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Type</Label>
            <p className="text-sm font-medium">
              {feedback.feedback_object?.name || "Inconnu"}
            </p>
          </div>

          <div>
            <Label>Description</Label>
            <p className="text-sm whitespace-pre-wrap">{feedback.description}</p>
          </div>

          <div>
            <Label>Utilisateur</Label>
            <p className="text-sm">{(feedback.user as any)?.email || `Utilisateur ${feedback.user_id.slice(0, 8)}...`}</p>
          </div>

          <div>
            <Label>Date de création</Label>
            <p className="text-sm">
              {formatDateWithoutTimezone(feedback.created_at, "PPp")}
            </p>
          </div>

          <div>
            <Label>Statut</Label>
            <div className="mt-1">
              <Badge
                variant={
                  feedback.status === "pending"
                    ? "secondary"
                    : feedback.status === "resolved"
                    ? "default"
                    : feedback.status === "archived"
                    ? "destructive"
                    : "outline"
                }
              >
                {feedback.status === "pending"
                  ? "En attente"
                  : feedback.status === "read"
                  ? "Lu"
                  : feedback.status === "resolved"
                  ? "Résolu"
                  : "Archivé"}
              </Badge>
            </div>
          </div>

          <div>
            <Label htmlFor="adminNotes">Notes admin</Label>
            <Textarea
              id="adminNotes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Ajoutez des notes internes..."
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
            {feedback.status !== "read" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onUpdateStatus(feedback.id, "read", adminNotes);
                }}
              >
                Marquer lu
              </Button>
            )}
            {feedback.status !== "resolved" && (
              <Button
                type="button"
                onClick={() => {
                  onUpdateStatus(feedback.id, "resolved", adminNotes);
                }}
              >
                Résoudre
              </Button>
            )}
            {feedback.status !== "archived" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onUpdateStatus(feedback.id, "archived", adminNotes);
                }}
              >
                <Archive className="mr-2 h-4 w-4" />
                Archiver
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackObjectDialog({
  object,
  open,
  onOpenChange,
  onSave,
}: {
  object: FeedbackObject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (object: Partial<FeedbackObject>) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (object) {
      setName(object.name || "");
      setDescription(object.description || "");
      setIsActive(object.is_active ?? true);
    } else {
      setName("");
      setDescription("");
      setIsActive(true);
    }
  }, [object, open]);

  function handleSubmit() {
    if (!name.trim()) {
      alert("Le nom est requis");
      return;
    }

    const objectToSave: Partial<FeedbackObject> = {
      name: name.trim(),
      description: description.trim() || null,
      is_active: isActive,
    };

    // Si c'est une modification, on garde l'ordre existant (sera géré dans saveFeedbackObject)
    // Ne pas inclure display_order ici, il sera géré automatiquement

    onSave(objectToSave);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {object ? "Modifier le type" : "Ajouter un type de feedback"}
          </DialogTitle>
          <DialogDescription>
            Configurez un type de feedback que les utilisateurs pourront sélectionner
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Nom *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Bug / Erreur"
              className="min-h-[44px] text-base"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description du type de feedback"
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="isActive"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="isActive">Type actif</Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="button" onClick={handleSubmit}>
              {object ? "Modifier" : "Ajouter"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

