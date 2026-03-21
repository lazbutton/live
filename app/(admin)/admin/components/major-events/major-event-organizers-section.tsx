"use client";

import * as React from "react";
import { Link2, Loader2, Save, Trash2 } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrganizerCandidate = {
  id: string;
  name: string;
  type: "organizer" | "location";
  image_url: string | null;
};

type LinkedOrganizer = {
  id: string;
  major_event_id: string;
  organizer_id: string | null;
  location_id: string | null;
  role_label: string | null;
  sort_index: number;
  entity: OrganizerCandidate;
};

function firstObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry && typeof entry === "object");
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }

  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeOrganizerCandidate(value: unknown): OrganizerCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  return {
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    type: raw.type === "location" ? "location" : "organizer",
    image_url: raw.image_url ? String(raw.image_url) : null,
  };
}

function normalizeLinkedOrganizer(value: unknown): LinkedOrganizer | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const organizer = firstObject(raw.organizers);
  const location = firstObject(raw.locations);

  const entity = organizer
      ? normalizeOrganizerCandidate({
          id: organizer.id,
          name: organizer.name,
          image_url: organizer.icon_url ?? organizer.logo_url ?? null,
          type: "organizer",
        })
      : normalizeOrganizerCandidate({
          id: location?.id,
          name: location?.name,
          image_url: location?.image_url ?? null,
          type: "location",
        });

  if (entity == null) return null;

  return {
    id: String(raw.id || ""),
    major_event_id: String(raw.major_event_id || ""),
    organizer_id: raw.organizer_id ? String(raw.organizer_id) : null,
    location_id: raw.location_id ? String(raw.location_id) : null,
    role_label: raw.role_label ? String(raw.role_label) : null,
    sort_index: typeof raw.sort_index === "number" ? raw.sort_index : 0,
    entity,
  };
}

export function MajorEventOrganizersSection({ majorEventId }: { majorEventId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [candidates, setCandidates] = React.useState<OrganizerCandidate[]>([]);
  const [linkedOrganizers, setLinkedOrganizers] = React.useState<LinkedOrganizer[]>([]);
  const [roleDrafts, setRoleDrafts] = React.useState<Record<string, string>>({});

  const loadOrganizers = React.useCallback(async () => {
    setLoading(true);
    try {
      const [organizersResult, locationOrganizersResult, linkedOrganizersResult] = await Promise.all([
        supabase
          .from("organizers")
          .select("id, name, icon_url, logo_url")
          .order("name", { ascending: true }),
        supabase
          .from("locations")
          .select("id, name, image_url")
          .eq("is_organizer", true)
          .order("name", { ascending: true }),
        supabase
          .from("major_event_organizers")
          .select(`
            id,
            major_event_id,
            organizer_id,
            location_id,
            role_label,
            sort_index,
            organizers(
              id,
              name,
              icon_url,
              logo_url
            ),
            locations(
              id,
              name,
              image_url
            )
          `)
          .eq("major_event_id", majorEventId)
          .order("sort_index", { ascending: true }),
      ]);

      if (organizersResult.error) throw organizersResult.error;
      if (locationOrganizersResult.error) throw locationOrganizersResult.error;
      if (linkedOrganizersResult.error) throw linkedOrganizersResult.error;

      const organizerCandidates = ((organizersResult.data || []) as Array<Record<string, unknown>>).map((entry) => ({
        id: String(entry.id || ""),
        name: String(entry.name || ""),
        type: "organizer" as const,
        image_url: entry.icon_url ? String(entry.icon_url) : entry.logo_url ? String(entry.logo_url) : null,
      }));
      const locationCandidates = ((locationOrganizersResult.data || []) as Array<Record<string, unknown>>).map((entry) => ({
        id: String(entry.id || ""),
        name: String(entry.name || ""),
        type: "location" as const,
        image_url: entry.image_url ? String(entry.image_url) : null,
      }));

      const linked = ((linkedOrganizersResult.data || []) as unknown[])
          .map((entry) => normalizeLinkedOrganizer(entry))
          .filter((entry): entry is LinkedOrganizer => entry != null);

      setCandidates(
        [...organizerCandidates, ...locationCandidates].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setLinkedOrganizers(linked);
      setRoleDrafts(
        Object.fromEntries(
          linked.map((link) => [link.id, link.role_label || ""]),
        ),
      );
    } catch (error) {
      console.error(
        "Erreur chargement organisateurs Multi-événements:",
        error,
      );
      toast({
        title: "Chargement impossible",
        description:
          "Les organisateurs du Multi-événements n'ont pas pu être chargés.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [majorEventId]);

  React.useEffect(() => {
    void loadOrganizers();
  }, [loadOrganizers]);

  const filteredCandidates = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const linkedKeys = new Set(
      linkedOrganizers.map((link) => `${link.entity.type}:${link.entity.id}`),
    );

    return candidates
      .filter((candidate) => !linkedKeys.has(`${candidate.type}:${candidate.id}`))
      .filter((candidate) => {
        if (!query) return true;
        return [candidate.name, candidate.type].join(" ").toLowerCase().includes(query);
      })
      .slice(0, 30);
  }, [candidates, linkedOrganizers, searchQuery]);

  async function attachCandidate(candidate: OrganizerCandidate) {
    setBusyKey(`attach:${candidate.type}:${candidate.id}`);
    try {
      const maxSortIndex = linkedOrganizers.reduce((max, item) => Math.max(max, item.sort_index || 0), -1);
      const payload =
        candidate.type === "organizer"
          ? {
              major_event_id: majorEventId,
              organizer_id: candidate.id,
              location_id: null,
              sort_index: maxSortIndex + 1,
            }
          : {
              major_event_id: majorEventId,
              organizer_id: null,
              location_id: candidate.id,
              sort_index: maxSortIndex + 1,
            };

      const { error } = await supabase.from("major_event_organizers").insert(payload);
      if (error) throw error;

      toast({
        title: "Organisateur rattaché",
        description:
          `"${candidate.name}" est maintenant lié au Multi-événements.`,
        variant: "success",
      });

      await loadOrganizers();
    } catch (error: any) {
      console.error("Erreur rattachement organisateur:", error);
      toast({
        title: "Rattachement impossible",
        description: error?.message || "L'organisateur n'a pas pu être rattaché.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function removeLinkedOrganizer(linkedId: string, name: string) {
    setBusyKey(`remove:${linkedId}`);
    try {
      const { error } = await supabase.from("major_event_organizers").delete().eq("id", linkedId);
      if (error) throw error;

      toast({
        title: "Organisateur retiré",
        description:
          `"${name}" a été retiré du Multi-événements.`,
        variant: "success",
      });

      await loadOrganizers();
    } catch (error: any) {
      console.error("Erreur suppression organisateur:", error);
      toast({
        title: "Suppression impossible",
        description: error?.message || "L'organisateur n'a pas pu être retiré.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function saveRoleLabel(linkedId: string) {
    setBusyKey(`role:${linkedId}`);
    try {
      const value = roleDrafts[linkedId]?.trim() || null;
      const { error } = await supabase
        .from("major_event_organizers")
        .update({ role_label: value })
        .eq("id", linkedId);

      if (error) throw error;

      setLinkedOrganizers((previous) =>
        previous.map((item) => (item.id === linkedId ? { ...item, role_label: value } : item)),
      );
    } catch (error: any) {
      console.error("Erreur role organisateur:", error);
      toast({
        title: "Enregistrement impossible",
        description: error?.message || "Le rôle d'affichage n'a pas pu être mis à jour.",
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
          <CardTitle>Organisateurs et partenaires</CardTitle>
          <CardDescription>
            Outil avancé : complète les organisateurs et partenaires si les
            événements rattachés ne suffisent pas encore pour l'affichage
            public.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Chargement des organisateurs liés...
            </div>
          ) : linkedOrganizers.length == 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Aucun organisateur n'est encore rattaché à ce Multi-événements.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Rôle d'affichage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedOrganizers.map((linked) => (
                  <TableRow key={linked.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{linked.entity.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {linked.entity.type === "location" ? "Lieu-organisateur" : "Organisateur"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {linked.entity.type === "location" ? "Lieu-organisateur" : "Organisateur"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Input
                          value={roleDrafts[linked.id] || ""}
                          onChange={(event) =>
                            setRoleDrafts((previous) => ({
                              ...previous,
                              [linked.id]: event.target.value,
                            }))
                          }
                          placeholder="Partenaire, co-prod, scène invitée..."
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyKey == `role:${linked.id}`}
                          onClick={() => void saveRoleLabel(linked.id)}
                        >
                          {busyKey == `role:${linked.id}` ? <Loader2 className="animate-spin" /> : <Save />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyKey == `remove:${linked.id}`}
                        onClick={() => void removeLinkedOrganizer(linked.id, linked.entity.name)}
                      >
                        {busyKey == `remove:${linked.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
                        Retirer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ajouter des organisateurs</CardTitle>
          <CardDescription>
            Recherche parmi les organisateurs classiques et les lieux déjà configurés en tant qu'organisateurs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Rechercher par nom"
          />

          {loading ? null : filteredCandidates.length == 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Aucun organisateur disponible avec les filtres actuels.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCandidates.map((candidate) => (
                  <TableRow key={`${candidate.type}:${candidate.id}`}>
                    <TableCell className="font-medium">{candidate.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {candidate.type === "location" ? "Lieu-organisateur" : "Organisateur"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyKey == `attach:${candidate.type}:${candidate.id}`}
                        onClick={() => void attachCandidate(candidate)}
                      >
                        {busyKey == `attach:${candidate.type}:${candidate.id}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Link2 />
                        )}
                        Rattacher
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
