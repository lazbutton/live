"use client";

import * as React from "react";
import { Check, ExternalLink, EyeOff, Loader2, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { audienceLabel, bookingLabel, minAgeLabel, toMinAge, type EventGenreOption } from "@/lib/events/event-details";
import type { FicheGap, FicheGroup } from "@/lib/events/fiches-to-complete";
import { EventDetailsFields, type EventDetailsValue } from "../events/event-details-fields";
import { ManagementEmptyState, ManagementPill } from "../management-page-primitives";

/** Les séances à venir d'un même spectacle (même titre, même catégorie), et ce qui leur manque. */
export type FicheReviewGroup = FicheGroup;

export const FICHE_GAP_LABELS: Record<FicheGap, string> = {
  confirm: "À confirmer",
  genre: "Genre",
  audience: "Pour qui",
  booking: "Réservation",
};

type FicheGapFilter = "all" | FicheGap;

const PAGE_SIZE = 40;

function formatNextDate(value: string | null) {
  if (!value) return null;
  // Heure murale de Paris enregistrée en UTC : lue telle quelle.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

/** « Tout public · Dès 6 ans · Sans réservation » : ce que porte déjà la fiche. */
function describe(value: EventDetailsValue, genres: EventGenreOption[]) {
  return [
    ...genres.filter((genre) => value.genreIds.includes(genre.id)).map((genre) => genre.name),
    audienceLabel(value.audience),
    minAgeLabel(toMinAge(value.minAge)),
    bookingLabel(value.booking),
  ].filter(Boolean);
}

function FicheReviewRow({
  group,
  genres,
  saving,
  onSave,
  onIgnore,
}: {
  group: FicheReviewGroup;
  genres: EventGenreOption[];
  saving: boolean;
  onSave: (group: FicheReviewGroup, value: EventDetailsValue) => void;
  onIgnore: (group: FicheReviewGroup) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(group.value);
  const minAgeError = draft.minAge.trim() && toMinAge(draft.minAge) === null ? "De 1 à 18 ans." : null;
  const known = describe(group.value, genres);
  const details = [
    formatNextDate(group.nextDate),
    group.venue,
    group.categoryName,
    group.eventIds.length > 1 ? `${group.eventIds.length} séances` : null,
    group.pendingCount > 0 ? (group.pendingCount > 1 ? `${group.pendingCount} en attente` : "en attente") : null,
  ].filter(Boolean);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="break-words text-sm font-medium">{group.title}</p>
            {details.length ? <p className="text-xs text-muted-foreground">{details.join(" · ")}</p> : null}
            {known.length ? <p className="text-xs">{known.join(" · ")}</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {group.gaps.map((gap) => (
              <ManagementPill key={gap} tone={gap === "confirm" ? "default" : "warning"}>
                {FICHE_GAP_LABELS[gap]}
              </ManagementPill>
            ))}
          </div>
        </div>

        {editing ? (
          <form
            className="@container space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!minAgeError) onSave(group, draft);
            }}
          >
            <EventDetailsFields
              categoryId={group.categoryId}
              genres={genres}
              value={draft}
              onChange={setDraft}
              minAgeError={minAgeError}
              disabled={saving}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" className="h-9" disabled={saving || Boolean(minAgeError)}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                Enregistrer
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-9" disabled={saving} onClick={() => setEditing(false)}>
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-9" onClick={() => setEditing(true)} disabled={saving}>
              <PencilLine />
              Compléter
            </Button>
            {group.gaps.includes("confirm") ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                disabled={saving}
                onClick={() => onSave(group, group.value)}
                title="Ce qui a été lu est juste : la fiche est confirmée."
              >
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                C’est juste
              </Button>
            ) : null}
            {group.sourceUrl ? (
              <Button asChild size="sm" variant="ghost" className="h-9">
                <a href={group.sourceUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  Source
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9"
              disabled={saving}
              onClick={() => onIgnore(group)}
              title="La source ne le dit pas : ne plus proposer cette fiche sur ce navigateur"
            >
              <EyeOff />
              Ignorer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Les fiches à compléter, les plus proches d'abord ; une ligne s'enregistre pour toutes ses séances. */
export function FicheReviewList({
  groups,
  genres,
  savingKey,
  onSave,
  onIgnore,
}: {
  groups: FicheReviewGroup[];
  genres: EventGenreOption[];
  savingKey: string | null;
  onSave: (group: FicheReviewGroup, value: EventDetailsValue) => void;
  onIgnore: (group: FicheReviewGroup) => void;
}) {
  const [filter, setFilter] = React.useState<FicheGapFilter>("all");
  const [shown, setShown] = React.useState(PAGE_SIZE);
  const count = (gap: FicheGap) => groups.filter((group) => group.gaps.includes(gap)).length;
  const visible = filter === "all" ? groups : groups.filter((group) => group.gaps.includes(filter));

  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="Ce qui manque"
        size="sm"
        className="max-w-full overflow-x-auto"
        value={filter}
        onValueChange={(next) => {
          setFilter(next);
          setShown(PAGE_SIZE);
        }}
        items={[
          { value: "all", label: "Toutes", count: groups.length },
          ...(Object.keys(FICHE_GAP_LABELS) as FicheGap[]).map((gap) => ({
            value: gap,
            label: FICHE_GAP_LABELS[gap],
            count: count(gap),
          })),
        ]}
      />
      {visible.length === 0 ? (
        <ManagementEmptyState
          icon={<Check />}
          title="Rien à compléter"
          description="Les fiches à venir disent leur genre, pour qui et la réservation, et ce qui a été lu est confirmé."
        />
      ) : (
        <div className="space-y-3">
          {visible.slice(0, shown).map((group) => (
            <FicheReviewRow
              key={group.key}
              group={group}
              genres={genres}
              saving={savingKey === group.key}
              onSave={onSave}
              onIgnore={onIgnore}
            />
          ))}
          {visible.length > shown ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => setShown((current) => current + PAGE_SIZE)}>
              Voir {Math.min(PAGE_SIZE, visible.length - shown)} de plus
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
