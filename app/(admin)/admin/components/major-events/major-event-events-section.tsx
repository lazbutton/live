"use client";

import * as React from "react";
import { Link2, Loader2, Star, Trash2 } from "lucide-react";

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

type LinkedMajorEventRef = {
  id: string;
  title: string;
  slug: string;
};

type EventLinkInfo = {
  major_event_id: string;
  sort_index?: number | null;
  is_featured?: boolean | null;
  major_event?: LinkedMajorEventRef | null;
};

type ProgramEvent = {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  status: string;
  category: string | null;
  location?: { id?: string; name?: string } | null;
  major_event_events?: EventLinkInfo[];
};

type LinkedProgramEvent = {
  major_event_id: string;
  event_id: string;
  sort_index: number;
  is_featured: boolean;
  program_label_override?: string | null;
  event?: ProgramEvent | null;
};

function formatEventDate(date: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  } catch {
    return date;
  }
}

function buildSearchText(event: ProgramEvent) {
  return [
    event.title,
    event.location?.name || "",
    event.category || "",
    event.status || "",
  ]
    .join(" ")
    .toLowerCase();
}

function getQualityWarnings(event: ProgramEvent, hubStartAt?: string, hubEndAt?: string) {
  const warnings: string[] = [];

  if (!event.location?.name) {
    warnings.push("Sans lieu");
  }

  if (!event.end_date) {
    warnings.push("Sans fin");
  }

  const eventStart = new Date(event.date);
  const eventEnd = event.end_date ? new Date(event.end_date) : null;
  const hubStart = hubStartAt ? new Date(hubStartAt) : null;
  const hubEnd = hubEndAt ? new Date(hubEndAt) : null;

  if (
    hubStart &&
    hubEnd &&
    !Number.isNaN(eventStart.getTime()) &&
    !Number.isNaN(hubStart.getTime()) &&
    !Number.isNaN(hubEnd.getTime())
  ) {
    const effectiveEnd = eventEnd && !Number.isNaN(eventEnd.getTime()) ? eventEnd : eventStart;
    if (eventStart < hubStart || effectiveEnd > hubEnd) {
      warnings.push("Hors plage");
    }
  }

  return warnings;
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry && typeof entry === "object");
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }

  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeLinkInfos(value: unknown): EventLinkInfo[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const raw = entry as Record<string, unknown>;
    const majorEvent = firstObject(raw.major_event);

    return {
      major_event_id: String(raw.major_event_id || ""),
      sort_index: typeof raw.sort_index === "number" ? raw.sort_index : null,
      is_featured: raw.is_featured === true,
      major_event: majorEvent
        ? {
            id: String(majorEvent.id || ""),
            title: String(majorEvent.title || ""),
            slug: String(majorEvent.slug || ""),
          }
        : null,
    };
  });
}

function normalizeProgramEvent(value: unknown): ProgramEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const location = firstObject(raw.location);

  return {
    id: String(raw.id || ""),
    title: String(raw.title || ""),
    date: String(raw.date || ""),
    end_date: raw.end_date ? String(raw.end_date) : null,
    status: String(raw.status || ""),
    category: raw.category ? String(raw.category) : null,
    location: location
      ? {
          id: location.id ? String(location.id) : undefined,
          name: location.name ? String(location.name) : undefined,
        }
      : null,
    major_event_events: normalizeLinkInfos(raw.major_event_events),
  };
}

function normalizeLinkedProgramEvent(value: unknown): LinkedProgramEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  return {
    major_event_id: String(raw.major_event_id || ""),
    event_id: String(raw.event_id || ""),
    sort_index: typeof raw.sort_index === "number" ? raw.sort_index : 0,
    is_featured: raw.is_featured === true,
    program_label_override: raw.program_label_override ? String(raw.program_label_override) : null,
    event: normalizeProgramEvent(firstObject(raw.event)),
  };
}

export function MajorEventEventsSection({
  majorEventId,
  hubStartAt,
  hubEndAt,
}: {
  majorEventId: string;
  hubStartAt?: string;
  hubEndAt?: string;
}) {
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [events, setEvents] = React.useState<ProgramEvent[]>([]);
  const [linkedEvents, setLinkedEvents] = React.useState<LinkedProgramEvent[]>([]);
  const [busyEventId, setBusyEventId] = React.useState<string | null>(null);

  const loadProgram = React.useCallback(async () => {
    setLoading(true);
    try {
      const [eventsResult, linkedEventsResult] = await Promise.all([
        supabase
          .from("events")
          .select(`
            id,
            title,
            date,
            end_date,
            status,
            category,
            location:locations(id, name),
            major_event_events(
              major_event_id,
              sort_index,
              is_featured,
              major_event:major_events(
                id,
                title,
                slug
              )
            )
          `)
          .order("date", { ascending: true }),
        supabase
          .from("major_event_events")
          .select(`
            major_event_id,
            event_id,
            sort_index,
            is_featured,
            program_label_override,
            event:events(
              id,
              title,
              date,
              end_date,
              status,
              category,
              location:locations(id, name)
            )
          `)
          .eq("major_event_id", majorEventId)
          .order("sort_index", { ascending: true }),
      ]);

      if (eventsResult.error) throw eventsResult.error;
      if (linkedEventsResult.error) throw linkedEventsResult.error;

      setEvents(
        ((eventsResult.data || []) as unknown[])
          .map((entry) => normalizeProgramEvent(entry))
          .filter((entry): entry is ProgramEvent => entry != null),
      );
      setLinkedEvents(
        ((linkedEventsResult.data || []) as unknown[])
          .map((entry) => normalizeLinkedProgramEvent(entry))
          .filter((entry): entry is LinkedProgramEvent => entry != null),
      );
    } catch (error) {
      console.error(
        "Erreur chargement programme Multi-événements:",
        error,
      );
      toast({
        title: "Chargement impossible",
        description: "Le programme du Multi-événements n'a pas pu être chargé.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [majorEventId]);

  React.useEffect(() => {
    void loadProgram();
  }, [loadProgram]);

  const filteredCandidates = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return events
      .filter((event) => {
        const isAlreadyLinkedHere = event.major_event_events?.some((link) => link.major_event_id === majorEventId);
        if (isAlreadyLinkedHere) return false;

        if (!query) return true;
        return buildSearchText(event).includes(query);
      })
      .slice(0, 30);
  }, [events, majorEventId, searchQuery]);

  async function attachEvent(event: ProgramEvent) {
    setBusyEventId(event.id);
    try {
      const maxSortIndex = linkedEvents.reduce((max, item) => Math.max(max, item.sort_index || 0), -1);
      const { error } = await supabase.from("major_event_events").insert({
        major_event_id: majorEventId,
        event_id: event.id,
        sort_index: maxSortIndex + 1,
        is_featured: false,
      });

      if (error) throw error;

      toast({
        title: "Événement rattaché",
        description:
          `"${event.title}" est maintenant dans le programme du Multi-événements.`,
        variant: "success",
      });

      await loadProgram();
    } catch (error: any) {
      console.error("Erreur rattachement event -> major_event:", error);
      toast({
        title: "Rattachement impossible",
        description: error?.message || "L'événement n'a pas pu être rattaché.",
        variant: "destructive",
      });
    } finally {
      setBusyEventId(null);
    }
  }

  async function removeEvent(eventId: string, title: string) {
    setBusyEventId(eventId);
    try {
      const { error } = await supabase
        .from("major_event_events")
        .delete()
        .eq("major_event_id", majorEventId)
        .eq("event_id", eventId);

      if (error) throw error;

      toast({
        title: "Événement retiré",
        description:
          `"${title}" a été retiré du programme du Multi-événements.`,
        variant: "success",
      });

      await loadProgram();
    } catch (error: any) {
      console.error("Erreur suppression event -> major_event:", error);
      toast({
        title: "Suppression impossible",
        description: error?.message || "L'événement n'a pas pu être retiré.",
        variant: "destructive",
      });
    } finally {
      setBusyEventId(null);
    }
  }

  async function toggleFeatured(eventId: string, checked: boolean) {
    setBusyEventId(eventId);
    try {
      const { error } = await supabase
        .from("major_event_events")
        .update({ is_featured: checked })
        .eq("major_event_id", majorEventId)
        .eq("event_id", eventId);

      if (error) throw error;

      setLinkedEvents((previous) =>
        previous.map((item) =>
          item.event_id === eventId ? { ...item, is_featured: checked } : item,
        ),
      );
    } catch (error: any) {
      console.error("Erreur toggle featured:", error);
      toast({
        title: "Mise à jour impossible",
        description: error?.message || "Le statut de mise en avant n'a pas pu être mis à jour.",
        variant: "destructive",
      });
    } finally {
      setBusyEventId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Programme du Multi-événements</CardTitle>
          <CardDescription>
            Point de contrôle secondaire : le rattachement principal se fait
            depuis la fiche événement, puis cette section sert à vérifier le
            programme et les incohérences éventuelles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Chargement des événements liés...
            </div>
          ) : linkedEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Aucun événement n'est encore rattaché à ce Multi-événements.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Événement</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Alertes</TableHead>
                  <TableHead>Mise en avant</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedEvents.map((link) => {
                  const event = link.event;
                  if (!event) return null;

                  const warnings = getQualityWarnings(event, hubStartAt, hubEndAt);

                  return (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{event.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatEventDate(event.date)}
                            {event.location?.name ? ` • ${event.location.name}` : ""}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.status === "approved" ? "default" : "outline"}>
                          {event.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {warnings.length === 0 ? (
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
                            onCheckedChange={(checked) => void toggleFeatured(event.id, checked)}
                            disabled={busyEventId === event.id}
                          />
                          {link.is_featured ? (
                            <Badge>
                              <Star className="mr-1 h-3.5 w-3.5" />
                              Mise en avant
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Standard</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyEventId === event.id}
                          onClick={() => void removeEvent(event.id, event.title)}
                        >
                          {busyEventId === event.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
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
          <CardTitle>Ajouter des événements</CardTitle>
          <CardDescription>
            Recherche dans les événements existants. Un événement ne peut
            appartenir qu'à un seul Multi-événements en V1.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Rechercher par titre, lieu, catégorie ou statut"
          />

          {loading ? null : filteredCandidates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Aucun événement disponible avec les filtres actuels.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Événement</TableHead>
                  <TableHead>Liaison actuelle</TableHead>
                  <TableHead>Qualité</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCandidates.map((event) => {
                  const existingLink = event.major_event_events?.[0];
                  const linkedToOtherHub =
                    existingLink != null && existingLink.major_event_id !== majorEventId;
                  const warnings = getQualityWarnings(event, hubStartAt, hubEndAt);

                  return (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{event.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatEventDate(event.date)}
                            {event.location?.name ? ` • ${event.location.name}` : ""}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {linkedToOtherHub ? (
                          <Badge variant="outline">
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            Déjà lié à{" "}
                            {existingLink?.major_event?.title ||
                              "un autre Multi-événements"}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">Disponible</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {warnings.length === 0 ? (
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
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          disabled={linkedToOtherHub || busyEventId === event.id}
                          onClick={() => void attachEvent(event)}
                        >
                          {busyEventId === event.id ? <Loader2 className="animate-spin" /> : <Link2 />}
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
