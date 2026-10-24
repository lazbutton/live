"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  EVENT_AUDIENCES,
  EVENT_BOOKINGS,
  MIN_AGE_RANGE,
  genresOfCategory,
  type EventGenreOption,
} from "@/lib/events/event-details";

import { Field } from "./event-form-fields";

/*
 * Genre, pour qui et réservation d'un événement (../live/docs/chantiers/pour-toi.md, « Des fiches plus riches ») :
 * des listes fermées, en puces. Le genre : ceux de la catégorie choisie (event_genres, tenus dans les réglages) ;
 * pour qui et la réservation : une valeur ou rien (« la fiche ne le dit pas »). La base recalcule le jeune public
 * depuis « Pour qui » (migration 20261024170000).
 */

export type EventDetailsValue = {
  genreIds: string[];
  /** "" : pas précisé. */
  audience: string;
  /** Saisi tel quel ; vide : pas d'âge annoncé. */
  minAge: string;
  /** "" : pas précisée. */
  booking: string;
};

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {active ? <Check className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

export function EventDetailsFields({
  categoryId,
  genres,
  genresLoading,
  value,
  onChange,
  minAgeError,
  legacyYoungAudience,
  disabled,
}: {
  /** Catégorie choisie (son id) : ses genres sont proposés. */
  categoryId: string;
  genres: EventGenreOption[];
  genresLoading?: boolean;
  value: EventDetailsValue;
  onChange: (next: EventDetailsValue) => void;
  minAgeError?: string | null;
  /** Coché « Jeune public » avant « Pour qui », sans public choisi depuis. */
  legacyYoungAudience?: boolean;
  disabled?: boolean;
}) {
  const offered = genresOfCategory(genres, categoryId, value.genreIds);

  function toggleGenre(id: string) {
    onChange({
      ...value,
      genreIds: value.genreIds.includes(id) ? value.genreIds.filter((genreId) => genreId !== id) : [...value.genreIds, id],
    });
  }

  return (
    <div className="space-y-5">
      <Field
        label="Genre"
        hint={
          !categoryId
            ? "Choisis d’abord la catégorie."
            : genresLoading
              ? "Chargement des genres…"
              : offered.length === 0
                ? "Pas de genres pour cette catégorie (Réglages, « Genres »)."
                : "Un ou plusieurs ; rien si la source ne le dit pas."
        }
      >
        {offered.length > 0 ? (
          <div id="event-genres" className="flex flex-wrap gap-1.5">
            {offered.map((genre) => (
              <Chip
                key={genre.id}
                active={value.genreIds.includes(genre.id)}
                disabled={disabled}
                onClick={() => toggleGenre(genre.id)}
              >
                {genre.name}
                {genre.is_active ? null : <span className="font-normal opacity-70">(retiré)</span>}
              </Chip>
            ))}
          </div>
        ) : null}
      </Field>

      <div className="grid gap-4 @lg:grid-cols-[1fr_auto]">
        <Field
          label="Pour qui"
          hint={
            legacyYoungAudience && !value.audience
              ? "Marqué « Jeune public » avant « Pour qui » : choisis « En famille » ou « Ados » pour le garder."
              : "« En famille » et « Ados » comptent comme jeune public (« En famille » de l’app)."
          }
        >
          <div id="event-audience" className="flex flex-wrap gap-1.5">
            {EVENT_AUDIENCES.map((audience) => (
              <Chip
                key={audience.value}
                active={value.audience === audience.value}
                disabled={disabled}
                onClick={() => onChange({ ...value, audience: value.audience === audience.value ? "" : audience.value })}
              >
                {audience.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Âge minimum" htmlFor="event-min-age" error={minAgeError}>
          <div className="relative w-32">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              Dès
            </span>
            <Input
              id="event-min-age"
              type="number"
              inputMode="numeric"
              min={MIN_AGE_RANGE.min}
              max={MIN_AGE_RANGE.max}
              step={1}
              value={value.minAge}
              onChange={(event) => onChange({ ...value, minAge: event.target.value })}
              placeholder="—"
              disabled={disabled}
              aria-invalid={minAgeError ? true : undefined}
              className="pl-10 pr-10 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              ans
            </span>
          </div>
        </Field>
      </div>

      <Field label="Réservation">
        <div id="event-booking" className="flex flex-wrap gap-1.5">
          {EVENT_BOOKINGS.map((booking) => (
            <Chip
              key={booking.value}
              active={value.booking === booking.value}
              disabled={disabled}
              onClick={() => onChange({ ...value, booking: value.booking === booking.value ? "" : booking.value })}
            >
              {booking.label}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  );
}
