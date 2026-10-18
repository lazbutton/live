"use client";

import * as React from "react";
import { addDays, differenceInCalendarDays, differenceInMinutes, format, isFriday, isSaturday, startOfToday } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDate } from "@internationalized/date";
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  Heading,
  I18nProvider,
} from "react-aria-components";
import { CalendarDays, ChevronLeft, ChevronRight, Circle, CircleCheck, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

/** Section du formulaire principal, repérable par son ancre `id`. */
export function FormBlock({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4 border-t border-border pt-7 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Champ : libellé, contrôle, puis aide ou erreur. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  action,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="inline-flex items-center gap-1">
          {label}
          {required ? (
            <span className="text-muted-foreground" aria-hidden>
              *
            </span>
          ) : null}
        </Label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Bloc du panneau latéral (affiche, publication, complétude…). */
export function AsideSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-border px-5 py-5 last:border-b-0">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Option activable compacte, pour le panneau latéral. */
export function PropertySwitch({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium leading-5">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
        ) : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Date et heure                                                       */
/* ------------------------------------------------------------------ */

type ParsedLocalDateTime = {
  date: string;
  time: string;
  calendar: CalendarDate;
  js: Date;
};

export function parseLocalDateTime(value: string | null | undefined): ParsedLocalDateTime | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}`,
    calendar: new CalendarDate(year, month, day),
    js: new Date(year, month - 1, day, hour, minute),
  };
}

export function toLocalDateTimeValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** Date (calendrier) et heure séparées, au format `YYYY-MM-DDTHH:mm`. */
export function EventDateTimeInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
  placeholder = "Choisir une date",
  fallbackTime = "20:00",
  trailing,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  /** Heure utilisée tant qu'aucune n'a été saisie. */
  fallbackTime?: string;
  trailing?: React.ReactNode;
}) {
  const parsed = parseLocalDateTime(value);
  const [open, setOpen] = React.useState(false);
  const [draftTime, setDraftTime] = React.useState(parsed?.time ?? fallbackTime);
  const time = parsed?.time ?? draftTime;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            className={cn(
              "min-w-0 flex-1 justify-start gap-2 px-3 font-normal has-[>svg]:px-3",
              !parsed && "text-muted-foreground",
              invalid && "border-destructive/60 ring-[3px] ring-destructive/15",
            )}
          >
            <CalendarDays className="text-muted-foreground" />
            <span className="truncate first-letter:uppercase">
              {parsed ? format(parsed.js, "EEE d MMM yyyy", { locale: fr }) : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <I18nProvider locale="fr-FR">
            <Calendar
              aria-label="Choisir une date"
              value={parsed?.calendar ?? null}
              onChange={(next) => {
                onChange(`${next.toString()}T${time || fallbackTime}`);
                setOpen(false);
              }}
            >
              <div className="flex items-center justify-between pb-2">
                <AriaButton
                  slot="previous"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground data-[focus-visible]:ring-[3px] data-[focus-visible]:ring-ring/40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </AriaButton>
                <Heading className="text-sm font-medium capitalize" />
                <AriaButton
                  slot="next"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground data-[focus-visible]:ring-[3px] data-[focus-visible]:ring-ring/40"
                >
                  <ChevronRight className="h-4 w-4" />
                </AriaButton>
              </div>
              <CalendarGrid className="border-separate border-spacing-0.5">
                {(date) => (
                  <CalendarCell
                    date={date}
                    className={({ isSelected, isOutsideMonth, isToday }) =>
                      cn(
                        "flex size-9 cursor-pointer items-center justify-center rounded-md text-sm tabular-nums outline-none transition-colors data-[focus-visible]:ring-[3px] data-[focus-visible]:ring-ring/40",
                        isOutsideMonth ? "text-muted-foreground/40" : "text-foreground hover:bg-accent",
                        isToday && !isSelected && "font-semibold underline decoration-2 underline-offset-4",
                        isSelected && "bg-primary font-medium text-primary-foreground hover:bg-primary/90",
                      )
                    }
                  />
                )}
              </CalendarGrid>
            </Calendar>
          </I18nProvider>
        </PopoverContent>
      </Popover>
      <TimeInput
        value={time}
        disabled={disabled}
        aria-label="Heure"
        className="w-[7.25rem] shrink-0"
        onChange={(nextTime) => {
          setDraftTime(nextTime);
          if (parsed && nextTime) onChange(`${parsed.date}T${nextTime}`);
        }}
      />
      {trailing}
    </div>
  );
}

/** Heure seule (HH:mm), avec l'icône à gauche comme les autres champs. */
export function TimeInput({
  id,
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type="time"
        step={60}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        className="pl-9 tabular-nums [&::-webkit-calendar-picker-indicator]:hidden"
      />
    </div>
  );
}

/** Raccourcis de date (aujourd'hui, demain, prochain week-end). */
export function QuickDateChips({
  value,
  onPick,
  disabled,
}: {
  value: string;
  onPick: (date: Date) => void;
  disabled?: boolean;
}) {
  const options = React.useMemo(() => {
    const today = startOfToday();
    const days = [today, addDays(today, 1)];
    for (let offset = 2; offset <= 8 && days.length < 4; offset += 1) {
      const candidate = addDays(today, offset);
      if (isFriday(candidate) || isSaturday(candidate)) days.push(candidate);
    }
    return days.map((date, index) => ({
      date,
      key: format(date, "yyyy-MM-dd"),
      label: index === 0 ? "Aujourd’hui" : index === 1 ? "Demain" : format(date, "EEE d", { locale: fr }),
    }));
  }, []);
  const selectedKey = parseLocalDateTime(value)?.date;

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.key === selectedKey;
        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option.date)}
            aria-pressed={active}
            className={cn(
              "h-7 rounded-md border px-2.5 text-xs font-medium outline-none transition-colors first-letter:uppercase focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** « 2 h 30 », « Sur 3 jours »… ou null si la fin précède le début. */
export function describeDuration(start: string, end: string) {
  const startDate = parseLocalDateTime(start)?.js;
  const endDate = parseLocalDateTime(end)?.js;
  if (!startDate || !endDate) return null;
  const minutes = differenceInMinutes(endDate, startDate);
  if (minutes <= 0) return null;
  const days = differenceInCalendarDays(endDate, startDate);
  if (days >= 1 && minutes >= 20 * 60) return `Sur ${days + 1} jours`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

/* ------------------------------------------------------------------ */
/* Complétude                                                          */
/* ------------------------------------------------------------------ */

export type CompletenessItem = {
  key: string;
  label: string;
  done: boolean;
  required?: boolean;
  /** Élément à faire défiler / focaliser. */
  targetId: string;
};

export function CompletenessList({
  items,
  onJump,
}: {
  items: CompletenessItem[];
  onJump: (item: CompletenessItem) => void;
}) {
  const done = items.filter((item) => item.done).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 100;
  const missingRequired = items.filter((item) => item.required && !item.done).length;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">
            {missingRequired > 0
              ? `${missingRequired} champ${missingRequired > 1 ? "s" : ""} requis`
              : done === items.length
                ? "Fiche complète"
                : "Prête à enregistrer"}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {done}/{items.length}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              missingRequired > 0 ? "bg-warning" : "bg-foreground",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      {done === items.length ? (
        <p className="text-[13px] text-muted-foreground">Toutes les informations utiles sont renseignées.</p>
      ) : null}
      <ul className="-mx-1.5 space-y-px">
        {items.filter((item) => !item.done).map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onJump(item)}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
            >
              {item.done ? (
                <CircleCheck className="h-3.5 w-3.5 shrink-0 text-success" />
              ) : (
                <Circle
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    item.required ? "text-warning" : "text-muted-foreground/50",
                  )}
                />
              )}
              <span className={cn("min-w-0 flex-1 truncate", item.done ? "text-muted-foreground" : "text-foreground")}>
                {item.label}
              </span>
              {item.required && !item.done ? (
                <span className="text-[11px] font-medium text-warning">Requis</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
