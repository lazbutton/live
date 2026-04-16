export type ResolvableCategory = {
  id: string;
  name: string;
};

export type ImportedCategoryResolution = {
  id: string;
  name: string | null;
  matched: boolean;
  strategy: "id" | "exact" | "partial" | "keyword" | "ai" | "none";
  sourceLabel: string | null;
  candidateLabels: string[];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "au",
  "aux",
  "avec",
  "by",
  "dans",
  "de",
  "des",
  "du",
  "en",
  "et",
  "for",
  "la",
  "le",
  "les",
  "of",
  "or",
  "pour",
  "sur",
  "the",
  "un",
  "une",
]);

const TOKEN_EXPANSIONS: Record<string, string[]> = {
  art: ["art", "arts", "expo", "exposition", "exhibition", "vernissage", "gallery", "galerie"],
  atelier: ["atelier", "workshop", "masterclass", "cours", "class"],
  cinema: ["cinema", "ciné", "movie", "film", "projection", "screening"],
  club: ["club", "dj", "dance", "electro", "electronic", "soirée", "soiree", "party", "nightlife"],
  comedy: ["comedy", "comedie", "humour", "humor", "standup", "stand-up", "impro"],
  concert: ["concert", "gig", "live", "music", "musique", "showcase"],
  conference: ["conference", "conférence", "talk", "meetup", "table ronde", "panel"],
  festival: ["festival", "fest", "open air"],
  food: ["food", "brunch", "diner", "dîner", "degustation", "dégustation", "restaurant", "repas"],
  marche: ["marche", "marché", "market", "brocante", "foire", "fair"],
  sport: ["sport", "run", "running", "football", "basket", "yoga", "fitness"],
  theatre: ["theatre", "théâtre", "theater", "piece", "pièce", "spectacle", "scene", "scène"],
};

const KEYWORD_HINTS: Array<{ aliases: string[]; categoryKeywords: string[] }> = [
  {
    aliases: ["live music", "musique live", "concert", "gig", "showcase"],
    categoryKeywords: ["concert", "live", "musique", "music"],
  },
  {
    aliases: ["dj set", "club night", "soirée club", "soiree club", "party", "nightlife"],
    categoryKeywords: ["club", "dj", "soirée", "soiree", "electro", "dance"],
  },
  {
    aliases: ["stand up", "stand-up", "humour", "comedy", "impro"],
    categoryKeywords: ["humour", "comedy", "comedie", "stand", "theatre", "théâtre"],
  },
  {
    aliases: ["expo", "exhibition", "vernissage", "gallery opening"],
    categoryKeywords: ["expo", "exposition", "art", "vernissage", "gallery", "galerie"],
  },
  {
    aliases: ["workshop", "atelier", "masterclass", "cours"],
    categoryKeywords: ["atelier", "workshop", "cours", "masterclass", "conference", "conférence"],
  },
  {
    aliases: ["screening", "projection", "film", "movie"],
    categoryKeywords: ["cinema", "ciné", "film", "projection"],
  },
  {
    aliases: ["market", "brocante", "marché", "marche", "fair"],
    categoryKeywords: ["marché", "marche", "market", "brocante", "foire"],
  },
];

export function normalizeCategoryText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeCategoryText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function expandTokens(tokens: string[]) {
  const expanded = new Set<string>();

  for (const token of tokens) {
    expanded.add(token);
    for (const [key, values] of Object.entries(TOKEN_EXPANSIONS)) {
      if (token === key || values.includes(token)) {
        expanded.add(key);
        for (const value of values) {
          expanded.add(normalizeCategoryText(value));
        }
      }
    }
  }

  return expanded;
}

function uniqueLabels(labels: Array<string | null | undefined>) {
  return labels
    .map((label) => label?.trim())
    .filter((label): label is string => Boolean(label))
    .filter((label, index, array) => array.indexOf(label) === index);
}

function buildNoMatch(candidateLabels: string[]): ImportedCategoryResolution {
  return {
    id: "",
    name: null,
    matched: false,
    strategy: "none",
    sourceLabel: candidateLabels[0] ?? null,
    candidateLabels,
  };
}

function scoreKeywordMatch(categoryName: string, candidateLabel: string) {
  const normalizedCategoryName = normalizeCategoryText(categoryName);
  const normalizedCandidateLabel = normalizeCategoryText(candidateLabel);

  if (!normalizedCategoryName || !normalizedCandidateLabel) {
    return 0;
  }

  let score = 0;
  const candidateTokens = expandTokens(tokenize(candidateLabel));
  const categoryTokens = expandTokens(tokenize(categoryName));

  for (const token of candidateTokens) {
    if (categoryTokens.has(token)) {
      score += 4;
    }
  }

  for (const hint of KEYWORD_HINTS) {
    const aliasMatched = hint.aliases.some(
      (alias) =>
        normalizedCandidateLabel.includes(normalizeCategoryText(alias)) ||
        normalizeCategoryText(alias).includes(normalizedCandidateLabel),
    );
    if (!aliasMatched) continue;

    const keywordMatched = hint.categoryKeywords.some((keyword) =>
      normalizedCategoryName.includes(normalizeCategoryText(keyword)),
    );
    if (keywordMatched) {
      score += 8;
    }
  }

  return score;
}

export function resolveImportedCategory(
  categories: ResolvableCategory[],
  rawLabels: Array<string | null | undefined>,
): ImportedCategoryResolution {
  const candidateLabels = uniqueLabels(rawLabels);
  if (candidateLabels.length === 0) {
    return buildNoMatch(candidateLabels);
  }

  for (const candidateLabel of candidateLabels) {
    const byId = categories.find((category) => category.id === candidateLabel);
    if (byId) {
      return {
        id: byId.id,
        name: byId.name,
        matched: true,
        strategy: "id",
        sourceLabel: candidateLabel,
        candidateLabels,
      };
    }
  }

  for (const candidateLabel of candidateLabels) {
    const normalizedCandidate = normalizeCategoryText(candidateLabel);
    const exact = categories.find(
      (category) => normalizeCategoryText(category.name) === normalizedCandidate,
    );
    if (exact) {
      return {
        id: exact.id,
        name: exact.name,
        matched: true,
        strategy: "exact",
        sourceLabel: candidateLabel,
        candidateLabels,
      };
    }
  }

  for (const candidateLabel of candidateLabels) {
    const normalizedCandidate = normalizeCategoryText(candidateLabel);
    const partial = categories.find((category) => {
      const normalizedName = normalizeCategoryText(category.name);
      return (
        normalizedName.includes(normalizedCandidate) ||
        normalizedCandidate.includes(normalizedName)
      );
    });
    if (partial) {
      return {
        id: partial.id,
        name: partial.name,
        matched: true,
        strategy: "partial",
        sourceLabel: candidateLabel,
        candidateLabels,
      };
    }
  }

  let bestMatch:
    | {
        category: ResolvableCategory;
        sourceLabel: string;
        score: number;
      }
    | undefined;

  for (const candidateLabel of candidateLabels) {
    for (const category of categories) {
      const score = scoreKeywordMatch(category.name, candidateLabel);
      if (score < 8) continue;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          category,
          sourceLabel: candidateLabel,
          score,
        };
      }
    }
  }

  if (bestMatch) {
    return {
      id: bestMatch.category.id,
      name: bestMatch.category.name,
      matched: true,
      strategy: "keyword",
      sourceLabel: bestMatch.sourceLabel,
      candidateLabels,
    };
  }

  return buildNoMatch(candidateLabels);
}

export function extractImportedCategoryLabels(args: {
  category?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { category, metadata } = args;
  const metadataValues = [
    metadata?.categories,
    metadata?.facebookCategories,
    metadata?.facebookCategoryLabels,
    metadata?.rawCategoryLabels,
  ];

  const labels = [
    category,
    ...metadataValues.flatMap((value) =>
      Array.isArray(value)
        ? value.map((entry) => String(entry).trim())
        : [],
    ),
  ];

  return uniqueLabels(labels);
}
