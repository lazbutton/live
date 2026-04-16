type PriceLike = number | string | null | undefined;

export type GenericPriceSource = {
  price?: PriceLike;
  price_min?: PriceLike;
  price_max?: PriceLike;
  presale_price?: PriceLike;
  subscriber_price?: PriceLike;
  is_pay_what_you_want?: boolean | null | undefined;
  isPayWhatYouWant?: boolean | null | undefined;
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

  if (source.is_pay_what_you_want === true || source.isPayWhatYouWant === true) {
    return "Prix libre";
  }

  const { priceMin, priceMax } = deriveGenericPriceRange(source);

  if (priceMin === null) {
    return emptyLabel;
  }

  if (priceMin <= 0) {
    return freeLabel;
  }

  const minLabel = `${formatPriceValue(priceMin)}${suffix}`;
  if (priceMax === null || priceMax <= priceMin) {
    return minLabel;
  }

  return `${formatPriceValue(priceMin)}${rangeSeparator}${formatPriceValue(priceMax)}${suffix}`;
}
