"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Inbox,
  ListChecks,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type CommandKind =
  | "action"
  | "event"
  | "request"
  | "location"
  | "organizer"
  | "source";

type CommandItem = {
  id: string;
  kind: CommandKind;
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
  keywords?: string;
};

const kindMeta: Record<
  CommandKind,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  action: { label: "Action", icon: Sparkles },
  event: { label: "Événement", icon: Calendar },
  request: { label: "Demande", icon: Inbox },
  location: { label: "Lieu", icon: MapPin },
  organizer: { label: "Organisateur", icon: Users },
  source: { label: "Source", icon: ListChecks },
};

const quickActions: CommandItem[] = [
  {
    id: "action-create-event",
    kind: "action",
    title: "Créer un événement",
    subtitle: "Ouvre le formulaire événement",
    href: "/admin/events?create=1",
    keywords: "nouveau creation evenement event",
  },
  {
    id: "action-import-url",
    kind: "action",
    title: "Importer depuis une URL",
    subtitle: "Scraper une page événement",
    href: "/admin/events?import=1",
    keywords: "import url scraper evenement",
  },
  {
    id: "action-requests",
    kind: "action",
    title: "Traiter les demandes",
    subtitle: "File admin des contributions",
    href: "/admin/requests",
    keywords: "demandes inbox contributions",
  },
  {
    id: "action-intake",
    kind: "action",
    title: "Reprendre la collecte",
    subtitle: "Sources, captures et opportunités",
    href: "/admin/intake",
    keywords: "collecte veille sources intake opportunites",
  },
  {
    id: "action-moderation",
    kind: "action",
    title: "Ouvrir la modération",
    subtitle: "Signalements UGC ouverts",
    href: "/admin/moderation?status=pending",
    keywords: "moderation signalements ugc reports",
  },
  {
    id: "action-settings-system",
    kind: "action",
    title: "Réglages système",
    subtitle: "Crons, feedbacks, activité",
    href: "/admin/settings?tab=system",
    keywords: "settings reglages systeme feedbacks crons",
  },
];

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeIlike(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

function formatShortDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function requestTitle(row: any) {
  const eventData = row?.event_data || {};
  return (
    eventData.title ||
    eventData.name ||
    row?.source_url ||
    `Demande ${String(row?.id || "").slice(0, 8)}`
  );
}

function filterQuickActions(query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return quickActions;

  return quickActions.filter((item) =>
    normalizeSearch(`${item.title} ${item.subtitle || ""} ${item.keywords || ""}`).includes(
      normalized,
    ),
  );
}

export function AdminCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CommandItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    const actions = filterQuickActions(trimmed);

    if (trimmed.length < 2) {
      setResults(actions);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const pattern = `%${escapeIlike(trimmed)}%`;
        const [eventsRes, requestsRes, locationsRes, organizersRes, sourcesRes] =
          await Promise.all([
            supabase
              .from("events")
              .select("id,title,date,status,location:locations(name)")
              .ilike("title", pattern)
              .order("date", { ascending: false })
              .limit(5),
            supabase
              .from("user_requests")
              .select("id,status,request_type,requested_at,event_data,source_url")
              .or(`source_url.ilike.${pattern},event_data->>title.ilike.${pattern}`)
              .order("requested_at", { ascending: false })
              .limit(5),
            supabase
              .from("locations")
              .select("id,name,city:cities(label)")
              .ilike("name", pattern)
              .order("name")
              .limit(5),
            supabase
              .from("organizers")
              .select("id,name")
              .ilike("name", pattern)
              .order("name")
              .limit(5),
            supabase
              .from("event_sources")
              .select("id,name,priority,status,next_scan_at")
              .ilike("name", pattern)
              .order("priority")
              .limit(5),
          ]);

        if (cancelled) return;

        const nextResults: CommandItem[] = [
          ...actions,
          ...((eventsRes.data || []) as any[]).map((event) => ({
            id: `event-${event.id}`,
            kind: "event" as const,
            title: event.title || "Événement sans titre",
            subtitle: [
              formatShortDate(event.date),
              event.location?.name,
              event.status,
            ]
              .filter(Boolean)
              .join(" • "),
            href: `/admin/events?view=agenda&start=${String(event.date || "").slice(0, 10)}`,
            badge: event.status,
          })),
          ...((requestsRes.data || []) as any[]).map((request) => ({
            id: `request-${request.id}`,
            kind: "request" as const,
            title: requestTitle(request),
            subtitle: [
              request.request_type === "event_from_url" ? "Depuis URL" : "Formulaire",
              formatShortDate(request.requested_at),
            ]
              .filter(Boolean)
              .join(" • "),
            href: `/admin/requests?request=${request.id}`,
            badge: request.status,
          })),
          ...((locationsRes.data || []) as any[]).map((location) => ({
            id: `location-${location.id}`,
            kind: "location" as const,
            title: location.name || "Lieu sans nom",
            subtitle: location.city?.label || "Lieu",
            href: `/admin/locations?open=${location.id}`,
          })),
          ...((organizersRes.data || []) as any[]).map((organizer) => ({
            id: `organizer-${organizer.id}`,
            kind: "organizer" as const,
            title: organizer.name || "Organisateur sans nom",
            subtitle: "Organisateur",
            href: `/admin/organizers?open=${organizer.id}`,
          })),
          ...((sourcesRes.data || []) as any[]).map((source) => ({
            id: `source-${source.id}`,
            kind: "source" as const,
            title: source.name || "Source sans nom",
            subtitle: [
              source.priority ? `P${source.priority}` : null,
              source.status,
              source.next_scan_at ? `prochain scan ${formatShortDate(source.next_scan_at)}` : null,
            ]
              .filter(Boolean)
              .join(" • "),
            href: `/admin/intake?source=${source.id}`,
            badge: source.status,
          })),
        ];

        setResults(nextResults);
      } catch (error) {
        console.error("Erreur recherche admin:", error);
        if (!cancelled) setResults(actions);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const openItem = React.useCallback(
    (item: CommandItem) => {
      setOpen(false);
      setQuery("");
      router.push(item.href);
    },
    [router],
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="hidden h-9 min-w-[220px] justify-start gap-2 text-muted-foreground md:flex"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        Rechercher ou agir
        <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Ouvrir la recherche admin"
        onClick={() => setOpen(true)}
      >
        <Search className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Commandes admin</DialogTitle>
            <DialogDescription>
              Cherche un événement, une demande, un lieu, un organisateur ou une source.
            </DialogDescription>
          </DialogHeader>

          <div className="border-b p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && results[0]) {
                    event.preventDefault();
                    openItem(results[0]);
                  }
                }}
                placeholder="Ex. Rex Club, demande URL, source P0..."
                className="h-11 pl-10"
              />
            </div>
          </div>

          <div className="max-h-[65vh] overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Recherche en cours...
              </div>
            ) : results.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Aucun résultat. Essaie un titre, un lieu ou une URL.
              </div>
            ) : (
              <div className="space-y-1">
                {results.map((item) => {
                  const meta = kindMeta[item.kind];
                  const Icon = meta.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                        "hover:bg-accent focus:bg-accent focus:outline-none",
                      )}
                      onClick={() => openItem(item)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {item.subtitle || meta.label}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {item.badge ? (
                          <Badge variant="outline" className="max-w-[120px] truncate">
                            {item.badge}
                          </Badge>
                        ) : null}
                        <Badge variant="secondary">{meta.label}</Badge>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span>Entrée ouvre le premier résultat.</span>
            <span>Échap ferme la palette.</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
