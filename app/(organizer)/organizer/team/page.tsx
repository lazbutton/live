"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OrganizerLayout } from "@/app/(organizer)/organizer/components/organizer-layout";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  UserPlus,
  UserMinus,
  Edit2,
  History,
  Mail,
  Shield,
  User,
  Eye,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
} from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import { isOwnerOfOrganizer, getActiveOrganizer } from "@/lib/auth-helpers";
import { getUserOrganizers } from "@/lib/auth";

interface TeamMember {
  id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
  email?: string;
}

interface AuditLog {
  id: string;
  action_type?: string;
  action?: string; // Pour compatibilité
  user_id: string | null;
  user_email?: string | null;
  description?: string | null;
  old_value: any;
  new_value: any;
  created_at: string;
}

interface Organizer {
  id: string;
  name: string;
  logo_url: string | null;
}

function TeamManagementContent() {
  const router = useRouter();
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();

  const [organizers, setOrganizers] = useState<any[]>([]);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string | null>(null);
  const [organizer, setOrganizer] = useState<Organizer | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"owner" | "editor" | "viewer">("owner");
  const [sendingInvite, setSendingInvite] = useState(false);

  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  useEffect(() => {
    checkAccessAndLoadData();
  }, []);

  useEffect(() => {
    if (selectedOrganizerId) {
      loadOrganizerData(selectedOrganizerId);
    }
  }, [selectedOrganizerId]);

  async function checkAccessAndLoadData() {
    try {
      // Vérifier les permissions
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setHasAccess(false);
        router.push("/admin/login");
        return;
      }

      // Charger les organisateurs de l'utilisateur
      const userOrgs = await getUserOrganizers();
      const ownerOrgs = userOrgs.filter(org => org.role === "owner");

      if (ownerOrgs.length === 0) {
        setHasAccess(false);
        showAlert({
          title: "Accès refusé",
          description: "Vous devez être propriétaire d'au moins un organisateur pour accéder à cette page.",
          confirmText: "OK",
        });
        router.push("/organizer");
        return;
      }

      setOrganizers(ownerOrgs);
      setHasAccess(true);

      // Sélectionner le premier organisateur par défaut
      if (ownerOrgs.length > 0) {
        const activeOrg = await getActiveOrganizer();
        if (activeOrg && ownerOrgs.some(org => org.organizer_id === activeOrg.organizer_id)) {
          setSelectedOrganizerId(activeOrg.organizer_id);
        } else {
          setSelectedOrganizerId(ownerOrgs[0].organizer_id);
        }
      }
    } catch (error) {
      console.error("Erreur lors de la vérification d'accès:", error);
      setHasAccess(false);
    }
  }

  async function loadOrganizerData(organizerId: string) {
    setLoading(true);
    await Promise.all([loadOrganizer(organizerId), loadMembers(organizerId), loadInvitations(organizerId), loadAuditLogs(organizerId)]);
    setLoading(false);
  }

  async function loadOrganizer(organizerId: string) {
    try {
      // Essayer d'abord dans la table organizers
      const { data: organizerData, error: orgError } = await supabase
        .from("organizers")
        .select("id, name, logo_url")
        .eq("id", organizerId)
        .single();

      if (!orgError && organizerData) {
        setOrganizer({
          id: organizerData.id,
          name: organizerData.name,
          logo_url: organizerData.logo_url,
        });
        return;
      }

      // Si pas trouvé, chercher dans locations (lieu-organisateur)
      const { data: locationData, error: locError } = await supabase
        .from("locations")
        .select("id, name, image_url")
        .eq("id", organizerId)
        .eq("is_organizer", true)
        .single();

      if (locError || !locationData) {
        throw new Error("Organisateur non trouvé");
      }

      setOrganizer({
        id: locationData.id,
        name: locationData.name,
        logo_url: locationData.image_url,
      });
    } catch (error) {
      console.error("Erreur lors du chargement de l'organisateur:", error);
      showAlert({
        title: "Erreur",
        description: "Impossible de charger l'organisateur",
        confirmText: "OK",
      });
    }
  }

  async function loadMembers(organizerId: string) {
    setLoadingMembers(true);
    try {
      const { data: userOrgs, error } = await supabase
        .from("user_organizers")
        .select("id, user_id, role, created_at")
        .eq("organizer_id", organizerId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Récupérer les emails via RPC
      let membersWithEmails = userOrgs || [];
      
      try {
        const userIds = (userOrgs || []).map((uo: any) => uo.user_id);
        if (userIds.length > 0) {
          const { data: emailsData, error: emailsError } = await supabase.rpc(
            "get_user_emails",
            { user_ids: userIds }
          );

          if (!emailsError && emailsData) {
            const emailMap = new Map(
              emailsData.map((e: any) => [e.user_id, e.email])
            );
            membersWithEmails = (userOrgs || []).map((uo: any) => ({
              ...uo,
              email: emailMap.get(uo.user_id) || null,
            }));
          }
        }
      } catch (error) {
        console.error("Erreur lors de la récupération des emails:", error);
      }

      setMembers(membersWithEmails);
    } catch (error) {
      console.error("Erreur:", error);
      showAlert({
        title: "Erreur",
        description: "Erreur lors du chargement des membres",
        confirmText: "OK",
      });
    } finally {
      setLoadingMembers(false);
    }
  }

  async function loadInvitations(organizerId: string) {
    setLoadingInvitations(true);
    try {
      const { data, error } = await supabase
        .from("organizer_invitations")
        .select("*")
        .eq("organizer_id", organizerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvitations(data || []);
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoadingInvitations(false);
    }
  }

  async function loadAuditLogs(organizerId: string) {
    setLoadingAudit(true);
    try {
      const response = await fetch(`/api/admin/organizers/${organizerId}/audit`);
      if (!response.ok) {
        if (response.status === 403) {
          // Accès refusé - l'utilisateur n'est peut-être pas propriétaire
          setAuditLogs([]);
          return;
        }
        // Récupérer le message d'erreur de la réponse
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Erreur ${response.status}: ${response.statusText}`;
        console.error("Erreur lors du chargement de l'historique:", errorMessage);
        // Ne pas bloquer l'interface, juste afficher un historique vide
        setAuditLogs([]);
        return;
      }
      const data = await response.json();
      // L'API retourne { logs: [...] }
      const logs = data.logs || data.auditLogs || [];
      setAuditLogs(logs.map((log: any) => ({
        ...log,
        action_type: log.action || log.action_type, // Normaliser le nom du champ
        user_email: log.target_email || log.user_email,
      })));
    } catch (error: any) {
      console.error("Erreur lors du chargement de l'historique:", error);
      // Ne pas bloquer l'interface, juste afficher un historique vide
      setAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  }

  async function sendInvitation() {
    if (!selectedOrganizerId) return;

    if (!newUserEmail.trim() || !newUserEmail.includes("@")) {
      showAlert({
        title: "Email invalide",
        description: "Veuillez entrer une adresse email valide",
        confirmText: "OK",
      });
      return;
    }

    setSendingInvite(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const response = await fetch(`/api/admin/organizers/${selectedOrganizerId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUserEmail.trim().toLowerCase(),
          role: newUserRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Impossible d'envoyer l'invitation");
      }

      showAlert({
        title: "Invitation envoyée",
        description: `Invitation envoyée à ${newUserEmail} !`,
        confirmText: "OK",
      });

      setNewUserEmail("");
      setShowInviteDialog(false);
      await loadInvitations(selectedOrganizerId);
    } catch (error: any) {
      console.error("Erreur:", error);
      showAlert({
        title: "Erreur",
        description: error.message || "Erreur lors de l'envoi de l'invitation",
        confirmText: "OK",
      });
    } finally {
      setSendingInvite(false);
    }
  }

  async function removeMember(userId: string, memberEmail?: string) {
    if (!selectedOrganizerId) return;

    showConfirm({
      title: "Retirer le membre",
      description: `Êtes-vous sûr de vouloir retirer ${memberEmail || "ce membre"} de l'équipe ?`,
      variant: "destructive",
      onConfirm: async () => {
        try {
          const response = await fetch(
            `/api/admin/organizers/${selectedOrganizerId}/users?user_id=${userId}`,
            { method: "DELETE" }
          );

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Erreur lors de la suppression");
          }

          await loadMembers(selectedOrganizerId);
        } catch (error: any) {
          showAlert({
            title: "Erreur",
            description: error.message || "Erreur lors de la suppression",
            confirmText: "OK",
          });
        }
      },
    });
  }

  async function updateRole(userId: string, newRole: "owner" | "editor" | "viewer") {
    if (!selectedOrganizerId) return;

    try {
      const response = await fetch(`/api/admin/organizers/${selectedOrganizerId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: userId, // C'est l'ID utilisateur, pas l'email
          role: newRole,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }

      await loadMembers(selectedOrganizerId);
    } catch (error: any) {
      showAlert({
        title: "Erreur",
        description: error.message || "Erreur lors de la mise à jour",
        confirmText: "OK",
      });
    }
  }

  function getRoleBadgeVariant(role: string) {
    switch (role) {
      case "owner":
        return "default";
      case "editor":
        return "secondary";
      case "viewer":
        return "outline";
      default:
        return "outline";
    }
  }

  function getRoleLabel(role: string) {
    switch (role) {
      case "owner":
        return "Propriétaire";
      case "editor":
        return "Éditeur";
      case "viewer":
        return "Visualiseur";
      default:
        return role;
    }
  }

  function getActionLabel(actionType: string) {
    const labels: Record<string, string> = {
      user_added: "Membre ajouté",
      user_removed: "Membre retiré",
      role_changed: "Rôle modifié",
      invitation_sent: "Invitation envoyée",
      invitation_accepted: "Invitation acceptée",
      invitation_rejected: "Invitation rejetée",
      invitation_expired: "Invitation expirée",
      organizer_updated: "Organisateur modifié",
      organizer_created: "Organisateur créé",
      organizer_deleted: "Organisateur supprimé",
    };
    return labels[actionType] || actionType;
  }

  if (loading || hasAccess === null) {
    return (
      <OrganizerLayout title="Gestion d'équipe">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </OrganizerLayout>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  if (!selectedOrganizerId) {
    return (
      <OrganizerLayout title="Gestion d'équipe">
        <Card>
          <CardHeader>
            <CardTitle>Aucun organisateur</CardTitle>
            <CardDescription>Vous n'êtes propriétaire d'aucun organisateur.</CardDescription>
          </CardHeader>
        </Card>
      </OrganizerLayout>
    );
  }

  return (
    <OrganizerLayout title="Gestion d'équipe">
      <div className="space-y-6">
        {/* Sélecteur d'organisateur */}
        {organizers.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Organisateur</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedOrganizerId || ""} onValueChange={setSelectedOrganizerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un organisateur" />
                </SelectTrigger>
                <SelectContent>
                  {organizers.map((org) => (
                    <SelectItem key={org.organizer_id} value={org.organizer_id}>
                      {org.organizer?.name || org.organizer_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* En-tête avec info organisateur */}
        {organizer && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                {organizer.logo_url && (
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={organizer.logo_url} alt={organizer.name} />
                    <AvatarFallback>{organizer.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                <div>
                  <CardTitle>{organizer.name}</CardTitle>
                  <CardDescription>Gestion de l'équipe et des invitations</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Membres de l'équipe */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Membres de l'équipe</CardTitle>
                <CardDescription>
                  {members.length} membre{members.length > 1 ? "s" : ""}
                </CardDescription>
              </div>
              <Button onClick={() => setShowInviteDialog(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Inviter un membre
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mx-auto opacity-20 mb-2" />
                <p>Aucun membre dans cette équipe</p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>
                          {member.email?.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{member.email || "Utilisateur"}</p>
                        <p className="text-sm text-muted-foreground">
                          Ajouté le {formatDateWithoutTimezone(member.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={member.role}
                        onValueChange={(value: "owner" | "editor" | "viewer") =>
                          updateRole(member.user_id, value)
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Propriétaire</SelectItem>
                          <SelectItem value="editor">Éditeur</SelectItem>
                          <SelectItem value="viewer">Visualiseur</SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge variant={getRoleBadgeVariant(member.role)}>
                        {getRoleLabel(member.role)}
                      </Badge>
                      {member.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMember(member.user_id, member.email)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invitations en attente */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Invitations en attente</CardTitle>
                <CardDescription>
                  {invitations.filter((inv) => !inv.accepted_at && new Date(inv.expires_at) > new Date())
                    .length}{" "}
                  invitation(s) en attente
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => setShowHistoryDialog(true)}>
                <History className="h-4 w-4 mr-2" />
                Historique
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingInvitations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : invitations.filter((inv) => !inv.accepted_at && new Date(inv.expires_at) > new Date())
                .length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto opacity-20 mb-2" />
                <p>Aucune invitation en attente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {invitations
                  .filter((inv) => !inv.accepted_at && new Date(inv.expires_at) > new Date())
                  .map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{invitation.email}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline">{getRoleLabel(invitation.role)}</Badge>
                            <span>•</span>
                            <span>Expire le {formatDateWithoutTimezone(invitation.expires_at)}</span>
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        En attente
                      </Badge>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog d'invitation */}
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un membre</DialogTitle>
              <DialogDescription>
                Envoyez une invitation par email pour ajouter un membre à l'équipe
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="membre@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  disabled={sendingInvite}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rôle</Label>
                <Select
                  value={newUserRole}
                  onValueChange={(value: "owner" | "editor" | "viewer") => setNewUserRole(value)}
                  disabled={sendingInvite}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Propriétaire</SelectItem>
                    <SelectItem value="editor">Éditeur</SelectItem>
                    <SelectItem value="viewer">Visualiseur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                  Annuler
                </Button>
                <Button onClick={sendInvitation} disabled={sendingInvite || !newUserEmail.trim()}>
                  {sendingInvite ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Envoi...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Envoyer l'invitation
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog d'historique */}
        <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Historique des actions</DialogTitle>
              <DialogDescription>
                Historique complet des actions liées à l'équipe
              </DialogDescription>
            </DialogHeader>
            {loadingAudit ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto opacity-20 mb-2" />
                <p>Aucun historique disponible</p>
              </div>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline">{getActionLabel(log.action_type || log.action || "")}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatDateWithoutTimezone(log.created_at)}
                          </span>
                        </div>
                        {log.user_email && (
                          <p className="text-sm text-muted-foreground mb-1">
                            Utilisateur : {log.user_email}
                          </p>
                        )}
                        {log.description && <p className="text-sm">{log.description}</p>}
                        {log.old_value && log.new_value && (
                          <div className="mt-2 text-sm">
                            <span className="text-muted-foreground">Rôle : </span>
                            <span className="line-through">{getRoleLabel(log.old_value)}</span>
                            <span className="mx-2">→</span>
                            <span>{getRoleLabel(log.new_value)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <AlertDialogComponent />
    </OrganizerLayout>
  );
}

export default function TeamManagementPage() {
  return (
    <Suspense
      fallback={
        <OrganizerLayout title="Gestion d'équipe">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </OrganizerLayout>
      }
    >
      <TeamManagementContent />
    </Suspense>
  );
}

