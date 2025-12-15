"use client";

import type * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, FileText, MessageSquare, Sparkles, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Stats {
  events: {
    total: number;
    pending: number;
    approved: number;
    upcoming7: number;
  };
  suggestedLocations: number;
  pendingRequests: number;
  pendingFeedbacks: number;
}

type EventRow = {
  id: string;
  status: "pending" | "approved" | "rejected";
  date: string;
};

type StatCard = {
  title: string;
  description: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  change?: string;
  href: string;
  emphasize?: boolean;
  gradient?: string;
  trend?: "up" | "down" | "neutral";
};

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function DashboardStats() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    // Rafraîchir toutes les 30 secondes
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadStats() {
    try {
      const [eventsResult, suggestedLocationsResult, requestsResult, feedbacksResult] = await Promise.all([
        supabase.from("events").select("id, status, date"),
        supabase.from("locations").select("id").eq("suggested", true),
        supabase.from("user_requests").select("id").eq("status", "pending"),
        supabase.from("feedbacks").select("id").eq("status", "pending"),
      ]);

      const events = (eventsResult.data || []) as EventRow[];
      const eventsByStatus = events.reduce(
        (acc, event) => {
          acc[event.status]++;
          return acc;
        },
        { pending: 0, approved: 0, rejected: 0 }
      );

      const today = startOfLocalDay(new Date());
      const end = startOfLocalDay(new Date());
      end.setDate(end.getDate() + 7);
      const upcoming7 = events.filter((e) => {
        const d = startOfLocalDay(new Date(e.date));
        return d >= today && d < end;
      }).length;

      setStats({
        events: {
          total: events.length,
          pending: eventsByStatus.pending,
          approved: eventsByStatus.approved,
          upcoming7,
        },
        suggestedLocations: suggestedLocationsResult.data?.length || 0,
        pendingRequests: requestsResult.data?.length || 0,
        pendingFeedbacks: feedbacksResult.data?.length || 0,
      });
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="pb-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16 mt-2" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statCards: StatCard[] = [
    {
      title: "Événements à traiter",
      description: "En attente de validation",
      value: stats.events.pending,
      icon: AlertCircle,
      change: stats.events.pending > 0 ? "Nécessite une action" : "Tout est à jour",
      href: "/admin/events?status=pending&view=agenda",
      emphasize: stats.events.pending > 0,
      gradient: "from-amber-500/20 via-orange-500/10 to-red-500/20",
      trend: stats.events.pending > 0 ? "up" : "neutral",
    },
    {
      title: "Prochains 7 jours",
      description: "Événements à venir",
      value: stats.events.upcoming7,
      icon: CalendarClock,
      change: stats.events.upcoming7 > 0 ? "À surveiller" : "Rien de planifié",
      href: "/admin/events?view=agenda",
      gradient: "from-blue-500/20 via-indigo-500/10 to-purple-500/20",
      trend: stats.events.upcoming7 > 0 ? "up" : "neutral",
    },
    {
      title: "Lieux recommandés",
      description: "Sélection (max 6)",
      value: stats.suggestedLocations,
      icon: Sparkles,
      change: stats.suggestedLocations >= 6 ? "Limite atteinte" : "Vous pouvez en ajouter",
      href: "/admin/locations",
      gradient: "from-purple-500/20 via-pink-500/10 to-rose-500/20",
      trend: stats.suggestedLocations >= 6 ? "neutral" : "up",
    },
    {
      title: "Demandes",
      description: "Demandes en attente",
      value: stats.pendingRequests,
      icon: FileText,
      change: stats.pendingRequests > 0 ? "Nécessite une action" : "Tout est à jour",
      href: "/admin/requests",
      emphasize: stats.pendingRequests > 0,
      gradient: "from-cyan-500/20 via-blue-500/10 to-indigo-500/20",
      trend: stats.pendingRequests > 0 ? "up" : "neutral",
    },
    {
      title: "Feedback",
      description: "À traiter",
      value: stats.pendingFeedbacks,
      icon: MessageSquare,
      change: stats.pendingFeedbacks > 0 ? "Nécessite une action" : "Tout est à jour",
      href: "/admin/feedback",
      emphasize: stats.pendingFeedbacks > 0,
      gradient: "from-green-500/20 via-emerald-500/10 to-teal-500/20",
      trend: stats.pendingFeedbacks > 0 ? "up" : "neutral",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.title}
            className={cn(
              "group relative overflow-hidden cursor-pointer transition-all duration-300",
              "hover:shadow-xl hover:scale-[1.02] hover:border-primary/50",
              stat.emphasize && "ring-2 ring-offset-2 ring-offset-background ring-warning/30 border-warning/40"
            )}
            onClick={() => router.push(stat.href)}
          >
            {/* Gradient background */}
            {stat.gradient && (
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-50 pointer-events-none", stat.gradient)} />
            )}
            
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-foreground/90">{stat.title}</CardTitle>
              <div className={cn(
                "rounded-lg p-2 bg-background/80 backdrop-blur-sm transition-transform group-hover:scale-110",
                stat.emphasize && "bg-warning/10"
              )}>
                <Icon className={cn(
                  "h-4 w-4 transition-colors",
                  stat.emphasize ? "text-warning" : "text-muted-foreground"
                )} />
              </div>
            </CardHeader>
            <CardContent className="relative z-10 px-4 pb-4 pt-0">
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
                {stat.emphasize && stat.value > 0 && (
                  <Badge variant="destructive" className="h-5 text-xs font-bold">
                    Urgent
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-2 text-xs leading-relaxed">
                {stat.description}
                {stat.change && (
                  <span className="block mt-1 text-xs text-muted-foreground/80">{stat.change}</span>
                )}
              </CardDescription>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
