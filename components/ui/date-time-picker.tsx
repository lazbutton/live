"use client";

import * as React from "react";
import { Calendar, CalendarCell, CalendarGrid, Heading, I18nProvider, TimeField, DateInput, DateSegment, Button as AriaButton } from "react-aria-components";
import { CalendarDate, Time } from "@internationalized/date";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ReminderValue = string; // "YYYY-MM-DDTHH:mm" (datetime-local)

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseDatetimeLocal(value?: string | null): { date: CalendarDate; time: Time } | null {
  if (!value) return null;
  // attendu: YYYY-MM-DDTHH:mm
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return {
    date: new CalendarDate(year, month, day),
    time: new Time(hour, minute),
  };
}

function toDatetimeLocal(date: CalendarDate, time: Time): ReminderValue {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}T${pad2(time.hour)}:${pad2(time.minute)}`;
}

function normalizeDatetimeLocal(value: string): ReminderValue {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return value;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
}

export interface DateTimePickerProps {
  id?: string;
  value: ReminderValue;
  onChange: (next: ReminderValue) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  minuteStep?: number; // défaut: 5
  className?: string;
}

export function DateTimePicker({
  id,
  value,
  onChange,
  label,
  placeholder = "Choisir une date",
  required,
  disabled,
  allowClear = false,
  minuteStep = 5,
  className,
}: DateTimePickerProps) {
  const parsed = React.useMemo(() => parseDatetimeLocal(value), [value]);

  const [open, setOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<CalendarDate | null>(parsed?.date ?? null);
  const [selectedTime, setSelectedTime] = React.useState<Time | null>(parsed?.time ?? null);

  // Sync externe -> interne seulement si la valeur change réellement (évite les boucles)
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    // Ne synchroniser que si la valeur externe a vraiment changé
    if (valueRef.current !== value) {
      valueRef.current = value;
      if (parsed) {
        setSelectedDate(parsed.date);
        setSelectedTime(parsed.time);
      } else {
        setSelectedDate(null);
        setSelectedTime(null);
      }
    }
  }, [value, parsed]);

  const commit = React.useCallback(
    (d: CalendarDate | null, t: Time | null) => {
      if (!d || !t) return;
      const newValue = toDatetimeLocal(d, t);
      // Ne pas appeler onChange si la valeur n'a pas changé
      if (newValue !== value) {
        onChange(newValue);
      }
    },
    [onChange, value]
  );

  const normalizedValue = React.useMemo(() => normalizeDatetimeLocal(value || ""), [value]);

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium">
          {label} {required ? <span className="text-destructive">*</span> : null}
        </label>
      ) : null}

      <I18nProvider locale="fr-FR">
        <Popover open={open} onOpenChange={setOpen}>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <Input
                id={id}
                type="datetime-local"
                value={normalizedValue}
                onChange={(e) => onChange(normalizeDatetimeLocal(e.target.value))}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                step={60}
                className="h-11 pr-11"
                aria-label={label || "Date et heure"}
              />
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9"
                  aria-label="Ouvrir le calendrier"
                >
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
            </div>

            {allowClear && value && !disabled ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => onChange("")}
                aria-label="Effacer"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <PopoverContent className="w-[340px] p-3">
            <div className="flex items-center justify-between gap-2 pb-2">
              <div className="text-sm font-semibold">Sélectionner</div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    const d = new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
                    const mins = now.getMinutes();
                    const step = Math.max(1, Math.min(60, minuteStep));
                    const rounded = Math.ceil(mins / step) * step;
                    const h = rounded >= 60 ? now.getHours() + 1 : now.getHours();
                    const m = rounded >= 60 ? 0 : rounded;
                    const t = new Time(h % 24, m);
                    setSelectedDate(d);
                    setSelectedTime(t);
                    onChange(toDatetimeLocal(d, t));
                    setOpen(false);
                  }}
                >
                  Maintenant
                </Button>
              </div>
            </div>

            <div className="grid gap-3">
              <Calendar
                value={selectedDate ?? undefined}
                onChange={(d) => {
                  setSelectedDate(d);
                  const t = selectedTime ?? new Time(20, 0);
                  setSelectedTime(t);
                  commit(d, t);
                }}
                className="w-full"
              >
                <div className="flex items-center justify-between pb-2">
                  <AriaButton
                    slot="previous"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-accent"
                  >
                    ‹
                  </AriaButton>
                  <Heading className="text-sm font-semibold" />
                  <AriaButton
                    slot="next"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-accent"
                  >
                    ›
                  </AriaButton>
                </div>

                <CalendarGrid className="w-full">
                  {(date) => (
                    <CalendarCell
                      date={date}
                      className={({ isSelected, isOutsideMonth, isDisabled }) =>
                        cn(
                          "h-9 w-9 rounded-md text-sm flex items-center justify-center cursor-pointer",
                          isOutsideMonth ? "text-muted-foreground/40" : "text-foreground",
                          isDisabled ? "opacity-40 cursor-not-allowed" : "hover:bg-accent",
                          isSelected ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""
                        )
                      }
                    />
                  )}
                </CalendarGrid>
              </Calendar>

              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 pb-2 text-sm font-semibold">
                  <Clock className="h-4 w-4" />
                  Heure
                </div>

                <TimeField
                  value={selectedTime ?? undefined}
                  onChange={(t) => {
                    setSelectedTime(t);
                    const d = selectedDate ?? (() => {
                      const now = new Date();
                      return new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
                    })();
                    setSelectedDate(d);
                    commit(d, t);
                  }}
                  granularity="minute"
                  className="flex items-center gap-2"
                >
                  <DateInput className="flex rounded-md border border-border bg-background px-2 py-1 text-sm">
                    {(segment) => (
                      <DateSegment
                        segment={segment}
                        className={cn(
                          "px-0.5 tabular-nums outline-none",
                          segment.type === "literal" ? "text-muted-foreground" : ""
                        )}
                      />
                    )}
                  </DateInput>
                  <div className="text-xs text-muted-foreground">({minuteStep} min)</div>
                </TimeField>

                <div className="pt-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Heures courantes</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[18, 19, 20, 21, 22, 23].map((h) => (
                      <Button
                        key={h}
                        type="button"
                        variant={selectedTime?.hour === h ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          const d = selectedDate ?? (() => {
                            const now = new Date();
                            return new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
                          })();
                          const m = selectedTime?.minute ?? 0;
                          const t = new Time(h, m);
                          setSelectedDate(d);
                          setSelectedTime(t);
                          commit(d, t);
                        }}
                        className="text-xs"
                      >
                        {h}h
                      </Button>
                    ))}
                  </div>
                  
                  <div className="pt-2 border-t">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Minutes</div>
                    <div className="grid grid-cols-4 gap-2">
                      {[0, 15, 30, 45].map((m) => (
                        <Button
                          key={m}
                          type="button"
                          variant={selectedTime?.minute === m ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const d = selectedDate ?? (() => {
                              const now = new Date();
                              return new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
                            })();
                            const h = selectedTime?.hour ?? 20;
                            const t = new Time(h, m);
                            setSelectedDate(d);
                            setSelectedTime(t);
                            commit(d, t);
                          }}
                          className="text-xs"
                        >
                          :{pad2(m)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Fermer
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </I18nProvider>
    </div>
  );
}


