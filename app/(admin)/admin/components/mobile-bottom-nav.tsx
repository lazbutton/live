"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, MapPin, Users, Tag, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

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
    title: "Lieux",
    icon: MapPin,
    url: "/admin/locations",
  },
  {
    title: "Organisateurs",
    icon: Users,
    url: "/admin/organizers",
  },
  {
    title: "Catégories",
    icon: Tag,
    url: "/admin/categories",
  },
  {
    title: "Demandes",
    icon: FileText,
    url: "/admin/requests",
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const isMobile = useIsMobile();

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
                "flex min-w-[44px] flex-col items-center justify-center gap-1 rounded-lg px-3 py-2 transition-all duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground active:scale-95"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "scale-110")} />
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

