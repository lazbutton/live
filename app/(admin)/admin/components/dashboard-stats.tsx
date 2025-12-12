"use client";

import type * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, FileText, MessageSquare, Sparkles, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-16 mt-2" />
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
    },
    {
      title: "Prochains 7 jours",
      description: "Charge à venir",
      value: stats.events.upcoming7,
      icon: CalendarClock,
      change: stats.events.upcoming7 > 0 ? "À surveiller" : "Rien de planifié",
      href: "/admin/events?view=agenda",
    },
    {
      title: "Lieux recommandés",
      description: "Sélection (max 6)",
      value: stats.suggestedLocations,
      icon: Sparkles,
      change: stats.suggestedLocations >= 6 ? "Limite atteinte" : "Vous pouvez en ajouter",
      href: "/admin/locations",
    },
    {
      title: "Demandes",
      description: "Demandes en attente",
      value: stats.pendingRequests,
      icon: FileText,
      change: stats.pendingRequests > 0 ? "Nécessite une action" : "Tout est à jour",
      href: "/admin/requests",
      emphasize: stats.pendingRequests > 0,
    },
    {
      title: "Feedback",
      description: "À traiter",
      value: stats.pendingFeedbacks,
      icon: MessageSquare,
      change: stats.pendingFeedbacks > 0 ? "Nécessite une action" : "Tout est à jour",
      href: "/admin/feedback",
      emphasize: stats.pendingFeedbacks > 0,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card 
            key={stat.title} 
            className={cn(
              "cursor-pointer transition-shadow hover:shadow-md",
              stat.emphasize ? "border-warning/40 bg-warning/5" : ""
            )}
            onClick={() => router.push(stat.href)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-4 px-4">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-xl font-bold">{stat.value}</div>
              <CardDescription className="mt-0.5 text-xs">
                {stat.description}
                {stat.change && (
                  <span className="block mt-0.5 text-xs text-muted-foreground">{stat.change}</span>
                )}
              </CardDescription>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

