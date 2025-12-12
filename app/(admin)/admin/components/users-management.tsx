"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Trash2, User, Shield, Loader2 } from "lucide-react";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

interface User {
  id: string;
  email: string;
  role?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
}

export function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();
  const isMobile = useIsMobile();

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(
        users.filter(
          (user) =>
            user.email.toLowerCase().includes(query) ||
            user.role?.toLowerCase().includes(query)
        )
      );
    }
  }, [users, searchQuery]);

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

    showConfirm({
      title: "Supprimer l'utilisateur",
      description: `Êtes-vous sûr de vouloir supprimer l'utilisateur ${user.email} ? Cette action est irréversible et supprimera définitivement le compte utilisateur.`,
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par email ou rôle..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Users list */}
      {filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-muted-foreground opacity-20 mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "Aucun utilisateur trouvé" : "Aucun utilisateur"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((user) => (
            <Card key={user.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {user.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{user.email}</p>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(user)}
                    className="text-destructive hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Alert Dialog Component */}
      <AlertDialogComponent />
    </div>
  );
}

