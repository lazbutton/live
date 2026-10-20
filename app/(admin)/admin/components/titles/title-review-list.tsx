"use client";

import * as React from "react";
import { Check, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { EventTitleIssue } from "@/lib/collecte/event-text";
import { ManagementEmptyState, ManagementPill } from "../management-page-primitives";

/** Événements à venir d'un même titre, avec ses défauts et la correction proposée. */
export type TitleReviewGroup = {
  key: string;
  title: string;
  suggestion: string;
  issues: EventTitleIssue[];
  eventIds: string[];
  /** Première séance à venir (ISO). */
  nextDate: string | null;
  venue: string | null;
  pendingCount: number;
};

export type TitleIssueFilter = "all" | EventTitleIssue;

export const TITLE_ISSUE_LABELS: Record<EventTitleIssue, string> = {
  date: "Date",
  capitales: "Capitales",
  lieu: "Lieu répété",
  guillemets: "Guillemets",
};

const ISSUE_HINTS: Record<EventTitleIssue, string> = {
  date: "La date est déjà sur la carte.",
  capitales: "Tout en capitales : noms en majuscule initiale, titres d'œuvres en minuscules.",
  lieu: "Le lieu est déjà sous le titre.",
  guillemets: "Guillemets français « … ».",
};

function formatNextDate(value: string | null) {
  if (!value) return null;
  // Heure murale de Paris enregistrée en UTC : lue telle quelle.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function TitleReviewRow({
  group,
  saving,
  onSave,
  onIgnore,
}: {
  group: TitleReviewGroup;
  saving: boolean;
  onSave: (group: TitleReviewGroup, title: string) => void;
  onIgnore: (group: TitleReviewGroup) => void;
}) {
  const [draft, setDraft] = React.useState(group.suggestion);
  const trimmed = draft.trim();
  const unchanged = trimmed === group.title;
  const details = [
    formatNextDate(group.nextDate),
    group.venue,
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
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {group.issues.map((issue) => (
              <span key={issue} title={ISSUE_HINTS[issue]}>
                <ManagementPill tone="warning">{TITLE_ISSUE_LABELS[issue]}</ManagementPill>
              </span>
            ))}
          </div>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed && !unchanged) onSave(group, trimmed);
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`Nouveau titre pour « ${group.title} »`}
            className="sm:flex-1"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-9 flex-1 sm:flex-none" disabled={saving || !trimmed || unchanged}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              Enregistrer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9"
              disabled={saving}
              onClick={() => onIgnore(group)}
              title="Ne plus proposer ce titre sur ce navigateur"
            >
              <EyeOff />
              Ignorer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Liste des titres à revoir, filtrée par défaut ; chaque ligne s'enregistre pour toutes ses séances. */
export function TitleReviewList({
  groups,
  savingKey,
  onSave,
  onIgnore,
}: {
  groups: TitleReviewGroup[];
  savingKey: string | null;
  onSave: (group: TitleReviewGroup, title: string) => void;
  onIgnore: (group: TitleReviewGroup) => void;
}) {
  const [filter, setFilter] = React.useState<TitleIssueFilter>("all");
  const count = (issue: EventTitleIssue) => groups.filter((group) => group.issues.includes(issue)).length;
  const visible = filter === "all" ? groups : groups.filter((group) => group.issues.includes(filter));

  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="Défaut"
        size="sm"
        className="max-w-full overflow-x-auto"
        value={filter}
        onValueChange={setFilter}
        items={[
          { value: "all", label: "Tous", count: groups.length },
          ...(Object.keys(TITLE_ISSUE_LABELS) as EventTitleIssue[]).map((issue) => ({
            value: issue,
            label: TITLE_ISSUE_LABELS[issue],
            count: count(issue),
          })),
        ]}
      />
      {visible.length === 0 ? (
        <ManagementEmptyState
          icon={<Check />}
          title="Rien à revoir"
          description="Les titres des événements à venir n'ont ni date, ni capitales, ni lieu répété, ni guillemets droits."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((group) => (
            <TitleReviewRow
              key={group.key}
              group={group}
              saving={savingKey === group.key}
              onSave={onSave}
              onIgnore={onIgnore}
            />
          ))}
        </div>
      )}
    </div>
  );
}
