"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AdminLayout } from "../components/admin-layout";
import { DashboardStats } from "../components/dashboard-stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ArrowRight,
  Download,
  FileText,
  MessageSquare,
  Plus,
  Share2,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type QuickAction = {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | null;
  priority?: boolean;
  tone?: "warning" | "primary" | "success";
};

function DashboardContent() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingCounts, setPendingCounts] = useState<{ events: number; requests: number; feedbacks: number } | null>(null);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function loadPendingCounts() {
      try {
        const [eventsRes, reqRes, fbRes] = await Promise.all([
          supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase
            .from("user_requests")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending")
            .in("request_type", ["event_creation", "event_from_url"]),
          supabase.from("feedbacks").select("*", { count: "exact", head: true }).eq("status", "pending"),
        ]);

        if (cancelled) return;
        setPendingCounts({
          events: eventsRes.count ?? 0,
          requests: reqRes.count ?? 0,
          feedbacks: fbRes.count ?? 0,
        });
      } catch (e) {
        console.error("Erreur lors du chargement des compteurs dashboard:", e);
        if (!cancelled) setPendingCounts(null);
      }
    }

    loadPendingCounts();
    const t = setInterval(loadPendingCounts, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isAdmin]);

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
      <AdminLayout>
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

  // Actions prioritaires (urgentes)
  const priorityActions: QuickAction[] = [
    {
      title: "Événements à traiter",
      description: "En attente de validation",
      href: "/admin/events?status=pending&view=agenda",
      icon: AlertCircle,
      badge: pendingCounts?.events ?? null,
      priority: true,
      tone: "warning",
    },
    {
      title: "Demandes utilisateurs",
      description: "Nouvelles demandes en attente",
      href: "/admin/requests",
      icon: FileText,
      badge: pendingCounts?.requests ?? null,
      priority: true,
      tone: "primary",
    },
    {
      title: "Feedback",
      description: "Retours à traiter",
      href: "/admin/feedback",
      icon: MessageSquare,
      badge: pendingCounts?.feedbacks ?? null,
      priority: true,
      tone: "success",
    },
  ];

  // Actions rapides (création/import)
  const quickActions: QuickAction[] = [
    {
      title: "Créer un événement",
      description: "Nouvel événement manuel",
      href: "/admin/events/create",
      icon: Plus,
      tone: "primary",
    },
    {
      title: "Importer depuis URL",
      description: "Scraping automatique",
      href: "/admin/events?import=1&view=agenda",
      icon: Download,
      tone: "primary",
    },
    {
      title: "Générer visuels",
      description: "Contenus réseaux sociaux",
      href: "/admin/share",
      icon: Share2,
      tone: "primary",
    },
  ];

  const getToneClasses = (tone?: QuickAction["tone"]) => {
    if (tone === "warning") {
      return {
        leftBorder: "border-l-warning",
        iconWrap: "bg-warning/10",
        icon: "text-warning",
      };
    }
    if (tone === "success") {
      return {
        leftBorder: "border-l-emerald-500/60",
        iconWrap: "bg-emerald-500/10",
        icon: "text-emerald-600",
      };
    }
    // primary (default)
    return {
      leftBorder: "border-l-primary/50",
      iconWrap: "bg-primary/10",
      icon: "text-primary",
    };
  };

  const renderPriorityAction = (action: QuickAction) => {
    const Icon = action.icon;
    const tone = getToneClasses(action.tone);

    return (
      <Link
        href={action.href}
        className={cn(
          "block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30",
          "border-l-4",
          tone.leftBorder
        )}
      >
        <div className="flex items-start gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", tone.iconWrap)}>
            <Icon className={cn("h-5 w-5", tone.icon)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium">{action.title}</h3>
              {typeof action.badge === "number" && action.badge > 0 && (
                <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs font-bold tabular-nums">
                  {action.badge > 99 ? "99+" : action.badge}
                </Badge>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{action.description}</p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </Link>
    );
  };

  const renderQuickAction = (action: QuickAction) => {
    const Icon = action.icon;

    return (
      <Link
        href={action.href}
        className={cn(
          "block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30"
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium">{action.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{action.description}</p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </Link>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Statistiques */}
        <DashboardStats />

        {/* Actions prioritaires */}
        {priorityActions.some((a) => a.badge && a.badge > 0) && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-warning/10">
                  <Zap className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <CardTitle className="text-lg">Actions prioritaires</CardTitle>
                  <CardDescription className="text-sm">À traiter en priorité</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {priorityActions.map((action) => (
                  <div key={action.href}>{renderPriorityAction(action)}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions rapides */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Actions rapides</CardTitle>
                <CardDescription className="text-sm">Accès direct aux fonctions courantes</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {quickActions.map((action) => (
                <div key={action.href}>{renderQuickAction(action)}</div>
              ))}
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
        <AdminLayout>
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
