"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, Users, Tag, FileText, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  events: {
    total: number;
    pending: number;
    approved: number;
  };
  locations: number;
  organizers: number;
  categories: number;
  pendingRequests: number;
}

export function DashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [eventsResult, locationsResult, organizersResult, categoriesResult, requestsResult] = await Promise.all([
        supabase.from("events").select("id, status"),
        supabase.from("locations").select("id"),
        supabase.from("organizers").select("id"),
        supabase.from("categories").select("id").eq("is_active", true),
        supabase.from("user_requests").select("id").eq("status", "pending"),
      ]);

      const events = eventsResult.data || [];
      const eventsByStatus = events.reduce(
        (acc, event) => {
          acc[event.status as keyof typeof acc]++;
          return acc;
        },
        { pending: 0, approved: 0, rejected: 0 }
      );

      setStats({
        events: {
          total: events.length,
          pending: eventsByStatus.pending,
          approved: eventsByStatus.approved,
        },
        locations: locationsResult.data?.length || 0,
        organizers: organizersResult.data?.length || 0,
        categories: categoriesResult.data?.length || 0,
        pendingRequests: requestsResult.data?.length || 0,
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

  const statCards = [
    {
      title: "Événements",
      description: "Total d'événements",
      value: stats.events.total,
      icon: Calendar,
      change: `${stats.events.approved} approuvés`,
    },
    {
      title: "En attente",
      description: "Événements en attente",
      value: stats.events.pending,
      icon: Clock,
      change: "En cours de validation",
    },
    {
      title: "Lieux",
      description: "Lieux enregistrés",
      value: stats.locations,
      icon: MapPin,
    },
    {
      title: "Organisateurs",
      description: "Organisateurs actifs",
      value: stats.organizers,
      icon: Users,
    },
    {
      title: "Catégories",
      description: "Catégories actives",
      value: stats.categories,
      icon: Tag,
    },
    {
      title: "Demandes",
      description: "Demandes en attente",
      value: stats.pendingRequests,
      icon: FileText,
      change: stats.pendingRequests > 0 ? "Nécessite une action" : "Tout est à jour",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <CardDescription className="mt-1">
                {stat.description}
                {stat.change && (
                  <span className="block mt-1 text-xs text-muted-foreground">{stat.change}</span>
                )}
              </CardDescription>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

