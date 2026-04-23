import type {
  PartialPosterData,
  PartialPosterTheme,
  PosterData,
  PosterDetailRow,
  PosterLineupItem,
  PosterTheme,
} from "./types";

export const defaultPosterTheme: PosterTheme = {
  bgPage: "#111827",
  bgCard: "#274c77",
  cardLight: "#f7f2e9",
  textDark: "#121c3b",
  accentPink: "#e76f92",
  accentYellow: "#f4d03f",
  accentRed: "#d35400",
  accentBlue: "#3498db",
  border: "#ffffff",
};

export const defaultPosterData: PosterData = {
  topDate: "31 juillet - 2 aout 2026",
  badge: {
    date: "31 JUILLET",
    year: "2026",
  },
  eventTitle: "SOLIS\nARCADIA",
  heroImage: {
    alt: "Visuel principal du festival",
    focusX: 50,
    focusY: 50,
    src: "",
  },
  venue: {
    name: "Chateau de Courtalain",
    address: "Eure-et-Loir\nFrance",
  },
  lineup: [
    { label: "Boboxa", color: "#121c3b" },
    { label: "High Kollektiv", color: "#e76f92" },
    { label: "Arcadia Soundsystem", color: "#3498db" },
  ],
  door: {
    label: "Horaires",
    time: "18:00-03:00",
  },
  details: [
    {
      left: "Festival",
      leftSecondary: "89EUR",
      right: "Open air, Electro",
      leftStyle: "pill",
      rightStyle: "plain",
    },
    { left: "89EUR", right: "OutLive", leftStyle: "plain", rightStyle: "plain" },
  ],
  footer: "Boboxa & High Kollektiv",
};

export function createPosterTheme(overrides: PartialPosterTheme = {}): PosterTheme {
  return {
    ...defaultPosterTheme,
    ...overrides,
  };
}

function cloneLineup(items: PosterLineupItem[]): PosterLineupItem[] {
  return items.map((item) => ({ ...item }));
}

function cloneDetails(rows: PosterDetailRow[]): PosterDetailRow[] {
  return rows.map((row) => ({ ...row }));
}

export function createPosterData(overrides: PartialPosterData = {}): PosterData {
  const hasLineup = overrides.lineup !== undefined;
  const hasDetails = overrides.details !== undefined;

  return {
    ...defaultPosterData,
    ...overrides,
    badge: {
      ...defaultPosterData.badge,
      ...overrides.badge,
    },
    heroImage: {
      ...defaultPosterData.heroImage,
      ...overrides.heroImage,
    },
    venue: {
      ...defaultPosterData.venue,
      ...overrides.venue,
    },
    door: {
      ...defaultPosterData.door,
      ...overrides.door,
    },
    lineup: hasLineup ? cloneLineup(overrides.lineup ?? []) : cloneLineup(defaultPosterData.lineup),
    details: hasDetails
      ? cloneDetails(overrides.details ?? [])
      : cloneDetails(defaultPosterData.details),
  };
}
