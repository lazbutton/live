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
  Info,
  Instagram,
  Link2,
  Loader2,
  MapPin,
  Mic2,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

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
import { AddressField } from "./address-field";
import { InstallHint } from "./install-hint";
import { buttonClass, Card, Pill, SectionTitle, TextInput, Toggle } from "./ui";

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

const FORM_ID = "quick-add-form";
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

const TYPES: Record<
  QuickEntryType,
  { label: string; hint: string; icon: LucideIcon; submit: string; namePlaceholder: string; adminPath: (id: string) => string }
> = {
  location: {
    label: "Lieu",
    hint: "Bar, salle…",
    icon: MapPin,
    submit: "Ajouter le lieu",
    namePlaceholder: "Le Chafouin",
    adminPath: () => "/admin/locations",
  },
  organizer: {
    label: "Structure",
    hint: "Collectif, asso…",
    icon: Building2,
    submit: "Ajouter la structure",
    namePlaceholder: "Collectif, asso, label…",
    adminPath: (id) => `/admin/organizers/${id}`,
  },
  artist: {
    label: "Artiste",
    hint: "DJ, groupe…",
    icon: Mic2,
    submit: "Ajouter l'artiste",
    namePlaceholder: "Nom de scène",
    adminPath: () => "/admin/artists",
  },
};

const TYPE_ORDER: QuickEntryType[] = ["location", "organizer", "artist"];
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

function LinkKindIcon({ link, className }: { link: QuickLink; className?: string }) {
  const Icon = link.kind === "instagram" ? Instagram : link.kind === "facebook" ? Facebook : Globe;
  return <Icon className={cn("size-4 shrink-0", className)} />;
}

function FollowPill({ followed }: { followed: boolean }) {
  return <Pill tone={followed ? "success" : "muted"}>{followed ? "Suivi" : "Pas suivi"}</Pill>;
}

function successMessage({ entry, followed, linkLabel }: Success) {
  if (entry.type === "artist") return "La fiche est créée : l'IA la reliera aux événements où ce nom apparaît.";
  if (followed) return `L'IA lira ${linkLabel ?? "son lien"} à la prochaine collecte.`;
  if (!linkLabel) return "Sans lien, l'IA n'a rien à suivre : ajoute son Instagram ou son site depuis l'admin.";
  if (entry.type === "location") return "Lieu ajouté sans suivi : il n'organise pas ses propres soirées.";
  return "La source de collecte n'a pas été créée : vérifie la fiche dans l'admin.";
}

function TypePicker({ value, onChange }: { value: QuickEntryType; onChange: (type: QuickEntryType) => void }) {
  return (
    <div role="radiogroup" aria-label="Type de fiche" className="grid grid-cols-3 gap-2">
      {TYPE_ORDER.map((type) => {
        const { label, hint, icon: Icon } = TYPES[type];
        const active = type === value;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(type)}
            className={cn(
              "flex flex-col items-start gap-3 rounded-2xl border bg-card p-3 text-left outline-none",
              "transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-ring/15",
              active ? "border-foreground shadow-[inset_0_0_0_1px_var(--foreground)]" : "border-border",
            )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-xl transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-tight">{label}</span>
              <span className="block truncate text-[12px] leading-snug text-muted-foreground">{hint}</span>
            </span>
          </button>
        );
      })}
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
    <section aria-label="Fiches déjà dans OutLive">
      <SectionTitle>Déjà dans OutLive ?</SectionTitle>
      <Card className="divide-y divide-border">
        {matches.map((match) => {
          const Icon = TYPES[match.type].icon;
          return (
            <div key={`${match.type}-${match.id}`} className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium leading-tight">{match.name}</p>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    {TYPES[match.type].label}
                    {match.detail ? ` · ${match.detail}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {match.sameLink ? <Pill tone="outline">Même lien</Pill> : null}
                    {match.type !== "artist" ? <FollowPill followed={match.followed} /> : null}
                  </div>
                </div>
              </div>
              {link && match.canAttach && !match.sameLink ? (
                <button
                  type="button"
                  className={cn(buttonClass({ variant: "secondary", size: "sm" }), "w-full")}
                  disabled={pendingId !== null}
                  onClick={() => onAttach(match)}
                >
                  {pendingId === match.id ? <Loader2 className="animate-spin" /> : <LinkKindIcon link={link} />}
                  {match.type === "artist" || match.followed ? "Ajouter ce lien à la fiche" : "Ajouter ce lien et la suivre"}
                </button>
              ) : null}
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function History({ items }: { items: HistoryItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-label="Ajoutés depuis ce téléphone">
      <SectionTitle>Ajoutés depuis ce téléphone</SectionTitle>
      <Card className="divide-y divide-border">
        {items.slice(0, 5).map((item) => {
          const Icon = TYPES[item.type].icon;
          return (
            <div key={`${item.type}-${item.id}-${item.at}`} className="flex items-center gap-3 px-4 py-3">
              <Icon className="size-[18px] shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] leading-tight">{item.name}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {formatDistanceToNow(new Date(item.at), { addSuffix: true, locale: fr })}
                </p>
              </div>
              {item.type !== "artist" ? <FollowPill followed={item.followed} /> : null}
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function SuccessView({ success, onAgain }: { success: Success; onAgain: () => void }) {
  const Icon = TYPES[success.entry.type].icon;
  return (
    <div className="flex min-h-[58svh] flex-col items-center justify-center pt-6 text-center" role="status">
      <div className="flex size-20 items-center justify-center rounded-full bg-success/12 text-success">
        <Check className="size-10" strokeWidth={2.5} />
      </div>
      <h2 className="mt-6 text-[28px] font-semibold tracking-tight">{success.attached ? "Lien ajouté" : "C'est ajouté"}</h2>
      <p className="mt-2 flex items-center gap-2 text-[17px] font-medium">
        <Icon className="size-[18px] text-muted-foreground" />
        {success.entry.name}
      </p>
      <Card className="mt-6 flex w-full items-start gap-3 p-4 text-left">
        <Sparkles className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
        <p className="text-[15px] leading-snug">{successMessage(success)}</p>
      </Card>
      <div className="mt-8 w-full space-y-2.5">
        <button type="button" className={cn(buttonClass(), "w-full")} onClick={onAgain} autoFocus>
          Ajouter autre chose
        </button>
        <a href={TYPES[success.entry.type].adminPath(success.entry.id)} className={cn(buttonClass({ variant: "secondary" }), "w-full")}>
          Ouvrir dans l&apos;admin
          <ExternalLink />
        </a>
      </div>
    </div>
  );
}

/** Formulaire d'ajout : lien, type, nom (et adresse pour un lieu), avec détection des doublons. */
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
    window.scrollTo({ top: 0 });
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

  // Même type et même lien : c'est la même fiche, l'ajout serait refusé.
  const sameEntry = matches.find((match) => match.type === draft.type && match.sameLink) ?? null;
  const canSubmit =
    !sameEntry &&
    draft.name.trim().length >= 2 &&
    !linkProblem &&
    (draft.type !== "location" || draft.address.trim().length >= 5);

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
      <main className="mx-auto w-full max-w-md space-y-8 px-4 pb-[max(env(safe-area-inset-bottom),2rem)]">
        <SuccessView success={success} onAgain={() => setSuccess(null)} />
        <History items={history} />
      </main>
    );
  }

  const isLocation = draft.type === "location";
  const hint =
    error ??
    (sameEntry
      ? `${sameEntry.name} est déjà dans OutLive avec ce lien.`
      : draft.type !== "artist" && !usableUrl
        ? "Sans lien, l'IA ne pourra rien récupérer."
        : null);

  return (
    <>
      <main className="mx-auto w-full max-w-md px-4 pb-44">
        <div className="pb-6 pt-5">
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-tight">Ajouter à OutLive</h1>
          <p className="mt-2 text-[15px] leading-snug text-muted-foreground">
            Colle un lien, choisis le type : l&apos;IA récupère ensuite les événements.
          </p>
        </div>

        <form id={FORM_ID} onSubmit={submit} className="space-y-7" noValidate>
          <section>
            <SectionTitle>Le lien</SectionTitle>
            <Card className="p-2">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  {usableLink ? (
                    <LinkKindIcon link={usableLink} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
                  ) : (
                    <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  )}
                  <label className="sr-only" htmlFor="quick-link">
                    Lien Instagram, Facebook ou site
                  </label>
                  <TextInput
                    id="quick-link"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Instagram, site…"
                    value={draft.link}
                    onChange={(event) => update({ link: event.target.value })}
                    aria-invalid={Boolean(linkProblem)}
                    aria-describedby="quick-link-status"
                    className="border-transparent bg-transparent pl-10 focus:border-transparent focus:ring-0"
                  />
                </div>
                {canPaste ? (
                  <button type="button" className={buttonClass({ variant: draft.link ? "secondary" : "primary", size: "md" })} onClick={pasteLink}>
                    <ClipboardPaste />
                    Coller
                  </button>
                ) : null}
              </div>
            </Card>
            <p id="quick-link-status" className="flex min-h-6 items-center gap-1.5 px-1 pt-2 text-[13px]" aria-live="polite">
              {linkProblem ? (
                <span className="inline-flex items-start gap-1.5 text-warning">
                  <TriangleAlert className="mt-px size-4 shrink-0" />
                  {linkProblem}
                </span>
              ) : usableLink ? (
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <Check className="size-4 shrink-0 text-success" />
                  {usableLink.label}
                </span>
              ) : (
                <span className="text-muted-foreground">Le compte ou la page que l&apos;IA lira.</span>
              )}
            </p>
          </section>

          <section>
            <SectionTitle>C&apos;est…</SectionTitle>
            <TypePicker value={draft.type} onChange={(type) => update({ type })} />
          </section>

          <section>
            <SectionTitle>Les infos</SectionTitle>
            <Card className="space-y-5 p-4">
              <div className="space-y-2">
                <label htmlFor="quick-name" className="block px-0.5 text-[14px] font-medium">
                  Nom
                </label>
                <TextInput
                  id="quick-name"
                  autoComplete="off"
                  autoCapitalize="words"
                  placeholder={TYPES[draft.type].namePlaceholder}
                  value={draft.name}
                  onChange={(event) => {
                    setNameFromLink(false);
                    update({ name: event.target.value, nameEdited: event.target.value.trim().length > 0 });
                  }}
                />
                {nameFromLink && draft.name && usableUrl ? (
                  <p className="flex items-center gap-1.5 px-0.5 text-[13px] text-muted-foreground">
                    <Sparkles className="size-3.5" />
                    Proposé d&apos;après le lien : vérifie-le.
                  </p>
                ) : null}
              </div>

              {isLocation ? (
                <>
                  <div className="space-y-2">
                    <label htmlFor="quick-address" className="block px-0.5 text-[14px] font-medium">
                      Adresse
                    </label>
                    <AddressField
                      id="quick-address"
                      value={draft.address}
                      onChange={(address) => update({ address, latitude: null, longitude: null })}
                      onSelect={({ label, latitude, longitude }) => update({ address: label, latitude, longitude })}
                      onLocate={locate}
                      locating={locating}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium leading-tight">Organise ses propres soirées</p>
                      <p className="mt-1 text-[13px] leading-snug text-muted-foreground">L&apos;IA suivra ses événements à chaque collecte.</p>
                    </div>
                    <Toggle checked={draft.follow} onChange={(follow) => update({ follow })} label="Suivre ce lieu" />
                  </div>
                </>
              ) : null}

              {draft.type === "artist" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label htmlFor="quick-artist-type" className="block px-0.5 text-[14px] font-medium">
                      Type <span className="font-normal text-muted-foreground">(option)</span>
                    </label>
                    <TextInput
                      id="quick-artist-type"
                      list="quick-artist-types"
                      placeholder="DJ, groupe…"
                      value={draft.artistType}
                      onChange={(event) => update({ artistType: event.target.value })}
                    />
                    <datalist id="quick-artist-types">
                      {ARTIST_TYPES.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="quick-artist-city" className="block px-0.5 text-[14px] font-medium">
                      Ville <span className="font-normal text-muted-foreground">(option)</span>
                    </label>
                    <TextInput
                      id="quick-artist-city"
                      autoCapitalize="words"
                      placeholder="Orléans"
                      value={draft.originCity}
                      onChange={(event) => update({ originCity: event.target.value })}
                    />
                  </div>
                </div>
              ) : null}
            </Card>
          </section>

          {matches.length ? <MatchList matches={matches} link={usableLink} pendingId={pending} onAttach={attach} /> : null}
        </form>

        <div className="mt-9 space-y-7">
          <History items={history} />
          <InstallHint />
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-md px-4 pb-[max(env(safe-area-inset-bottom),0.875rem)] pt-3">
          {hint ? (
            <p
              role={error ? "alert" : undefined}
              className={cn(
                "mb-2.5 flex items-start justify-center gap-1.5 text-center text-[13px] leading-snug",
                error ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {error ? <Info className="mt-px size-4 shrink-0" /> : null}
              {hint}
            </p>
          ) : null}
          <button type="submit" form={FORM_ID} className={cn(buttonClass(), "w-full")} disabled={!canSubmit || pending !== null}>
            {pending === "create" ? <Loader2 className="animate-spin" /> : null}
            {TYPES[draft.type].submit}
          </button>
        </div>
      </div>
    </>
  );
}
