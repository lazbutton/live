"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Inbox,
  Music,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePendingRequestsCount } from "@/hooks/use-pending-requests-count";
import { usePendingEventsCount } from "@/hooks/use-pending-events-count";
import { useOpenContentReportsCount } from "@/hooks/use-open-content-reports-count";
import { Badge } from "@/components/ui/badge";

const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    url: "/admin/dashboard",
  },
  {
    title: "Événements",
    icon: Calendar,
    url: "/admin/events",
  },
  {
    title: "Demandes",
    icon: Inbox,
    url: "/admin/requests",
  },
  {
    title: "Artistes",
    icon: Music,
    url: "/admin/artists",
  },
  {
    title: "Modération",
    icon: ShieldAlert,
    url: "/admin/moderation",
  },
  {
    title: "Réglages",
    icon: Settings,
    url: "/admin/settings",
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { count: pendingRequestsCount } = usePendingRequestsCount();
  const { count: pendingEventsCount } = usePendingEventsCount();
  const { count: openContentReportsCount } = useOpenContentReportsCount();

  if (!isMobile) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/20 bg-background/95 backdrop-blur-xl" style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}>
      <div className="flex h-16 items-center justify-around px-2">
        {menuItems.map((item) => {
          const isActive =
            pathname === item.url || (item.url !== "/admin/dashboard" && pathname?.startsWith(item.url));
          return (
            <Link
              key={item.url}
              href={item.url}
              className={cn(
                "relative flex min-w-[44px] flex-col items-center justify-center gap-1 rounded-lg px-3 py-2 transition-all duration-200 cursor-pointer",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground active:scale-95"
              )}
            >
              <div className="relative">
                <item.icon className={cn("h-5 w-5", isActive && "scale-110")} />
                {item.title === "Demandes" && pendingRequestsCount !== null && pendingRequestsCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[9px] font-bold leading-none flex items-center justify-center tabular-nums"
                  >
                    {pendingRequestsCount > 99 ? "99+" : pendingRequestsCount}
                  </Badge>
                )}
                {item.title === "Événements" && pendingEventsCount !== null && pendingEventsCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[9px] font-bold leading-none flex items-center justify-center tabular-nums"
                  >
                    {pendingEventsCount > 99 ? "99+" : pendingEventsCount}
                  </Badge>
                )}
                {item.title === "Modération" &&
                  openContentReportsCount !== null &&
                  openContentReportsCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[9px] font-bold leading-none flex items-center justify-center tabular-nums"
                    >
                      {openContentReportsCount > 99
                        ? "99+"
                        : openContentReportsCount}
                    </Badge>
                  )}
              </div>
              <span className="text-[10px] font-medium leading-tight">{item.title}</span>
              {isActive && (
                <div className="absolute bottom-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

