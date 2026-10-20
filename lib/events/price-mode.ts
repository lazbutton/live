/*
 * Choix du tarif dans les formulaires d'événement (admin, espace organisateur) : « Non précisé »,
 * « Gratuit », « Payant », « Prix libre ». Le formulaire l'enregistre dans price, price_min, price_max
 * et is_pay_what_you_want ; la base en déduit events.price_kind (migration 20261020100000), que lisent
 * l'app et les pages : Non précisé → unknown (rien d'affiché), Gratuit → free, Payant → paid,
 * Prix libre → pay_what_you_want.
 */
import {
  deriveGenericPriceRange,
  formatGenericPriceLabel,
  toNullablePrice,
  type GenericPriceSource,
  type PriceKind,
} from "./price-utils";

export type PriceMode = "unknown" | "free" | "paid" | "pwyw";

export const PRICE_MODE_ITEMS: Array<{ value: PriceMode; label: string }> = [
  { value: "unknown", label: "Non précisé" },
  { value: "free", label: "Gratuit" },
  { value: "paid", label: "Payant" },
  { value: "pwyw", label: "Prix libre" },
];

/** Champs de tarif d'un formulaire, en texte comme dans les champs de saisie. */
export type PriceFields = {
  price_min: string;
  price_max: string;
  is_pay_what_you_want: boolean;
};

/** Champs d'un événement lu en base ; un prix de 0 reste « 0 » (« Gratuit »). */
export function priceFieldsFromEvent(event: GenericPriceSource): PriceFields {
  const { priceMin, priceMax } = deriveGenericPriceRange(event);
  return {
    price_min: priceMin != null ? String(priceMin) : "",
    price_max: priceMax != null ? String(priceMax) : "",
    is_pay_what_you_want: Boolean(event.is_pay_what_you_want),
  };
}

/** Choix affiché pour des champs : rien → Non précisé, tout à 0 → Gratuit. */
export function derivePriceMode(fields: PriceFields): PriceMode {
  if (fields.is_pay_what_you_want) return "pwyw";
  const min = toNullablePrice(fields.price_min);
  const max = toNullablePrice(fields.price_max);
  if (min === null && max === null) return "unknown";
  if ((min ?? 0) <= 0 && (max === null || max <= 0)) return "free";
  return "paid";
}

/** Champs après le choix de [mode] ; « Payant » garde un prix déjà saisi s'il est positif. */
export function applyPriceMode<T extends PriceFields>(fields: T, mode: PriceMode): T {
  if (mode === "pwyw") return { ...fields, is_pay_what_you_want: true, price_min: "", price_max: "" };
  if (mode === "free") return { ...fields, is_pay_what_you_want: false, price_min: "0", price_max: "" };
  if (mode === "unknown") return { ...fields, is_pay_what_you_want: false, price_min: "", price_max: "" };
  const currentMin = toNullablePrice(fields.price_min);
  return {
    ...fields,
    is_pay_what_you_want: false,
    price_min: currentMin && currentMin > 0 ? fields.price_min : "",
  };
}

/** Erreur de saisie d'un tarif « Payant », sinon null. */
export function priceFieldsError(fields: PriceFields, mode: PriceMode): string | null {
  if (fields.is_pay_what_you_want || mode !== "paid") return null;
  const min = toNullablePrice(fields.price_min);
  const max = toNullablePrice(fields.price_max);
  if (min === null && max !== null) return "Renseigne le prix avant le maximum.";
  if (min !== null && max !== null && max < min) return "Le maximum doit être supérieur au prix.";
  return null;
}

/** Genre de prix (events.price_kind) que la base calculera pour ce choix. */
export function priceKindForMode(mode: PriceMode): PriceKind {
  return mode === "pwyw" ? "pay_what_you_want" : mode;
}

/** Libellé du tarif en cours de saisie (aperçu d'un formulaire), tel que l'app l'affichera. */
export function formatPriceFieldsLabel(
  fields: PriceFields,
  mode: PriceMode,
  options?: Parameters<typeof formatGenericPriceLabel>[1],
) {
  return formatGenericPriceLabel({ ...priceColumnsFromFields(fields), price_kind: priceKindForMode(mode) }, options);
}

/** Colonnes de events à enregistrer ; price reprend price_min pour les anciens lecteurs. */
export function priceColumnsFromFields(fields: PriceFields) {
  const isPayWhatYouWant = Boolean(fields.is_pay_what_you_want);
  const min = toNullablePrice(fields.price_min);
  const max = toNullablePrice(fields.price_max);
  return {
    price: isPayWhatYouWant ? null : min,
    price_min: isPayWhatYouWant ? null : min,
    price_max: isPayWhatYouWant || max === null || min === null || max <= min ? null : max,
    is_pay_what_you_want: isPayWhatYouWant,
  };
}
