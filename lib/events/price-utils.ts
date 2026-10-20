type PriceLike = number | string | null | undefined;

/**
 * Genre de prix d'un événement enregistré : events.price_kind, calculé par la base (migration
 * 20261020100000), seule source de la règle « gratuit » (tous les prix à 0) / « non renseigné ».
 */
export type PriceKind = "free" | "paid" | "pay_what_you_want" | "unknown";

export type GenericPriceSource = {
  price?: PriceLike;
  price_min?: PriceLike;
  price_max?: PriceLike;
  presale_price?: PriceLike;
  subscriber_price?: PriceLike;
  is_pay_what_you_want?: boolean | null | undefined;
  isPayWhatYouWant?: boolean | null | undefined;
  price_kind?: string | null | undefined;
};

export function toNullablePrice(value: PriceLike): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function deriveGenericPriceRange(
  source: GenericPriceSource,
): { priceMin: number | null; priceMax: number | null } {
  const explicitMin = toNullablePrice(source.price_min);
  const explicitMax = toNullablePrice(source.price_max);

  if (explicitMin !== null || explicitMax !== null) {
    const priceMin = explicitMin ?? explicitMax;
    const priceMax =
      explicitMax !== null &&
      priceMin !== null &&
      explicitMax > priceMin
        ? explicitMax
        : null;

    return {
      priceMin,
      priceMax,
    };
  }

  const legacyCandidates = [
    toNullablePrice(source.price),
    toNullablePrice(source.presale_price),
    toNullablePrice(source.subscriber_price),
  ].filter((value): value is number => value !== null);

  if (legacyCandidates.length === 0) {
    return {
      priceMin: null,
      priceMax: null,
    };
  }

  const sorted = [...legacyCandidates].sort((a, b) => a - b);
  const priceMin = sorted[0] ?? null;
  const maxCandidate = sorted[sorted.length - 1] ?? null;

  return {
    priceMin,
    priceMax:
      priceMin !== null &&
      maxCandidate !== null &&
      maxCandidate > priceMin
        ? maxCandidate
        : null,
  };
}

function formatPriceValue(value: number) {
  if (Number.isInteger(value)) {
    return value.toLocaleString("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Libellé du prix d'un événement lu en base : « Prix libre », « Gratuit » (freeLabel), le montant
 * (« 12€ », « 8 à 12€ », « 0 à 5€ ») ou emptyLabel quand le prix n'est pas renseigné. Le genre vient
 * de price_kind, à sélectionner avec l'événement ; sans lui, le prix compte comme non renseigné.
 */
export function formatGenericPriceLabel(
  source: GenericPriceSource,
  options?: {
    suffix?: string;
    freeLabel?: string | null;
    emptyLabel?: string | null;
    rangeSeparator?: string;
  },
): string | null {
  const {
    suffix = "€",
    freeLabel = "Gratuit",
    emptyLabel = null,
    rangeSeparator = " à ",
  } = options ?? {};

  if (source.price_kind === "pay_what_you_want") return "Prix libre";
  if (source.price_kind === "free") return freeLabel;
  if (source.price_kind !== "paid") return emptyLabel;

  const { priceMin, priceMax } = deriveGenericPriceRange(source);

  if (priceMin === null) {
    return emptyLabel;
  }

  const minLabel = `${formatPriceValue(priceMin)}${suffix}`;
  if (priceMax === null || priceMax <= priceMin) {
    return minLabel;
  }

  return `${formatPriceValue(priceMin)}${rangeSeparator}${formatPriceValue(priceMax)}${suffix}`;
}
