import {
  BarChart3,
  Building2,
  Calendar,
  ImageIcon,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Map,
  Music,
  Settings,
  ShieldAlert,
  Type,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminNavCountKey = "pendingEvents" | "pendingRequests" | "openReports";

export type AdminNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  countKey?: AdminNavCountKey;
  keywords?: string;
};

export type AdminNavGroup = {
  label?: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    items: [
      {
        title: "Tableau de bord",
        url: "/admin/dashboard",
        icon: LayoutDashboard,
        keywords: "dashboard accueil kpi",
      },
      {
        title: "Événements",
        url: "/admin/events",
        icon: Calendar,
        countKey: "pendingEvents",
        keywords: "agenda calendrier events",
      },
    ],
  },
  {
    label: "À traiter",
    items: [
      {
        title: "Demandes",
        url: "/admin/requests",
        icon: Inbox,
        countKey: "pendingRequests",
        keywords: "inbox contributions",
      },
      {
        title: "Collecte",
        url: "/admin/intake",
        icon: ListChecks,
        keywords: "veille sources intake opportunites",
      },
      {
        title: "Modération",
        url: "/admin/moderation",
        icon: ShieldAlert,
        countKey: "openReports",
        keywords: "signalements ugc reports",
      },
      {
        title: "Titres à revoir",
        url: "/admin/titles",
        icon: Type,
        keywords: "titres capitales dates lieu guillemets qualité collecte",
      },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { title: "Artistes", url: "/admin/artists", icon: Music, keywords: "musiciens groupes" },
      { title: "Lieux", url: "/admin/locations", icon: Building2, keywords: "salles venues" },
      { title: "Organisateurs", url: "/admin/organizers", icon: Users, keywords: "orga structures" },
      {
        title: "Multi-événements",
        url: "/admin/major-events",
        icon: Map,
        keywords: "festivals major events",
      },
    ],
  },
  {
    label: "Outils",
    items: [
      {
        title: "Visuels réseaux",
        url: "/admin/share",
        icon: ImageIcon,
        keywords: "instagram partage social",
      },
      {
        title: "Audience de l'app",
        url: "/admin/audience",
        icon: BarChart3,
        keywords: "statistiques mesure compteurs usage fiches billetterie recherche",
      },
      { title: "Réglages", url: "/admin/settings", icon: Settings, keywords: "settings parametres" },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

/**
 * Entrées affichées dans la barre du bas sur mobile (autour du bouton « + »
 * central) ; le reste passe dans « Plus ».
 */
export const ADMIN_MOBILE_PRIMARY_URLS = ["/admin/dashboard", "/admin/events", "/admin/requests"];

export function isAdminNavItemActive(pathname: string | null, url: string) {
  if (!pathname) return false;
  if (url === "/admin/dashboard") return pathname === url;
  return pathname === url || pathname.startsWith(`${url}/`);
}

export function formatNavCount(count: number | null | undefined) {
  if (!count || count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
