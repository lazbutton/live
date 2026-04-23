export interface PosterLineupItem {
  label: string;
  color?: string;
}

export interface PosterDetailRow {
  left: string;
  right: string;
  leftSecondary?: string;
  leftStyle?: "pill" | "plain";
  rightStyle?: "pill" | "plain";
}

export interface PosterBadge {
  date: string;
  year: string;
}

export interface PosterHeroImage {
  alt: string;
  focusX: number;
  focusY: number;
  src: string;
}

export interface PosterVenue {
  name: string;
  address: string;
}

export interface PosterDoor {
  label: string;
  time: string;
}

export interface PosterTheme {
  bgPage: string;
  bgCard: string;
  cardLight: string;
  textDark: string;
  accentPink: string;
  accentYellow: string;
  accentRed: string;
  accentBlue: string;
  border: string;
}

export interface PosterData {
  topDate: string;
  badge: PosterBadge;
  eventTitle: string;
  heroImage: PosterHeroImage;
  venue: PosterVenue;
  lineup: PosterLineupItem[];
  door: PosterDoor;
  details: PosterDetailRow[];
  footer: string;
}

export type PartialPosterData = Partial<
  Omit<PosterData, "badge" | "heroImage" | "venue" | "door" | "lineup" | "details">
> & {
  badge?: Partial<PosterBadge>;
  heroImage?: Partial<PosterHeroImage>;
  venue?: Partial<PosterVenue>;
  door?: Partial<PosterDoor>;
  lineup?: PosterLineupItem[];
  details?: PosterDetailRow[];
};

export type PartialPosterTheme = Partial<PosterTheme>;

export interface PosterExportOptions {
  backgroundColor?: string;
  download?: boolean;
  fileName?: string;
  scale?: number;
  useCORS?: boolean;
}
