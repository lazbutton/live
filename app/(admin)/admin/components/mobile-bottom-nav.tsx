"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ADMIN_MOBILE_PRIMARY_URLS,
  ADMIN_NAV_ITEMS,
  formatNavCount,
  isAdminNavItemActive,
} from "./admin-nav";
import type { AdminNavCounts } from "./admin-shell";
import { useEventCreation } from "./events/event-creation-provider";

const primaryItems = ADMIN_NAV_ITEMS.filter((item) => ADMIN_MOBILE_PRIMARY_URLS.includes(item.url));
const overflowItems = ADMIN_NAV_ITEMS.filter((item) => !ADMIN_MOBILE_PRIMARY_URLS.includes(item.url));

const SHORT_LABELS: Record<string, string> = {
  "/admin/dashboard": "Accueil",
};

function CountDot({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold leading-none text-background tabular-nums">
      {value}
    </span>
  );
}

export function MobileBottomNav({ counts }: { counts: AdminNavCounts }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { openEventCreation } = useEventCreation();

  if (!isMobile) return null;

  const overflowActive = overflowItems.some((item) => isAdminNavItemActive(pathname, item.url));
  const overflowCount = formatNavCount(
    overflowItems.reduce((total, item) => total + (item.countKey ? counts[item.countKey] ?? 0 : 0), 0),
  );

  const itemClassName = (isActive: boolean) =>
    cn(
      "relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
      isActive ? "text-foreground" : "text-muted-foreground active:text-foreground",
    );

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
    >
      <div className="flex h-16 items-stretch px-1">
        {primaryItems.map((item, index) => {
          const isActive = isAdminNavItemActive(pathname, item.url);
          const count = item.countKey ? formatNavCount(counts[item.countKey]) : null;
          const link = (
            <Link
              key={item.url}
              href={item.url}
              aria-current={isActive ? "page" : undefined}
              className={itemClassName(isActive)}
            >
              {isActive ? (
                <span className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-foreground" />
              ) : null}
              <span className="relative">
                <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
                <CountDot value={count} />
              </span>
              <span className="max-w-full truncate px-1">{SHORT_LABELS[item.url] ?? item.title}</span>
            </Link>
          );

          // Bouton « + » central après les deux premières entrées.
          if (index !== 1) return link;
          return (
            <React.Fragment key={item.url}>
              {link}
              <div className="flex flex-1 items-center justify-center">
                <button
                  type="button"
                  onClick={() => openEventCreation()}
                  aria-label="Nouvel événement"
                  className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md outline-none transition-transform active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <Plus className="h-6 w-6" strokeWidth={2.25} />
                </button>
              </div>
            </React.Fragment>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={itemClassName(overflowActive)}>
              {overflowActive ? (
                <span className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-foreground" />
              ) : null}
              <span className="relative">
                <MoreHorizontal className="h-5 w-5" />
                <CountDot value={overflowCount} />
              </span>
              <span>Plus</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" sideOffset={10} className="mb-1 w-64">
            <DropdownMenuLabel>Autres sections</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {overflowItems.map((item) => {
              const isActive = isAdminNavItemActive(pathname, item.url);
              const count = item.countKey ? formatNavCount(counts[item.countKey]) : null;
              return (
                <DropdownMenuItem key={item.url} asChild>
                  <Link href={item.url} className={cn(isActive && "bg-accent font-medium")}>
                    <item.icon />
                    <span className="flex-1">{item.title}</span>
                    {count ? (
                      <span className="rounded-full border px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
