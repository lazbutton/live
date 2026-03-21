"use client";

import * as React from "react";
import { Link2, Loader2, Save, Star, Trash2 } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type LocationOption = {
  id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  is_organizer?: boolean | null;
};

type LinkedLocation = {
  major_event_id: string;
  location_id: string;
  sort_index: number;
  is_featured: boolean;
  label_override: string | null;
  location?: LocationOption | null;
};

function firstObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry && typeof entry === "object");
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }

  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeLocation(value: unknown): LocationOption | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  return {
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    address: raw.address ? String(raw.address) : null,
    image_url: raw.image_url ? String(raw.image_url) : null,
    latitude: typeof raw.latitude === "number" ? raw.latitude : null,
    longitude: typeof raw.longitude === "number" ? raw.longitude : null,
    is_organizer: raw.is_organizer === true,
  };
}

function normalizeLinkedLocation(value: unknown): LinkedLocation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  return {
    major_event_id: String(raw.major_event_id || ""),
    location_id: String(raw.location_id || ""),
    sort_index: typeof raw.sort_index === "number" ? raw.sort_index : 0,
    is_featured: raw.is_featured === true,
    label_override: raw.label_override ? String(raw.label_override) : null,
    location: normalizeLocation(firstObject(raw.location)),
  };
}

function getWarnings(location: LocationOption) {
  const warnings: string[] = [];
  if (!location.address) warnings.push("Sans adresse");
  if (location.latitude == null || location.longitude == null) warnings.push("Sans coordonnées");
  return warnings;
}

export function MajorEventLocationsSection({ majorEventId }: { majorEventId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [locations, setLocations] = React.useState<LocationOption[]>([]);
  const [linkedLocations, setLinkedLocations] = React.useState<LinkedLocation[]>([]);
  const [labelDrafts, setLabelDrafts] = React.useState<Record<string, string>>({});

  const loadLocations = React.useCallback(async () => {
    setLoading(true);
    try {
      const [locationsResult, linkedLocationsResult] = await Promise.all([
        supabase
          .from("locations")
          .select("id, name, address, image_url, latitude, longitude, is_organizer")
          .order("name", { ascending: true }),
        supabase
          .from("major_event_locations")
          .select(`
            major_event_id,
            location_id,
            sort_index,
            is_featured,
            label_override,
            location:locations(
              id,
              name,
              address,
              image_url,
              latitude,
              longitude,
              is_organizer
            )
          `)
          .eq("major_event_id", majorEventId)
          .order("sort_index", { ascending: true }),
      ]);

      if (locationsResult.error) throw locationsResult.error;
      if (linkedLocationsResult.error) throw linkedLocationsResult.error;

      const normalizedLocations = ((locationsResult.data || []) as unknown[])
          .map((entry) => normalizeLocation(entry))
          .filter((entry): entry is LocationOption => entry != null);
      const normalizedLinkedLocations = ((linkedLocationsResult.data || []) as unknown[])
          .map((entry) => normalizeLinkedLocation(entry))
          .filter((entry): entry is LinkedLocation => entry != null);

      setLocations(normalizedLocations);
      setLinkedLocations(normalizedLinkedLocations);
      setLabelDrafts(
        Object.fromEntries(
          normalizedLinkedLocations.map((link) => [link.location_id, link.label_override || ""]),
        ),
      );
    } catch (error) {
      console.error("Erreur chargement lieux Multi-événements:", error);
      toast({
        title: "Chargement impossible",
        description: "Les lieux du Multi-événements n'ont pas pu être chargés.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [majorEventId]);

  React.useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const filteredCandidates = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const linkedIds = new Set(linkedLocations.map((link) => link.location_id));

    return locations
      .filter((location) => !linkedIds.has(location.id))
      .filter((location) => {
        if (!query) return true;
        return [
          location.name,
          location.address || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 30);
  }, [linkedLocations, locations, searchQuery]);

  async function attachLocation(location: LocationOption) {
    setBusyKey(`attach:${location.id}`);
    try {
      const maxSortIndex = linkedLocations.reduce((max, item) => Math.max(max, item.sort_index || 0), -1);
      const { error } = await supabase.from("major_event_locations").insert({
        major_event_id: majorEventId,
        location_id: location.id,
        sort_index: maxSortIndex + 1,
        is_featured: false,
      });

      if (error) throw error;

      toast({
        title: "Lieu rattaché",
        description:
          `"${location.name}" est maintenant lié au Multi-événements.`,
        variant: "success",
      });

      await loadLocations();
    } catch (error: any) {
      console.error("Erreur rattachement lieu:", error);
      toast({
        title: "Rattachement impossible",
        description: error?.message || "Le lieu n'a pas pu être rattaché.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function removeLocation(locationId: string, name: string) {
    setBusyKey(`remove:${locationId}`);
    try {
      const { error } = await supabase
        .from("major_event_locations")
        .delete()
        .eq("major_event_id", majorEventId)
        .eq("location_id", locationId);

      if (error) throw error;

      toast({
        title: "Lieu retiré",
        description:
          `"${name}" a été retiré du Multi-événements.`,
        variant: "success",
      });

      await loadLocations();
    } catch (error: any) {
      console.error("Erreur suppression lieu:", error);
      toast({
        title: "Suppression impossible",
        description: error?.message || "Le lieu n'a pas pu être retiré.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleFeatured(locationId: string, checked: boolean) {
    setBusyKey(`feature:${locationId}`);
    try {
      const { error } = await supabase
        .from("major_event_locations")
        .update({ is_featured: checked })
        .eq("major_event_id", majorEventId)
        .eq("location_id", locationId);

      if (error) throw error;

      setLinkedLocations((previous) =>
        previous.map((item) =>
          item.location_id == locationId ? { ...item, is_featured: checked } : item,
        ),
      );
    } catch (error: any) {
      console.error("Erreur mise en avant lieu:", error);
      toast({
        title: "Mise à jour impossible",
        description: error?.message || "Le statut de mise en avant n'a pas pu être mis à jour.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function saveLabelOverride(locationId: string) {
    setBusyKey(`label:${locationId}`);
    try {
      const value = labelDrafts[locationId]?.trim() || null;
      const { error } = await supabase
        .from("major_event_locations")
        .update({ label_override: value })
        .eq("major_event_id", majorEventId)
        .eq("location_id", locationId);

      if (error) throw error;

      setLinkedLocations((previous) =>
        previous.map((item) =>
          item.location_id == locationId ? { ...item, label_override: value } : item,
        ),
      );
    } catch (error: any) {
      console.error("Erreur libellé lieu:", error);
      toast({
        title: "Enregistrement impossible",
        description: error?.message || "Le libellé du lieu n'a pas pu être mis à jour.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Lieux participants</CardTitle>
          <CardDescription>
            Outil avancé : complète ou ajuste la liste des lieux visibles si les
            événements rattachés ne suffisent pas encore à raconter la
            programmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Chargement des lieux liés...
            </div>
          ) : linkedLocations.length == 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Aucun lieu n'est encore rattaché à ce Multi-événements.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lieu</TableHead>
                  <TableHead>Qualité</TableHead>
                  <TableHead>Mise en avant</TableHead>
                  <TableHead>Libellé dans le Multi-événements</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedLocations.map((link) => {
                  const location = link.location;
                  if (!location) return null;

                  const warnings = getWarnings(location);

                  return (
                    <TableRow key={location.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{location.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {location.address || "Adresse non renseignée"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {warnings.length == 0 ? (
                          <span className="text-sm text-muted-foreground">RAS</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {warnings.map((warning) => (
                              <Badge key={warning} variant="outline">
                                {warning}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={link.is_featured}
                            onCheckedChange={(checked) => void toggleFeatured(location.id, checked)}
                            disabled={busyKey == `feature:${location.id}`}
                          />
                          {link.is_featured ? (
                            <Badge>
                              <Star className="mr-1 h-3.5 w-3.5" />
                              Mis en avant
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Standard</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Input
                            value={labelDrafts[location.id] || ""}
                            onChange={(event) =>
                              setLabelDrafts((previous) => ({
                                ...previous,
                                [location.id]: event.target.value,
                              }))
                            }
                            placeholder={location.name}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busyKey == `label:${location.id}`}
                            onClick={() => void saveLabelOverride(location.id)}
                          >
                            {busyKey == `label:${location.id}` ? <Loader2 className="animate-spin" /> : <Save />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyKey == `remove:${location.id}`}
                          onClick={() => void removeLocation(location.id, location.name)}
                        >
                          {busyKey == `remove:${location.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
                          Retirer
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ajouter des lieux</CardTitle>
          <CardDescription>
            Prépare la carte et la navigation du Multi-événements, même avant
            que tous les événements ne soient rattachés.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Rechercher par nom ou adresse"
          />

          {loading ? null : filteredCandidates.length == 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Aucun lieu disponible avec les filtres actuels.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lieu</TableHead>
                  <TableHead>Données</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCandidates.map((location) => {
                  const warnings = getWarnings(location);
                  return (
                    <TableRow key={location.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{location.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {location.address || "Adresse non renseignée"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {location.is_organizer == true ? (
                            <Badge variant="outline">Lieu-organisateur</Badge>
                          ) : null}
                          {warnings.length == 0 ? (
                            <Badge variant="outline">Complet</Badge>
                          ) : (
                            warnings.map((warning) => (
                              <Badge key={warning} variant="outline">
                                {warning}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyKey == `attach:${location.id}`}
                          onClick={() => void attachLocation(location)}
                        >
                          {busyKey == `attach:${location.id}` ? <Loader2 className="animate-spin" /> : <Link2 />}
                          Rattacher
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
