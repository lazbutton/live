"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { OrganizerLayout } from "../components/organizer-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { organizerCache, CACHE_KEYS, CACHE_TTL } from "@/lib/organizer-cache";

interface EventStats {
  total: number;
  upcoming: number;
  pending: number;
  past: number;
}

export default function OrganizerDashboardPage() {
  const [stats, setStats] = useState<EventStats>({
    total: 0,
    upcoming: 0,
    pending: 0,
    past: 0,
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setLoading(true);

      // Récupérer les organisateurs de l'utilisateur
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/admin/login");
        return;
      }

      // Utiliser le cache pour les user_organizers
      const cacheKey = `user_organizers.${user.id}`;
      let userOrganizers = organizerCache.get<Array<{ organizer_id: string }>>(cacheKey);

      if (!userOrganizers) {
        const { data, error } = await supabase
          .from("user_organizers")
          .select("organizer_id")
          .eq("user_id", user.id);

        if (error) throw error;
        userOrganizers = data || [];
        organizerCache.set(cacheKey, userOrganizers, CACHE_TTL.ORGANIZERS);
      }

      if (!userOrganizers || userOrganizers.length === 0) {
        setLoading(false);
        return;
      }

      const organizerIds = userOrganizers.map((uo) => uo.organizer_id);

      // Récupérer tous les événements des organisateurs de l'utilisateur
      // Note: organizer_id peut référencer soit un organisateur classique,
      // soit un lieu avec is_organizer = true
      // Vérifier à la fois organizer_id (organisateurs classiques)
      // et location_id (lieux-organisateurs)
      
      // Requête pour les organisateurs classiques
      const { data: eventOrganizersByOrg, error: eoError1 } = await supabase
        .from("event_organizers")
        .select("event_id")
        .in("organizer_id", organizerIds);

      // Requête pour les lieux-organisateurs
      const { data: eventOrganizersByLoc, error: eoError2 } = await supabase
        .from("event_organizers")
        .select("event_id")
        .in("location_id", organizerIds);

      if (eoError1 || eoError2) {
        console.error("Erreur lors du chargement des événements-organisateurs:", eoError1 || eoError2);
        setLoading(false);
        return;
      }

      // Combiner les deux listes et extraire les event_id uniques
      const allEventIds = [
        ...(eventOrganizersByOrg || []).map((eo) => eo.event_id),
        ...(eventOrganizersByLoc || []).map((eo) => eo.event_id),
      ];
      const eventIds = [...new Set(allEventIds)];

      if (eventIds.length === 0) {
        setStats({
          total: 0,
          upcoming: 0,
          pending: 0,
          past: 0,
        });
        setLoading(false);
        return;
      }

      // Ensuite, récupérer les événements
      const { data: events, error } = await supabase
        .from("events")
        .select("id, status, date, end_date")
        .in("id", eventIds);

      if (error) {
        console.error("Erreur lors du chargement des statistiques:", error);
        setLoading(false);
        return;
      }

      const filteredEvents = events || [];

      const now = new Date();

      const statsData: EventStats = {
        total: filteredEvents.length,
        upcoming: filteredEvents.filter((e: any) => {
          const endDate = e.end_date ? new Date(e.end_date) : new Date(e.date);
          return endDate >= now && e.status === "approved";
        }).length,
        pending: filteredEvents.filter((e: any) => e.status === "pending").length,
        past: filteredEvents.filter((e: any) => {
          const endDate = e.end_date ? new Date(e.end_date) : new Date(e.date);
          return endDate < now;
        }).length,
      };

      setStats(statsData);
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <OrganizerLayout title="Dashboard">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </OrganizerLayout>
    );
  }

  return (
    <OrganizerLayout title="Dashboard">
      <div className="space-y-6">
        {/* Actions rapides */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-4">
          <Link href="/organizer/events/create" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Créer un événement
            </Button>
          </Link>
          <Link href="/organizer/events" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto">
              Voir mes événements
            </Button>
          </Link>
        </div>

        {/* Statistiques */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total d'événements</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                Tous vos événements
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">À venir</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.upcoming}</div>
              <p className="text-xs text-muted-foreground">
                Événements approuvés à venir
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">En attente</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">
                En attente de validation
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Passés</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.past}</div>
              <p className="text-xs text-muted-foreground">
                Événements terminés
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Message de bienvenue */}
        <Card>
          <CardHeader>
            <CardTitle>Bienvenue !</CardTitle>
            <CardDescription>
              Gérez vos événements depuis cette interface
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Utilisez le menu de navigation pour accéder à vos événements, créer de nouveaux événements, ou gérer votre profil organisateur.
            </p>
          </CardContent>
        </Card>
      </div>
    </OrganizerLayout>
  );
}

