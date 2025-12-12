"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminLayout } from "@/app/(admin)/admin/components/admin-layout";
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
  ArrowLeft,
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
import { isOwnerOfOrganizer } from "@/lib/auth-helpers";

interface TeamMember {
  id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
  email?: string;
}

interface AuditLog {
  id: string;
  action: string;
  performed_by: string;
  performer_email: string | null;
  target_user_id: string | null;
  target_email: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: any;
  created_at: string;
}

interface Organizer {
  id: string;
  name: string;
  logo_url: string | null;
}

function TeamManagementContent() {
  const params = useParams();
  const router = useRouter();
  const organizerId = params.id as string;
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();

  const [organizer, setOrganizer] = useState<Organizer | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"owner" | "editor" | "viewer">("owner");
  const [sendingInvite, setSendingInvite] = useState(false);

  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  useEffect(() => {
    checkAccessAndLoadData();
  }, [organizerId]);

  async function checkAccessAndLoadData() {
    try {
      // Vérifier les permissions
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setHasAccess(false);
        router.push("/admin/login");
        return;
      }

      const role = user.user_metadata?.role;
      const isAdmin = role === "admin";

      if (!isAdmin) {
        // Vérifier si l'utilisateur est propriétaire de cet organisateur
        const owner = await isOwnerOfOrganizer(organizerId);
        if (!owner) {
          setHasAccess(false);
          showAlert({
            title: "Accès refusé",
            description: "Vous devez être propriétaire de cet organisateur pour accéder à cette page.",
            confirmText: "OK",
          });
          router.push("/organizer");
          return;
        }
        setIsOwner(true);
      }

      setHasAccess(true);
      await loadData();
    } catch (error) {
      console.error("Erreur lors de la vérification d'accès:", error);
      setHasAccess(false);
    }
  }

  async function loadData() {
    setLoading(true);
    await Promise.all([loadOrganizer(), loadMembers(), loadInvitations(), loadAuditLogs()]);
    setLoading(false);
  }

  async function loadOrganizer() {
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
      router.push(isOwner ? "/organizer" : "/admin/organizers");
    }
  }

  async function loadMembers() {
    setLoadingMembers(true);
    try {
      // Utiliser l'API admin pour les admins, ou créer une API spécifique pour les organisateurs
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const role = user.user_metadata?.role;
      const isAdmin = role === "admin";

      // Pour les propriétaires, utiliser directement Supabase avec RLS
      if (!isAdmin) {
        const { data: userOrgs, error } = await supabase
          .from("user_organizers")
          .select("id, user_id, role, created_at")
          .eq("organizer_id", organizerId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        // Récupérer les emails
        const userIds = (userOrgs || []).map((uo: any) => uo.user_id);
        const membersWithEmails = await Promise.all(
          (userOrgs || []).map(async (uo: any) => {
            try {
              const { data: userData } = await supabase.auth.admin.getUserById(uo.user_id);
              return {
                ...uo,
                email: userData?.user?.email || null,
              };
            } catch {
              return { ...uo, email: null };
            }
          })
        );

        setMembers(membersWithEmails);
      } else {
        // Pour les admins, utiliser l'API
        const response = await fetch(`/api/admin/organizers/${organizerId}/users`);
        if (!response.ok) throw new Error("Erreur lors du chargement");
        const { users } = await response.json();
        setMembers(users || []);
      }
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

  async function loadInvitations() {
    setLoadingInvitations(true);
    try {
      // Les invitations sont accessibles via RLS pour les propriétaires
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

  async function loadAuditLogs() {
    setLoadingAudit(true);
    try {
      const response = await fetch(`/api/admin/organizers/${organizerId}/audit`);
      if (!response.ok) throw new Error("Erreur lors du chargement");
      const { logs } = await response.json();
      setAuditLogs(logs || []);
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoadingAudit(false);
    }
  }

  async function sendInvitation() {
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

      // Utiliser l'API admin (qui accepte maintenant les owners)
      const response = await fetch(`/api/admin/organizers/${organizerId}/invite`, {
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

      // L'audit est déjà enregistré dans l'API /invite

      showAlert({
        title: "Invitation envoyée",
        description: `Invitation envoyée à ${newUserEmail} !`,
        confirmText: "OK",
      });

      setNewUserEmail("");
      setShowInviteDialog(false);
      await loadInvitations();
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

  async function removeMember(userId: string) {
    showConfirm({
      title: "Retirer le membre",
      description: "Êtes-vous sûr de vouloir retirer ce membre de l'équipe ?",
      confirmText: "Retirer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("Non authentifié");

          const member = members.find((m) => m.user_id === userId);
          if (!member) return;

          const response = await fetch(
            `/api/admin/organizers/${organizerId}/users?user_id=${userId}`,
            { method: "DELETE" }
          );

          if (!response.ok) throw new Error("Erreur lors de la suppression");

          // L'audit est déjà enregistré dans l'API /users DELETE

          await loadMembers();
          await loadAuditLogs();
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const member = members.find((m) => m.user_id === userId);
      if (!member) return;

      const response = await fetch(`/api/admin/organizers/${organizerId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: userId,
          role: newRole,
        }),
      });

      if (!response.ok) throw new Error("Erreur lors de la mise à jour");

          // L'audit est déjà enregistré dans l'API /users POST

          await loadMembers();
      await loadAuditLogs();
    } catch (error: any) {
      showAlert({
        title: "Erreur",
        description: error.message || "Erreur lors de la mise à jour",
        confirmText: "OK",
      });
    }
  }

  function getRoleIcon(role: string) {
    switch (role) {
      case "owner":
        return <Shield className="h-4 w-4" />;
      case "editor":
        return <Edit2 className="h-4 w-4" />;
      case "viewer":
        return <Eye className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  }

  function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
    switch (role) {
      case "owner":
        return "default";
      case "editor":
        return "secondary";
      default:
        return "outline";
    }
  }

  function getActionLabel(action: string): string {
    const labels: Record<string, string> = {
      user_added: "Utilisateur ajouté",
      user_removed: "Utilisateur retiré",
      role_changed: "Rôle modifié",
      invitation_sent: "Invitation envoyée",
      invitation_accepted: "Invitation acceptée",
      invitation_rejected: "Invitation rejetée",
      invitation_expired: "Invitation expirée",
    };
    return labels[action] || action;
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }

  if (loading || hasAccess === null) {
    return (
      <AdminLayout title="Gestion d'équipe">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (hasAccess === false) {
    return null; // La redirection est gérée dans checkAccessAndLoadData
  }

  return (
    <AdminLayout title={`Gestion d'équipe - ${organizer?.name || ""}`}>
      <div className="space-y-6">
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/admin/organizers")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <div className="flex items-center gap-3">
              {organizer?.logo_url && (
                <Avatar className="h-10 w-10">
                  <AvatarImage src={organizer.logo_url} alt={organizer.name} />
                  <AvatarFallback>{getInitials(organizer.name)}</AvatarFallback>
                </Avatar>
              )}
              <div>
                <h1 className="text-2xl font-semibold">{organizer?.name}</h1>
                <p className="text-sm text-muted-foreground">Gestion de l'équipe</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowHistoryDialog(true)}
            >
              <History className="h-4 w-4 mr-2" />
              Historique
            </Button>
            <Button onClick={() => setShowInviteDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Inviter un membre
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Membres de l'équipe */}
          <Card>
            <CardHeader>
              <CardTitle>Membres de l'équipe</CardTitle>
              <CardDescription>
                {members.length} membre{members.length > 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : members.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Aucun membre
                </div>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {member.email?.[0].toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">
                              {member.email || member.user_id.substring(0, 8) + "..."}
                            </span>
                            <Badge variant={getRoleBadgeVariant(member.role)}>
                              {getRoleIcon(member.role)}
                              <span className="ml-1 capitalize">{member.role}</span>
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
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
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMember(member.user_id)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
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
              <CardTitle>Invitations en attente</CardTitle>
              <CardDescription>
                {invitations.filter((inv) => inv.status === "pending").length} invitation
                {invitations.filter((inv) => inv.status === "pending").length > 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingInvitations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : invitations.filter((inv) => inv.status === "pending").length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Aucune invitation en attente
                </div>
              ) : (
                <div className="space-y-3">
                  {invitations
                    .filter((inv) => inv.status === "pending")
                    .map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Mail className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{invitation.email}</span>
                              <Badge variant="outline">{invitation.role}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Envoyée le {formatDateWithoutTimezone(invitation.created_at)}
                            </p>
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
        </div>

        {/* Dialog d'invitation */}
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un membre</DialogTitle>
              <DialogDescription>
                Envoyez une invitation par email à un nouveau membre de l'équipe
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite_email">Email</Label>
                <Input
                  id="invite_email"
                  type="email"
                  placeholder="membre@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  disabled={sendingInvite}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite_role">Rôle</Label>
                <Select
                  value={newUserRole}
                  onValueChange={(value: "owner" | "editor" | "viewer") =>
                    setNewUserRole(value)
                  }
                  disabled={sendingInvite}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner (Propriétaire)</SelectItem>
                    <SelectItem value="editor">Editor (Éditeur)</SelectItem>
                    <SelectItem value="viewer">Viewer (Visualiseur)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowInviteDialog(false)}
                  disabled={sendingInvite}
                >
                  Annuler
                </Button>
                <Button onClick={sendInvitation} disabled={sendingInvite}>
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
                Liste de toutes les actions effectuées sur cette équipe
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {loadingAudit ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Aucune action enregistrée
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 border rounded-lg"
                  >
                    <div className="mt-1">
                      {log.action === "role_changed" && (
                        <Edit2 className="h-4 w-4 text-blue-500" />
                      )}
                      {log.action === "user_added" && (
                        <UserPlus className="h-4 w-4 text-green-500" />
                      )}
                      {log.action === "user_removed" && (
                        <UserMinus className="h-4 w-4 text-red-500" />
                      )}
                      {log.action.startsWith("invitation_") && (
                        <Mail className="h-4 w-4 text-orange-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {getActionLabel(log.action)}
                        </span>
                        {log.target_email && (
                          <span className="text-sm text-muted-foreground">
                            pour {log.target_email}
                          </span>
                        )}
                        {log.old_value && log.new_value && (
                          <span className="text-xs text-muted-foreground">
                            ({log.old_value} → {log.new_value})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          Par {log.performer_email || "Système"}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateWithoutTimezone(log.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialogComponent />
      </div>
    </AdminLayout>
  );
}

export default function TeamManagementPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout title="Gestion d'équipe">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </AdminLayout>
      }
    >
      <TeamManagementContent />
    </Suspense>
  );
}

