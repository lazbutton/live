"use client";

import * as React from "react";
import { Loader2, LocateFixed, MapPin } from "lucide-react";

import { buttonClass, TextInput } from "./ui";

type Suggestion = { label: string; latitude: number; longitude: number };

/** Base Adresse Nationale, résultats rapprochés d'Orléans. */
async function searchAddresses(query: string, signal: AbortSignal): Promise<Suggestion[]> {
  const response = await fetch(
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5&lat=47.9029&lon=1.9093`,
    { signal },
  );
  const data = await response.json();
  return ((data?.features as any[]) || [])
    .map((feature) => ({
      label: feature?.properties?.label as string,
      longitude: feature?.geometry?.coordinates?.[0] as number,
      latitude: feature?.geometry?.coordinates?.[1] as number,
    }))
    .filter((item) => item.label);
}

/** Adresse avec suggestions, et bouton « Ici » qui reprend la position du téléphone. */
export function AddressField({
  id,
  value,
  onChange,
  onSelect,
  onLocate,
  locating,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: Suggestion) => void;
  onLocate: () => void;
  locating: boolean;
}) {
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [focused, setFocused] = React.useState(false);
  const [typed, setTyped] = React.useState(false);

  React.useEffect(() => {
    const query = value.trim();
    if (!focused || !typed || query.length < 4) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setSuggestions(await searchAddresses(query, controller.signal));
      } catch {
        /* hors ligne ou requête annulée */
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, focused, typed]);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <TextInput
          id={id}
          placeholder="Rue, ville"
          autoComplete="street-address"
          value={value}
          onChange={(event) => {
            setTyped(true);
            onChange(event.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <button type="button" className={buttonClass({ variant: "secondary", size: "md" })} onClick={onLocate} disabled={locating}>
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          Ici
        </button>
      </div>
      {focused && suggestions.length ? (
        <ul className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.label}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] active:bg-muted"
                // Garde le focus pour que le choix ne soit pas annulé par la perte de focus.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setTyped(false);
                  setSuggestions([]);
                  onSelect(suggestion);
                }}
              >
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
