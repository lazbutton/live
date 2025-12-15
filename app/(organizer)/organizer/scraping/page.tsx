"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OrganizerLayout } from "../components/organizer-layout";
import { supabase } from "@/lib/supabase/client";
import { OrganizerScrapingConfig } from "@/app/(admin)/admin/components/organizer-scraping-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getUserOrganizers, OrganizerInfo } from "@/lib/auth";
import { getActiveOrganizer } from "@/lib/auth-helpers";

function ScrapingConfigContent() {
  const router = useRouter();
  const [userOrganizers, setUserOrganizers] = useState<OrganizerInfo[]>([]);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string | null>(null);
  const [organizerData, setOrganizerData] = useState<{
    id: string;
    name: string;
    scraping_example_url: string | null;
    type: "organizer" | "location";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<"owner" | "editor" | "viewer" | null>(null);

  useEffect(() => {
    loadOrganizers();
  }, []);

  useEffect(() => {
    if (selectedOrganizerId) {
      loadOrganizerData(selectedOrganizerId);
    }
  }, [selectedOrganizerId]);

  async function loadOrganizers() {
    try {
      setLoading(true);
      const organizers = await getUserOrganizers();
      setUserOrganizers(organizers);

      if (organizers.length === 0) {
        setLoading(false);
        return;
      }

      // Sélectionner l'organisateur actif ou le premier
      const activeOrg = await getActiveOrganizer();
      if (activeOrg) {
        setSelectedOrganizerId(activeOrg.organizer_id);
      } else if (organizers.length > 0) {
        setSelectedOrganizerId(organizers[0].organizer_id);
      }
    } catch (error) {
      console.error("Erreur lors du chargement des organisateurs:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrganizerData(organizerId: string) {
    try {
      setLoading(true);

      const userOrg = userOrganizers.find((uo) => uo.organizer_id === organizerId);
      if (!userOrg) {
        setOrganizerData(null);
        setUserRole(null);
        return;
      }

      setUserRole(userOrg.role as "owner" | "editor" | "viewer");

      // Essayer d'abord comme organisateur
      const { data: organizer, error: organizerError } = await supabase
        .from("organizers")
        .select("id, name, scraping_example_url")
        .eq("id", organizerId)
        .single();

      if (organizer && !organizerError) {
        setOrganizerData({
          id: organizer.id,
          name: organizer.name,
          scraping_example_url: organizer.scraping_example_url,
          type: "organizer",
        });
        setLoading(false);
        return;
      }

      // Sinon, essayer comme lieu
      const { data: location, error: locationError } = await supabase
        .from("locations")
        .select("id, name, scraping_example_url")
        .eq("id", organizerId)
        .eq("is_organizer", true)
        .single();

      if (location && !locationError) {
        setOrganizerData({
          id: location.id,
          name: location.name,
          scraping_example_url: location.scraping_example_url,
          type: "location",
        });
        setLoading(false);
        return;
      }

      setOrganizerData(null);
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
      setOrganizerData(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <OrganizerLayout title="Configuration du scraping">
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </OrganizerLayout>
    );
  }

  if (userOrganizers.length === 0) {
    return (
      <OrganizerLayout title="Configuration du scraping">
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-muted-foreground">Aucun organisateur trouvé</p>
        </div>
      </OrganizerLayout>
    );
  }

  if (!organizerData) {
    return (
      <OrganizerLayout title="Configuration du scraping">
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-muted-foreground">Organisateur non trouvé</p>
        </div>
      </OrganizerLayout>
    );
  }

  // Vérifier que l'utilisateur a les droits (owner ou editor)
  if (userRole !== "owner" && userRole !== "editor") {
    return (
      <OrganizerLayout title="Configuration du scraping">
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-muted-foreground">
            Vous devez être propriétaire ou éditeur pour accéder à la configuration du scraping
          </p>
        </div>
      </OrganizerLayout>
    );
  }

  return (
    <OrganizerLayout title="Configuration du scraping">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <div>
              <CardTitle className="text-2xl">Configuration du scraping</CardTitle>
              <CardDescription>
                {organizerData.name}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {userOrganizers.length > 1 && (
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">Sélectionner un organisateur</label>
              <select
                value={selectedOrganizerId || ""}
                onChange={(e) => setSelectedOrganizerId(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                {userOrganizers.map((uo) => (
                  <option key={uo.organizer_id} value={uo.organizer_id}>
                    {uo.organizer?.name || uo.organizer_id}
                  </option>
                ))}
              </select>
            </div>
          )}
          <OrganizerScrapingConfig
            organizerId={organizerData.type === "organizer" ? organizerData.id : undefined}
            locationId={organizerData.type === "location" ? organizerData.id : undefined}
            organizerName={organizerData.name}
            scrapingExampleUrl={organizerData.scraping_example_url}
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                router.back();
              }
            }}
            isPageMode={true}
          />
        </CardContent>
      </Card>
    </OrganizerLayout>
  );
}

export default function ScrapingConfigPage() {
  return (
    <Suspense
      fallback={
        <OrganizerLayout title="Configuration du scraping">
          <div className="flex min-h-[400px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </OrganizerLayout>
      }
    >
      <ScrapingConfigContent />
    </Suspense>
  );
}


