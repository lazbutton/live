"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/base_components/ui/tabs";
import { EventsManagement } from "@/app/(admin)/admin/components/events-management";
import { LocationsManagement } from "@/app/(admin)/admin/components/locations-management";
import { OrganizersManagement } from "@/app/(admin)/admin/components/organizers-management";
import { UserRequestsManagement } from "@/app/(admin)/admin/components/user-requests-management";
import { Button } from "@/base_components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/base_components/ui/card";
import { LogOut, Shield } from "lucide-react";

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/admin/login");
        return;
      }

      const role = user.user_metadata?.role;
      if (role !== "admin") {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error("Erreur de vérification:", error);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Accès refusé</CardTitle>
            <CardDescription>
              Vous n'avez pas les permissions nécessaires pour accéder à cette page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/admin/login")} className="w-full">
              Retour à la connexion
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Panneau d'administration</h1>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="events" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="events">Événements</TabsTrigger>
            <TabsTrigger value="locations">Lieux</TabsTrigger>
            <TabsTrigger value="organizers">Organisateurs</TabsTrigger>
            <TabsTrigger value="users">Demandes utilisateurs</TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-6">
            <EventsManagement />
          </TabsContent>

          <TabsContent value="locations" className="mt-6">
            <LocationsManagement />
          </TabsContent>

          <TabsContent value="organizers" className="mt-6">
            <OrganizersManagement />
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <UserRequestsManagement />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

