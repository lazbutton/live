"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AdminLayout } from "../components/admin-layout";
import { DashboardStats } from "../components/dashboard-stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, FileText, MapPin, Users, Tag, Plus, ArrowRight } from "lucide-react";
import Link from "next/link";

function DashboardContent() {
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

  if (loading) {
    return (
      <AdminLayout title="Dashboard">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (isAdmin === false) {
    return (
      <AdminLayout title="Accès refusé">
        <Card className="w-full max-w-md mx-auto">
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
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Dashboard" breadcrumbItems={[{ label: "Dashboard" }]}>
      <div className="space-y-6">
        <DashboardStats />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              Actions rapides
            </CardTitle>
            <CardDescription className="text-xs">Accédez rapidement aux fonctionnalités principales</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Link 
                href="/admin/events"
                className="group relative flex items-center gap-3 rounded-lg border border-border/30 bg-card/50 backdrop-blur-sm p-3 transition-all hover:border-primary/50 hover:bg-accent/50 hover:shadow-md cursor-pointer"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 transition-colors">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Événements
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    Gérer tous les événements
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>

              <Link 
                href="/admin/requests"
                className="group relative flex items-center gap-3 rounded-lg border border-border/30 bg-card/50 backdrop-blur-sm p-3 transition-all hover:border-primary/50 hover:bg-accent/50 hover:shadow-md cursor-pointer"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20 transition-colors">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Demandes
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    Examiner et valider les demandes
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>

              <Link 
                href="/admin/locations"
                className="group relative flex items-center gap-3 rounded-lg border border-border/30 bg-card/50 backdrop-blur-sm p-3 transition-all hover:border-primary/50 hover:bg-accent/50 hover:shadow-md cursor-pointer"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500/10 text-green-500 group-hover:bg-green-500/20 transition-colors">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Lieux
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    Gérer les lieux
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>

              <Link 
                href="/admin/organizers"
                className="group relative flex items-center gap-3 rounded-lg border border-border/30 bg-card/50 backdrop-blur-sm p-3 transition-all hover:border-primary/50 hover:bg-accent/50 hover:shadow-md cursor-pointer"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500 group-hover:bg-purple-500/20 transition-colors">
                  <Users className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Organisateurs
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    Gérer les organisateurs
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>

              <Link 
                href="/admin/categories"
                className="group relative flex items-center gap-3 rounded-lg border border-border/30 bg-card/50 backdrop-blur-sm p-3 transition-all hover:border-primary/50 hover:bg-accent/50 hover:shadow-md cursor-pointer"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500 group-hover:bg-pink-500/20 transition-colors">
                  <Tag className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Catégories
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    Organiser les catégories
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout title="Dashboard">
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          </div>
        </AdminLayout>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

