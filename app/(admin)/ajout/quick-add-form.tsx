"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Building2,
  Check,
  ClipboardPaste,
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  Loader2,
  LocateFixed,
  MapPin,
  Mic2,
  TriangleAlert,
} from "lucide-react";

import { AddressInput } from "@/components/ui/address-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { guessNameFromLink, normalizeQuickLink, type QuickLink } from "@/lib/collecte/quick-links";
import { cn } from "@/lib/utils";

import {
  attachLinkToEntry,
  createQuickEntry,
  findQuickMatches,
  suggestNameFromWebsite,
  type QuickEntryResult,
  type QuickEntryType,
  type QuickMatch,
} from "./actions";

type Draft = {
  type: QuickEntryType;
  link: string;
  name: string;
  /** Nom tapé à la main : les suggestions tirées du lien ne l'écrasent plus. */
  nameEdited: boolean;
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** Lieu qui organise ses soirées : suivi par la collecte. */
  follow: boolean;
  artistType: string;
  originCity: string;
};

type Success = Extract<QuickEntryResult, { ok: true }> & { attached: boolean };

type HistoryItem = { type: QuickEntryType; id: string; name: string; followed: boolean; at: string };

const DRAFT_KEY = "outlive-ajout:draft";
const HISTORY_KEY = "outlive-ajout:history";
const NETWORK_ERROR = "Pas de réseau : ta saisie est gardée, réessaie dans un instant.";

const EMPTY_DRAFT: Draft = {
  type: "location",
  link: "",
  name: "",
  nameEdited: false,
  address: "",
  latitude: null,
  longitude: null,
  follow: true,
  artistType: "",
  originCity: "",
};

const TYPES: Record<QuickEntryType, { label: string; submit: string; adminPath: (id: string) => string }> = {
  location: { label: "Lieu", submit: "Ajouter le lieu", adminPath: () => "/admin/locations" },
  organizer: { label: "Structure", submit: "Ajouter la structure", adminPath: (id) => `/admin/organizers/${id}` },
  artist: { label: "Artiste", submit: "Ajouter l'artiste", adminPath: () => "/admin/artists" },
};

const TYPE_ITEMS = [
  { value: "location" as const, label: "Lieu", icon: <MapPin /> },
  { value: "organizer" as const, label: "Structure", icon: <Building2 /> },
  { value: "artist" as const, label: "Artiste", icon: <Mic2 /> },
];

const ARTIST_TYPES = ["DJ", "Groupe", "Chanteur·se", "Rappeur·se", "Humoriste", "Drag"];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible (navigation privée) */
  }
}

function LinkKindIcon({ link }: { link: QuickLink }) {
  const Icon = link.kind === "instagram" ? Instagram : link.kind === "facebook" ? Facebook : Globe;
  return <Icon className="size-3.5 shrink-0" />;
}

/** Pastille de statut : la couleur ne sert qu'à « Suivi ». */
function Pill({ tone, children }: { tone: "success" | "muted" | "outline"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs font-medium leading-4",
        tone === "success" && "border-success/20 bg-success/10 text-success",
        tone === "muted" && "border-transparent bg-muted text-muted-foreground",
        tone === "outline" && "border-border text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function FollowPill({ followed }: { followed: boolean }) {
  return <Pill tone={followed ? "success" : "muted"}>{followed ? "Suivi" : "Pas suivi"}</Pill>;
}

function TypeSwitch({ value, onChange }: { value: QuickEntryType; onChange: (type: QuickEntryType) => void }) {
  return (
    <div role="radiogroup" aria-label="Type de fiche" className="grid h-11 grid-cols-3 gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
      {TYPE_ITEMS.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 [&_svg]:size-3.5",
              active ? "bg-background text-foreground shadow-xs dark:bg-input/60" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function successMessage({ entry, followed, linkLabel }: Success) {
  if (entry.type === "artist") return "Fiche créée : l'IA la reliera aux événements où ce nom apparaît.";
  if (followed) return `L'IA lira ${linkLabel ?? "son lien"} à la prochaine collecte.`;
  if (!linkLabel) return "Sans lien, l'IA n'a rien à suivre : ajoute son Instagram ou son site depuis l'admin.";
  if (entry.type === "location") return "Lieu ajouté sans suivi : il n'organise pas ses propres soirées.";
  return "La source de collecte n'a pas été créée : vérifie la fiche dans l'admin.";
}

function SuccessView({ success, onAgain }: { success: Success; onAgain: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center" role="status">
      <div className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
        <Check className="size-7" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{success.attached ? "Lien ajouté" : "C'est ajouté"}</h2>
        <p className="text-sm">
          <span className="font-medium">{success.entry.name}</span>{" "}
          <span className="text-muted-foreground">· {TYPES[success.entry.type].label}</span>
        </p>
        <p className="mx-auto max-w-xs pt-1 text-[13px] text-muted-foreground">{successMessage(success)}</p>
      </div>
      <div className="flex w-full flex-col gap-2 pt-2">
        <Button size="lg" className="w-full" onClick={onAgain} autoFocus>
          Ajouter autre chose
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <a href={TYPES[success.entry.type].adminPath(success.entry.id)}>
            Ouvrir dans l&apos;admin
            <ExternalLink />
          </a>
        </Button>
      </div>
    </div>
  );
}

function MatchList({
  matches,
  link,
  pendingId,
  onAttach,
}: {
  matches: QuickMatch[];
  link: QuickLink | null;
  pendingId: string | null;
  onAttach: (match: QuickMatch) => void;
}) {
  return (
    <section aria-label="Fiches déjà dans OutLive" className="rounded-lg border border-border">
      <p className="px-3 pb-1 pt-2.5 text-[13px] font-medium">Déjà dans OutLive ?</p>
      <ul className="divide-y divide-border">
        {matches.map((match) => (
          <li key={`${match.type}-${match.id}`} className="space-y-2 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{match.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {TYPES[match.type].label}
                  {match.detail ? ` · ${match.detail}` : ""}
                </p>
              </div>
              {match.sameLink ? <Pill tone="outline">Même lien</Pill> : null}
              {match.type !== "artist" ? <FollowPill followed={match.followed} /> : null}
            </div>
            {link && match.canAttach && !match.sameLink ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={pendingId !== null}
                onClick={() => onAttach(match)}
              >
                {pendingId === match.id ? <Loader2 className="animate-spin" /> : <LinkKindIcon link={link} />}
                {match.type === "artist" || match.followed ? "Ajouter ce lien à la fiche" : "Ajouter ce lien et la suivre"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function History({ items }: { items: HistoryItem[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2 pt-8" aria-label="Ajoutés depuis ce téléphone">
      <h2 className="text-[13px] font-medium text-muted-foreground">Ajoutés depuis ce téléphone</h2>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.slice(0, 5).map((item) => (
          <li key={`${item.type}-${item.id}-${item.at}`} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {TYPES[item.type].label} · {formatDistanceToNow(new Date(item.at), { addSuffix: true, locale: fr })}
              </p>
            </div>
            {item.type !== "artist" ? <FollowPill followed={item.followed} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Formulaire d'ajout : type, lien, nom (et adresse pour un lieu), avec détection des doublons. */
export function QuickAddForm({ sharedLink }: { sharedLink: string | null }) {
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = React.useState(false);
  const [canPaste, setCanPaste] = React.useState(false);
  const [nameFromLink, setNameFromLink] = React.useState(false);
  const [matches, setMatches] = React.useState<QuickMatch[]>([]);
  const [pending, setPending] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<Success | null>(null);
  const [history, setHistory] = React.useState<HistoryItem[]>([]);

  // Brouillon et historique gardés sur le téléphone ; un lien partagé démarre une nouvelle saisie.
  React.useEffect(() => {
    const saved = { ...EMPTY_DRAFT, ...readJson<Partial<Draft>>(DRAFT_KEY, {}) };
    setDraft(sharedLink ? { ...EMPTY_DRAFT, type: saved.type, link: sharedLink } : saved);
    setHistory(readJson<HistoryItem[]>(HISTORY_KEY, []));
    setCanPaste(Boolean(navigator.clipboard?.readText));
    setHydrated(true);
    if (sharedLink) window.history.replaceState(null, "", "/ajout");
  }, [sharedLink]);

  React.useEffect(() => {
    if (hydrated) writeJson(DRAFT_KEY, draft);
  }, [draft, hydrated]);

  const link = React.useMemo(() => normalizeQuickLink(draft.link), [draft.link]);
  const usableLink = link && !link.isPost ? link : null;
  const usableUrl = usableLink?.url ?? null;
  const linkProblem = !draft.link.trim()
    ? null
    : !link
      ? "Lien non reconnu : colle l'adresse d'un compte Instagram, d'une page Facebook ou d'un site."
      : link.isPost
        ? "C'est une publication : colle plutôt le lien du compte ou de la page."
        : null;

  const update = React.useCallback((patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch })), []);

  // Nom proposé d'après le lien (identifiant du compte, ou nom du site).
  React.useEffect(() => {
    if (!hydrated || draft.nameEdited || !usableUrl) return;
    const parsed = normalizeQuickLink(usableUrl);
    const guess = guessNameFromLink(parsed);
    if (guess) {
      setDraft((current) => (current.nameEdited ? current : { ...current, name: guess }));
      setNameFromLink(true);
      return;
    }
    if (parsed?.kind !== "website") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await suggestNameFromWebsite(usableUrl);
        if (cancelled || !result.ok || !result.name) return;
        setDraft((current) => (current.nameEdited ? current : { ...current, name: result.name }));
        setNameFromLink(true);
      } catch {
        /* hors ligne : pas de suggestion */
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [usableUrl, hydrated, draft.nameEdited]);

  // Fiches existantes qui ressemblent à la saisie.
  React.useEffect(() => {
    if (!hydrated) return;
    const name = draft.name.trim();
    if (name.length < 3 && !usableUrl) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await findQuickMatches({ name, link: usableUrl });
        if (!cancelled && result.ok) setMatches(result.matches);
      } catch {
        /* hors ligne : on réessaiera à la prochaine saisie */
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft.name, usableUrl, hydrated]);

  function finish(result: Extract<QuickEntryResult, { ok: true }>, attached: boolean) {
    const item: HistoryItem = { ...result.entry, followed: result.followed, at: new Date().toISOString() };
    const nextHistory = [item, ...history].slice(0, 20);
    setHistory(nextHistory);
    writeJson(HISTORY_KEY, nextHistory);
    setSuccess({ ...result, attached });
    setDraft((current) => ({ ...EMPTY_DRAFT, type: current.type }));
    setMatches([]);
    setNameFromLink(false);
    setError(null);
  }

  async function pasteLink() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) update({ link: text.trim() });
    } catch {
      setError("Impossible de lire le presse-papiers : colle le lien à la main.");
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("La localisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        try {
          const response = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${longitude}&lat=${latitude}&limit=1`);
          const label: string | undefined = (await response.json())?.features?.[0]?.properties?.label;
          setDraft((current) => ({ ...current, address: label || current.address, latitude, longitude }));
          if (!label) setError("Pas d'adresse trouvée ici : saisis-la.");
        } catch {
          setDraft((current) => ({ ...current, latitude, longitude }));
          setError("Adresse introuvable sans réseau : saisis-la.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setError("Position refusée ou indisponible : saisis l'adresse.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const canSubmit =
    draft.name.trim().length >= 2 && !linkProblem && (draft.type !== "location" || draft.address.trim().length >= 5);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || pending) return;
    setPending("create");
    setError(null);
    try {
      const result = await createQuickEntry({
        type: draft.type,
        name: draft.name,
        link: usableUrl,
        address: draft.type === "location" ? draft.address : null,
        latitude: draft.type === "location" ? draft.latitude : null,
        longitude: draft.type === "location" ? draft.longitude : null,
        follow: draft.type === "location" ? draft.follow : undefined,
        artistType: draft.type === "artist" ? draft.artistType : null,
        originCity: draft.type === "artist" ? draft.originCity : null,
      });
      if (result.ok) {
        finish(result, false);
        return;
      }
      setError(result.error);
      const duplicate = result.duplicate;
      if (duplicate) setMatches((current) => [duplicate, ...current.filter((match) => match.id !== duplicate.id)]);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(null);
    }
  }

  async function attach(match: QuickMatch) {
    if (!usableUrl || pending) return;
    setPending(match.id);
    setError(null);
    try {
      const result = await attachLinkToEntry({ type: match.type, id: match.id, link: usableUrl, follow: match.type === "location" });
      if (result.ok) finish(result, true);
      else setError(result.error);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(null);
    }
  }

  if (success) {
    return (
      <>
        <SuccessView success={success} onAgain={() => setSuccess(null)} />
        <History items={history} />
      </>
    );
  }

  const isLocation = draft.type === "location";
  const followHint = draft.type === "artist" ? null : !usableUrl ? "Sans lien, l'IA ne pourra rien récupérer." : null;

  return (
    <>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <TypeSwitch value={draft.type} onChange={(type) => update({ type })} />

        <div className="space-y-2">
          <Label htmlFor="quick-link">Lien</Label>
          <div className="flex gap-2">
            <Input
              id="quick-link"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Instagram, Facebook ou site"
              value={draft.link}
              onChange={(event) => update({ link: event.target.value })}
              aria-invalid={Boolean(linkProblem)}
              aria-describedby="quick-link-status"
              className="h-11"
            />
            {canPaste ? (
              <Button type="button" variant="outline" className="h-11 shrink-0" onClick={pasteLink}>
                <ClipboardPaste />
                Coller
              </Button>
            ) : null}
          </div>
          <p id="quick-link-status" className="min-h-4 text-xs" aria-live="polite">
            {linkProblem ? (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <TriangleAlert className="size-3.5 shrink-0" />
                {linkProblem}
              </span>
            ) : usableLink ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <LinkKindIcon link={usableLink} />
                {usableLink.label}
              </span>
            ) : (
              <span className="text-muted-foreground">Le compte ou la page que l&apos;IA lira.</span>
            )}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-name">Nom</Label>
          <Input
            id="quick-name"
            autoComplete="off"
            autoCapitalize="words"
            placeholder={isLocation ? "Le Chafouin" : draft.type === "organizer" ? "Collectif, asso, label…" : "Nom de scène"}
            value={draft.name}
            onChange={(event) => {
              setNameFromLink(false);
              update({ name: event.target.value, nameEdited: event.target.value.trim().length > 0 });
            }}
            className="h-11"
          />
          {nameFromLink && draft.name ? <p className="text-xs text-muted-foreground">Proposé d&apos;après le lien : vérifie-le.</p> : null}
        </div>

        {isLocation ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="quick-address">Adresse</Label>
              <div className="flex gap-2">
                <AddressInput
                  id="quick-address"
                  placeholder="Rue, ville"
                  value={draft.address}
                  onChange={(address) => update({ address, latitude: null, longitude: null })}
                  onAddressSelect={(address, coordinates) =>
                    update({ address, latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null })
                  }
                  className="h-11"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0"
                  onClick={locate}
                  disabled={locating}
                  aria-label="Utiliser ma position"
                >
                  {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
                  Ici
                </Button>
              </div>
            </div>
            <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">Organise ses propres soirées</span>
                <span className="block text-xs text-muted-foreground">L&apos;IA suivra ses événements à chaque collecte.</span>
              </span>
              <Switch checked={draft.follow} onCheckedChange={(follow) => update({ follow })} aria-label="Suivre ce lieu" />
            </label>
          </>
        ) : null}

        {draft.type === "artist" ? (
          <details className="group rounded-lg border border-border">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium">
              Détails <span className="font-normal text-muted-foreground">(facultatif)</span>
            </summary>
            <div className="space-y-4 px-3 pb-3">
              <div className="space-y-2">
                <Label htmlFor="quick-artist-type">Type</Label>
                <Input
                  id="quick-artist-type"
                  list="quick-artist-types"
                  placeholder="DJ, groupe…"
                  value={draft.artistType}
                  onChange={(event) => update({ artistType: event.target.value })}
                  className="h-11"
                />
                <datalist id="quick-artist-types">
                  {ARTIST_TYPES.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-artist-city">Ville d&apos;origine</Label>
                <Input
                  id="quick-artist-city"
                  autoCapitalize="words"
                  value={draft.originCity}
                  onChange={(event) => update({ originCity: event.target.value })}
                  className="h-11"
                />
              </div>
            </div>
          </details>
        ) : null}

        {matches.length ? <MatchList matches={matches} link={usableLink} pendingId={pending} onAttach={attach} /> : null}

        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="space-y-2">
          <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={!canSubmit || pending !== null}>
            {pending === "create" ? <Loader2 className="animate-spin" /> : null}
            {TYPES[draft.type].submit}
          </Button>
          {followHint ? <p className="text-center text-xs text-muted-foreground">{followHint}</p> : null}
        </div>
      </form>
      <History items={history} />
    </>
  );
}
