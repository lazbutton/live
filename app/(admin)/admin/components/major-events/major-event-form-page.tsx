"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { AdminMajorEvent, MajorEventFormData, MajorEventStatus } from "./types";
import { MajorEventEventsSection } from "./major-event-events-section";
import { MajorEventLocationsSection } from "./major-event-locations-section";
import { MajorEventOrganizersSection } from "./major-event-organizers-section";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function emptyForm(): MajorEventFormData {
  return {
    title: "",
    slug: "",
    short_description: "",
    long_description: "",
    hero_image_url: "",
    logo_url: "",
    start_at: "",
    end_at: "",
    timezone: "Europe/Paris",
    city_name: "",
    primary_category: "",
    status: "draft",
    is_featured: false,
    map_center_latitude: "",
    map_center_longitude: "",
    default_map_zoom: "",
    ticketing_url: "",
    official_url: "",
  };
}

function parseNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function MajorEventFormPage({ majorEventId }: { majorEventId?: string }) {
  const router = useRouter();

  const [loading, setLoading] = React.useState(Boolean(majorEventId));
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<MajorEventFormData>(() => emptyForm());
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  React.useEffect(() => {
    if (!majorEventId) return;

    let cancelled = false;

    async function loadMajorEvent() {
      setLoading(true);
      try {
        const { data, error } = await supabase.from("major_events").select("*").eq("id", majorEventId).maybeSingle();
        if (error) throw error;

        if (!data) {
          toast({
            title: "Multi-événements introuvable",
            description:
              "Le Multi-événements demandé n'existe pas ou n'est plus accessible.",
            variant: "destructive",
          });
          return;
        }

        if (cancelled) return;

        const majorEvent = data as AdminMajorEvent;
        setForm({
          title: majorEvent.title || "",
          slug: majorEvent.slug || "",
          short_description: majorEvent.short_description || "",
          long_description: majorEvent.long_description || "",
          hero_image_url: majorEvent.hero_image_url || "",
          logo_url: majorEvent.logo_url || "",
          start_at: toDatetimeLocalValue(majorEvent.start_at),
          end_at: toDatetimeLocalValue(majorEvent.end_at),
          timezone: majorEvent.timezone || "Europe/Paris",
          city_name: majorEvent.city_name || "",
          primary_category: majorEvent.primary_category || "",
          status: majorEvent.status || "draft",
          is_featured: Boolean(majorEvent.is_featured),
          map_center_latitude: majorEvent.map_center_latitude != null ? String(majorEvent.map_center_latitude) : "",
          map_center_longitude: majorEvent.map_center_longitude != null ? String(majorEvent.map_center_longitude) : "",
          default_map_zoom: majorEvent.default_map_zoom != null ? String(majorEvent.default_map_zoom) : "",
          ticketing_url: majorEvent.ticketing_url || "",
          official_url: majorEvent.official_url || "",
        });
        setShowAdvanced(
          Boolean(
            majorEvent.long_description ||
              majorEvent.logo_url ||
              majorEvent.ticketing_url ||
              majorEvent.official_url ||
              majorEvent.primary_category ||
              majorEvent.map_center_latitude != null ||
              majorEvent.map_center_longitude != null ||
              majorEvent.default_map_zoom != null,
          ),
        );
        setSlugTouched(true);
      } catch (error) {
        console.error("Erreur chargement major event:", error);
        if (!cancelled) {
          toast({
            title: "Chargement impossible",
            description: "Le Multi-événements n'a pas pu être chargé.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMajorEvent();

    return () => {
      cancelled = true;
    };
  }, [majorEventId]);

  function updateField<K extends keyof MajorEventFormData>(key: K, value: MajorEventFormData[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim()) {
      toast({
        title: "Titre requis",
        description: "Ajoute un titre avant d'enregistrer le Multi-événements.",
        variant: "destructive",
      });
      return;
    }

    if (!form.slug.trim()) {
      toast({
        title: "Slug requis",
        description: "Ajoute un slug public pour le Multi-événements.",
        variant: "destructive",
      });
      return;
    }

    if (!form.start_at || !form.end_at) {
      toast({
        title: "Période requise",
        description: "Renseigne une date de début et une date de fin.",
        variant: "destructive",
      });
      return;
    }

    const startDate = new Date(form.start_at);
    const endDate = new Date(form.end_at);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
      toast({
        title: "Période invalide",
        description: "La date de fin doit être supérieure ou égale à la date de début.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        short_description: form.short_description.trim() || null,
        long_description: form.long_description.trim() || null,
        hero_image_url: form.hero_image_url.trim() || null,
        logo_url: form.logo_url.trim() || null,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        timezone: form.timezone.trim() || "Europe/Paris",
        city_name: form.city_name.trim() || null,
        primary_category: form.primary_category.trim() || null,
        status: form.status,
        is_featured: form.is_featured,
        map_center_latitude: parseNullableNumber(form.map_center_latitude),
        map_center_longitude: parseNullableNumber(form.map_center_longitude),
        default_map_zoom: parseNullableNumber(form.default_map_zoom),
        ticketing_url: form.ticketing_url.trim() || null,
        official_url: form.official_url.trim() || null,
      };

      if (majorEventId) {
        const { error } = await supabase.from("major_events").update(payload).eq("id", majorEventId);
        if (error) throw error;

        toast({
          title: "Multi-événements enregistré",
          description:
            "Les informations du Multi-événements ont été mises à jour.",
          variant: "success",
        });
        router.refresh();
      } else {
        const { data, error } = await supabase
          .from("major_events")
          .insert({
            ...payload,
            created_by: user?.id || null,
          })
          .select("id")
          .single();

        if (error) throw error;

        toast({
          title: "Multi-événements créé",
          description: "Le Multi-événements a été créé en brouillon.",
          variant: "success",
        });

        if (data?.id) {
          router.push(`/admin/major-events/${data.id}`);
          router.refresh();
        }
      }
    } catch (error: any) {
      console.error("Erreur sauvegarde major event:", error);
      toast({
        title: "Enregistrement impossible",
        description:
          error?.message || "Le Multi-événements n'a pas pu être enregistré.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const advancedFieldsCount = [
    form.long_description.trim(),
    form.logo_url.trim(),
    form.official_url.trim(),
    form.ticketing_url.trim(),
    form.primary_category.trim(),
    form.map_center_latitude.trim(),
    form.map_center_longitude.trim(),
    form.default_map_zoom.trim(),
    form.timezone.trim() !== "Europe/Paris" ? form.timezone.trim() : "",
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {majorEventId
              ? "Éditer le Multi-événements"
              : "Créer un Multi-événements"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Le minimum utile d'abord : titre, période, ville, résumé et
            visibilité.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/major-events">Retour à la liste</Link>
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Chargement du Multi-événements...
          </CardContent>
        </Card>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Essentiel</CardTitle>
              <CardDescription>
                Les champs de base pour publier rapidement un
                Multi-événements léger.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="title">Titre</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) => {
                    const nextTitle = event.target.value;
                    updateField("title", nextTitle);
                    if (!slugTouched) {
                      updateField("slug", slugify(nextTitle));
                    }
                  }}
                  placeholder="Festival OutLive 2026"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug public</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    updateField("slug", slugify(event.target.value));
                  }}
                  placeholder="festival-outlive-2026"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city_name">Ville / territoire</Label>
                <Input
                  id="city_name"
                  value={form.city_name}
                  onChange={(event) => updateField("city_name", event.target.value)}
                  placeholder="Orléans"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="short_description">Résumé court</Label>
                <Textarea
                  id="short_description"
                  value={form.short_description}
                  onChange={(event) => updateField("short_description", event.target.value)}
                  placeholder="Résumé court utilisé sur les cartes, headers et aperçus."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero_image_url">Image principale</Label>
                <Input
                  id="hero_image_url"
                  value={form.hero_image_url}
                  onChange={(event) => updateField("hero_image_url", event.target.value)}
                  placeholder="https://..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Période et publication</CardTitle>
              <CardDescription>
                La plage principale et la visibilité dans l'app.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_at">Début</Label>
                <Input
                  id="start_at"
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(event) => updateField("start_at", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_at">Fin</Label>
                <Input
                  id="end_at"
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(event) => updateField("end_at", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={(value) => updateField("status", value as MajorEventStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="pending">En validation</SelectItem>
                    <SelectItem value="approved">Publié</SelectItem>
                    <SelectItem value="archived">Archivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-1">
                  <div className="font-medium">Mise en avant</div>
                  <div className="text-sm text-muted-foreground">
                    Permet d'exposer ce Multi-événements plus facilement dans le
                    front public.
                  </div>
                </div>
                <Switch checked={form.is_featured} onCheckedChange={(checked) => updateField("is_featured", checked)} />
              </div>
            </CardContent>
          </Card>

          {majorEventId ? (
            <MajorEventEventsSection
              majorEventId={majorEventId}
              hubStartAt={form.start_at}
              hubEndAt={form.end_at}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Programme</CardTitle>
                <CardDescription>
                  Crée d'abord le Multi-événements, puis rattache les
                  événements existants depuis leurs fiches ou depuis la section
                  programme.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Options avancées</CardTitle>
                  <CardDescription>
                    Carte, description longue, liens externes et liaisons
                    manuelles secondaires.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAdvanced((previous) => !previous)}
                >
                  {showAdvanced
                    ? "Masquer les options avancées"
                    : `Afficher les options avancées${advancedFieldsCount > 0 ? ` (${advancedFieldsCount})` : ""}`}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showAdvanced ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="long_description">
                        Description détaillée
                      </Label>
                      <Textarea
                        id="long_description"
                        value={form.long_description}
                        onChange={(event) =>
                          updateField("long_description", event.target.value)
                        }
                        placeholder="Description complète, infos utiles, ambiance, contexte..."
                        rows={6}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="logo_url">Logo</Label>
                      <Input
                        id="logo_url"
                        value={form.logo_url}
                        onChange={(event) =>
                          updateField("logo_url", event.target.value)
                        }
                        placeholder="https://..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="primary_category">
                        Catégorie principale
                      </Label>
                      <Input
                        id="primary_category"
                        value={form.primary_category}
                        onChange={(event) =>
                          updateField("primary_category", event.target.value)
                        }
                        placeholder="musique"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Input
                        id="timezone"
                        value={form.timezone}
                        onChange={(event) =>
                          updateField("timezone", event.target.value)
                        }
                        placeholder="Europe/Paris"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ticketing_url">Billetterie</Label>
                      <Input
                        id="ticketing_url"
                        value={form.ticketing_url}
                        onChange={(event) =>
                          updateField("ticketing_url", event.target.value)
                        }
                        placeholder="https://..."
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="official_url">Site officiel</Label>
                      <Input
                        id="official_url"
                        value={form.official_url}
                        onChange={(event) =>
                          updateField("official_url", event.target.value)
                        }
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="map_center_latitude">Latitude</Label>
                      <Input
                        id="map_center_latitude"
                        value={form.map_center_latitude}
                        onChange={(event) =>
                          updateField(
                            "map_center_latitude",
                            event.target.value,
                          )
                        }
                        placeholder="47.902964"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="map_center_longitude">Longitude</Label>
                      <Input
                        id="map_center_longitude"
                        value={form.map_center_longitude}
                        onChange={(event) =>
                          updateField(
                            "map_center_longitude",
                            event.target.value,
                          )
                        }
                        placeholder="1.909251"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="default_map_zoom">Zoom par défaut</Label>
                      <Input
                        id="default_map_zoom"
                        value={form.default_map_zoom}
                        onChange={(event) =>
                          updateField("default_map_zoom", event.target.value)
                        }
                        placeholder="12"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Laisse cette zone repliée pour une création rapide. Ouvre-la
                  seulement si tu dois enrichir la carte, la description longue
                  ou les liens externes.
                </p>
              )}
            </CardContent>
          </Card>

          {majorEventId && showAdvanced ? (
            <>
              <MajorEventLocationsSection majorEventId={majorEventId} />
              <MajorEventOrganizersSection majorEventId={majorEventId} />
            </>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" asChild>
              <Link href="/admin/major-events">Annuler</Link>
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              {majorEventId ? "Enregistrer" : "Créer le Multi-événements"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
