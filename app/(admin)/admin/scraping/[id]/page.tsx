"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { OrganizerScrapingConfig } from "@/app/(admin)/admin/components/organizer-scraping-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AdminLayout } from "@/app/(admin)/admin/components/admin-layout";

function ScrapingConfigContent() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [organizerData, setOrganizerData] = useState<{
    id: string;
    name: string;
    website_url: string | null;
    type: "organizer" | "location";
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadOrganizerData();
    }
  }, [id]);

  async function loadOrganizerData() {
    if (!id) return;

    try {
      setLoading(true);
      
      // Essayer d'abord comme organisateur
      const { data: organizer, error: organizerError } = await supabase
        .from("organizers")
        .select("id, name, website_url")
        .eq("id", id)
        .single();

      if (organizer && !organizerError) {
        setOrganizerData({
          id: organizer.id,
          name: organizer.name,
          website_url: organizer.website_url,
          type: "organizer",
        });
        setLoading(false);
        return;
      }

      // Sinon, essayer comme lieu
      const { data: location, error: locationError } = await supabase
        .from("locations")
        .select("id, name, website_url")
        .eq("id", id)
        .single();

      if (location && !locationError) {
        setOrganizerData({
          id: location.id,
          name: location.name,
          website_url: location.website_url,
          type: "location",
        });
        setLoading(false);
        return;
      }

      // Si aucun n'a été trouvé
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
      <AdminLayout title="Configuration du scraping">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!organizerData) {
    return (
      <AdminLayout title="Configuration du scraping">
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-muted-foreground">Organisateur ou lieu non trouvé</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      title="Configuration du scraping" 
      breadcrumbItems={[
        { label: organizerData.type === "organizer" ? "Organisateurs" : "Lieux", href: organizerData.type === "organizer" ? "/admin/organizers" : "/admin/locations" },
        { label: organizerData.name },
        { label: "Configuration du scraping" }
      ]}
    >
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
          <OrganizerScrapingConfig
            organizerId={organizerData.type === "organizer" ? organizerData.id : undefined}
            locationId={organizerData.type === "location" ? organizerData.id : undefined}
            organizerName={organizerData.name}
            websiteUrl={organizerData.website_url}
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
    </AdminLayout>
  );
}

export default function ScrapingConfigPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout title="Configuration du scraping">
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          </div>
        </AdminLayout>
      }
    >
      <ScrapingConfigContent />
    </Suspense>
  );
}

