"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Trash2, User, Shield, Loader2, Edit2, MoreVertical } from "lucide-react";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface User {
  id: string;
  email: string;
  role?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
}

export function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUsersWithoutEmail, setShowUsersWithoutEmail] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();
  const isMobile = useIsMobile();

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    let filtered = users;

    // Filtrer par défaut les utilisateurs sans email
    if (!showUsersWithoutEmail) {
      filtered = filtered.filter((user) => user.email && user.email.trim() !== "");
    }

    // Filtrer par recherche
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.email?.toLowerCase().includes(query) ||
          user.role?.toLowerCase().includes(query) ||
          user.first_name?.toLowerCase().includes(query) ||
          user.last_name?.toLowerCase().includes(query) ||
          user.full_name?.toLowerCase().includes(query)
      );
    }

    setFilteredUsers(filtered);
  }, [users, searchQuery, showUsersWithoutEmail]);

  async function loadUsers() {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/users/list");
      if (!response.ok) {
        throw new Error("Erreur lors du chargement des utilisateurs");
      }
      const { users: usersData } = await response.json();
      setUsers(usersData || []);
      setFilteredUsers(usersData || []);
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
      showAlert({
        title: "Erreur",
        description: "Erreur lors du chargement des utilisateurs",
        confirmText: "OK",
        variant: "default",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteClick(user: User) {
    // Empêcher la suppression de soi-même
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    
    if (currentUser?.id === user.id) {
      showAlert({
        title: "Action non autorisée",
        description: "Vous ne pouvez pas supprimer votre propre compte",
        confirmText: "OK",
        variant: "default",
      });
      return;
    }

    const userName = getUserDisplayName(user);
    showConfirm({
      title: "Supprimer l'utilisateur",
      description: `Êtes-vous sûr de vouloir supprimer l'utilisateur ${userName}${user.email ? ` (${user.email})` : ""} ? Cette action est irréversible et supprimera définitivement le compte utilisateur.`,
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/admin/users/${user.id}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Erreur lors de la suppression");
          }

          // Recharger la liste après suppression
          await loadUsers();
          showAlert({
            title: "Succès",
            description: "Utilisateur supprimé avec succès",
            confirmText: "OK",
            variant: "default",
          });
        } catch (error: any) {
          console.error("Erreur:", error);
          showAlert({
            title: "Erreur",
            description: error.message || "Erreur lors de la suppression de l'utilisateur",
            confirmText: "OK",
            variant: "default",
          });
        }
      },
    });
  }

  function getUserDisplayName(user: User): string {
    if (user.full_name) return user.full_name;
    if (user.first_name || user.last_name) {
      return [user.first_name, user.last_name].filter(Boolean).join(" ");
    }
    return user.email || "Utilisateur sans email";
  }

  function getUserInitials(user: User): string {
    if (user.first_name && user.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    if (user.full_name) {
      const parts = user.full_name.split(" ");
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return user.full_name.substring(0, 2).toUpperCase();
    }
    if (user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "U";
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdatingRole(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole || null }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Erreur lors de la mise à jour");
      }

      await loadUsers();
      showAlert({
        title: "Succès",
        description: "Rôle mis à jour avec succès",
        confirmText: "OK",
        variant: "default",
      });
    } catch (error: any) {
      console.error("Erreur:", error);
      showAlert({
        title: "Erreur",
        description: error.message || "Erreur lors de la mise à jour du rôle",
        confirmText: "OK",
        variant: "default",
      });
    } finally {
      setUpdatingRole(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Chargement des utilisateurs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Utilisateurs</h2>
          <p className="text-sm text-muted-foreground">
            Gérez les utilisateurs de la plateforme
          </p>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, prénom, email ou rôle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-card">
          <Switch
            id="show-no-email"
            checked={showUsersWithoutEmail}
            onCheckedChange={setShowUsersWithoutEmail}
          />
          <Label htmlFor="show-no-email" className="text-sm cursor-pointer">
            Afficher les utilisateurs sans email
          </Label>
        </div>
      </div>

      {/* Users list */}
      {filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-muted-foreground opacity-20 mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchQuery || !showUsersWithoutEmail
                ? "Aucun utilisateur trouvé"
                : "Aucun utilisateur"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((user) => {
            const displayName = getUserDisplayName(user);
            const initials = getUserInitials(user);
            return (
              <Card key={user.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{displayName}</p>
                          {user.email && (
                            <span className="text-sm text-muted-foreground truncate">
                              ({user.email})
                            </span>
                          )}
                          {user.role === "admin" && (
                            <Badge variant="default" className="shrink-0">
                              <Shield className="h-3 w-3 mr-1" />
                              Admin
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>
                            Créé le {formatDateWithoutTimezone(user.created_at, "PP")}
                          </span>
                          {user.last_sign_in_at && (
                            <span>
                              • Dernière connexion:{" "}
                              {formatDateWithoutTimezone(user.last_sign_in_at, "PP")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9"
                            disabled={updatingRole === user.id}
                          >
                            {updatingRole === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Edit2 className="h-4 w-4" />
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64" align="end">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Rôle</Label>
                              <Select
                                value={user.role || "none"}
                                onValueChange={(value) => handleRoleChange(user.id, value === "none" ? "" : value)}
                                disabled={updatingRole === user.id}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Aucun rôle" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Aucun rôle</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="pt-2 border-t">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(user)}
                                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={updatingRole === user.id}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Supprimer
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Alert Dialog Component */}
      <AlertDialogComponent />
    </div>
  );
}

