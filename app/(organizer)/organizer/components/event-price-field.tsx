"use client";

import { Euro } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PRICE_MODE_ITEMS, priceFieldsError, type PriceFields, type PriceMode } from "@/lib/events/price-mode";

/**
 * Tarif d'un événement, avec le même choix que le formulaire de l'admin : Non précisé, Gratuit,
 * Payant (prix et maximum facultatif) ou Prix libre. Les champs s'enregistrent avec
 * priceColumnsFromFields (lib/events/price-mode.ts).
 */
export function EventPriceField({
  mode,
  fields,
  onModeChange,
  onFieldsChange,
  disabled,
}: {
  mode: PriceMode;
  fields: PriceFields;
  onModeChange: (mode: PriceMode) => void;
  onFieldsChange: (fields: Partial<PriceFields>) => void;
  disabled?: boolean;
}) {
  const error = priceFieldsError(fields, mode);

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Euro className="h-4 w-4" />
        Tarif
      </Label>
      <SegmentedControl
        aria-label="Tarif"
        value={mode}
        onValueChange={onModeChange}
        items={PRICE_MODE_ITEMS}
        className="w-full [&>button]:flex-1"
      />
      {mode === "paid" ? (
        <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="price_min">Prix (€)</Label>
            <Input
              id="price_min"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={fields.price_min}
              onChange={(event) => onFieldsChange({ price_min: event.target.value })}
              placeholder="12"
              aria-invalid={Boolean(error)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price_max">Prix maximum (€)</Label>
            <Input
              id="price_max"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={fields.price_max}
              onChange={(event) => onFieldsChange({ price_max: event.target.value })}
              placeholder="Facultatif"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">Pour une fourchette, ex. 8 à 12 €.</p>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
