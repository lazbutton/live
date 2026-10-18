"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  CornerDownLeft,
  Inbox,
  ListChecks,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_ITEMS } from "./admin-nav";
import { useEventCreation } from "./events/event-creation-provider";

type CommandKind =
  | "navigation"
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
  /** Action exécutée sur place au lieu de naviguer. */
  action?: "create-event";
};

const kindMeta: Record<
  CommandKind,
  {
    label: string;
    group: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  navigation: { label: "Page", group: "Aller à", icon: ArrowRight },
  action: { label: "Action", group: "Actions", icon: Sparkles },
  event: { label: "Événement", group: "Événements", icon: Calendar },
  request: { label: "Demande", group: "Demandes", icon: Inbox },
  location: { label: "Lieu", group: "Lieux", icon: MapPin },
  organizer: { label: "Organisateur", group: "Organisateurs", icon: Users },
  source: { label: "Source", group: "Sources de collecte", icon: ListChecks },
};

const navigationItems: CommandItem[] = ADMIN_NAV_ITEMS.map((item) => ({
  id: `nav-${item.url}`,
  kind: "navigation" as const,
  title: item.title,
  href: item.url,
  keywords: item.keywords,
}));

const STATUS_META: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  approved: { label: "Validé", variant: "success" },
  published: { label: "Publié", variant: "success" },
  converted: { label: "Converti", variant: "success" },
  active: { label: "Active", variant: "success" },
  pending: { label: "En attente", variant: "warning" },
  paused: { label: "En pause", variant: "muted" },
  rejected: { label: "Refusé", variant: "destructive" },
  error: { label: "Erreur", variant: "destructive" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={meta.variant} className="max-w-[120px] truncate">
      {meta.label}
    </Badge>
  );
}

const quickActions: CommandItem[] = [
  {
    id: "action-create-event",
    kind: "action",
    title: "Nouvel événement",
    subtitle: "Coller un lien, déposer une affiche ou saisir · touche N",
    href: "/admin/events",
    action: "create-event",
    keywords: "nouveau creer creation evenement event ajouter import url lien affiche image facebook instagram",
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

function filterLocalItems(query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return [...quickActions, ...navigationItems];

  return [...quickActions, ...navigationItems].filter((item) =>
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
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

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
    const actions = filterLocalItems(trimmed);

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
              .select("id,name,status,next_scan_at")
              .ilike("name", pattern)
              .order("name")
              .limit(5),
          ]);

        if (cancelled) return;

        const nextResults: CommandItem[] = [
          ...actions,
          ...((eventsRes.data || []) as any[]).map((event) => ({
            id: `event-${event.id}`,
            kind: "event" as const,
            title: event.title || "Événement sans titre",
            subtitle: [formatShortDate(event.date), event.location?.name]
              .filter(Boolean)
              .join(" · "),
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
              .join(" · "),
            href: `/admin/requests?request=${request.id}`,
            badge: request.status,
          })),
          ...((locationsRes.data || []) as any[]).map((location) => ({
            id: `location-${location.id}`,
            kind: "location" as const,
            title: location.name || "Lieu sans nom",
            subtitle: location.city?.label || undefined,
            href: `/admin/locations?open=${location.id}`,
          })),
          ...((organizersRes.data || []) as any[]).map((organizer) => ({
            id: `organizer-${organizer.id}`,
            kind: "organizer" as const,
            title: organizer.name || "Organisateur sans nom",
            href: `/admin/organizers?open=${organizer.id}`,
          })),
          ...((sourcesRes.data || []) as any[]).map((source) => ({
            id: `source-${source.id}`,
            kind: "source" as const,
            title: source.name || "Source sans nom",
            subtitle:
              source.status !== "active"
                ? "Source en pause"
                : !source.next_scan_at || Date.parse(source.next_scan_at) <= Date.now()
                  ? "Source à revoir"
                  : `Source · prochaine revue ${formatShortDate(source.next_scan_at)}`,
            href: `/admin/intake?source=${source.id}`,
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

  const { openEventCreation } = useEventCreation();

  const openItem = React.useCallback(
    (item: CommandItem) => {
      setOpen(false);
      setQuery("");
      if (item.action === "create-event") {
        // Laisse la palette se fermer avant d'ouvrir le lanceur.
        window.setTimeout(() => openEventCreation(), 0);
        return;
      }
      router.push(item.href);
    },
    [openEventCreation, router],
  );

  // Réinitialise la sélection clavier à chaque nouvelle liste de résultats.
  React.useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  React.useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const groups = React.useMemo(() => {
    const map = new Map<string, Array<{ item: CommandItem; index: number }>>();
    results.forEach((item, index) => {
      const group = kindMeta[item.kind].group;
      const entries = map.get(group) ?? [];
      entries.push({ item, index });
      map.set(group, entries);
    });
    return Array.from(map.entries());
  }, [results]);

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (results.length ? (current + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length ? (current - 1 + results.length) % results.length : 0,
      );
    } else if (event.key === "Enter") {
      const item = results[activeIndex] ?? results[0];
      if (item) {
        event.preventDefault();
        openItem(item);
      }
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden w-56 justify-start gap-2 bg-muted/40 px-2.5 font-normal text-muted-foreground shadow-none hover:bg-muted hover:text-foreground md:flex lg:w-64 dark:bg-input/20"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span>Rechercher…</span>
        <kbd className="pointer-events-none ml-auto inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-foreground md:hidden"
        aria-label="Rechercher dans l'admin"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:top-[12vh] sm:max-w-xl sm:translate-y-0 [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">Recherche et commandes</DialogTitle>
          <DialogDescription className="sr-only">
            Cherche un événement, une demande, un lieu, un organisateur ou une source, ou ouvre une page.
          </DialogDescription>

          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Rechercher un événement, un lieu, une page…"
              className="h-12 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground max-md:h-14"
              role="combobox"
              aria-expanded="true"
              aria-controls="admin-command-results"
              aria-activedescendant={results[activeIndex] ? `command-${results[activeIndex].id}` : undefined}
            />
            {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
          </div>

          <div
            ref={listRef}
            id="admin-command-results"
            role="listbox"
            className="max-h-[min(60vh,440px)] flex-1 overflow-y-auto p-1.5 max-md:max-h-none"
          >
            {results.length === 0 && !loading ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                Aucun résultat pour « {query.trim()} ».
              </div>
            ) : (
              groups.map(([group, entries]) => (
                <div key={group} role="group" aria-label={group} className="pb-1">
                  <div className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground">{group}</div>
                  {entries.map(({ item, index }) => {
                    const meta = kindMeta[item.kind];
                    const Icon = meta.icon;
                    const isActive = index === activeIndex;

                    return (
                      <button
                        key={item.id}
                        id={`command-${item.id}`}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-index={index}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors",
                          isActive ? "bg-accent text-accent-foreground" : "text-foreground",
                        )}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => openItem(item)}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{item.title}</span>
                          {item.subtitle ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.subtitle}
                            </span>
                          ) : null}
                        </span>
                        {item.badge ? <StatusBadge status={item.badge} /> : null}
                        {isActive ? (
                          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="hidden items-center gap-4 border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground md:flex">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">↑</kbd>
              <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">↓</kbd>
              naviguer
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">↵</kbd>
              ouvrir
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">esc</kbd>
              fermer
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
