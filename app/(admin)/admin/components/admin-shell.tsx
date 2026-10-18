"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { usePendingRequestsCount } from "@/hooks/use-pending-requests-count";
import { usePendingEventsCount } from "@/hooks/use-pending-events-count";
import { useOpenContentReportsCount } from "@/hooks/use-open-content-reports-count";
import { AdminSidebar } from "./admin-sidebar";
import { AdminCommandPalette } from "./admin-command-palette";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { ThemeToggle } from "./theme-toggle";
import { ADMIN_NAV_ITEMS, isAdminNavItemActive, type AdminNavCountKey } from "./admin-nav";
import { EventCreationProvider, useEventCreation } from "./events/event-creation-provider";

export type AdminBreadcrumbItem = { label: string; href?: string };

export type AdminNavCounts = Record<AdminNavCountKey, number | null>;

type AdminShellContextValue = {
  setBreadcrumbs: (pathname: string, items: AdminBreadcrumbItem[]) => void;
};

const AdminShellContext = React.createContext<AdminShellContextValue | null>(null);

/**
 * Déclare le fil d'Ariane de la page courante dans l'en-tête persistant.
 * Sans shell (ex. rendu isolé), l'appel est ignoré.
 */
export function useAdminBreadcrumbs(items: AdminBreadcrumbItem[]) {
  const context = React.useContext(AdminShellContext);
  const pathname = usePathname();
  const serialized = JSON.stringify(items);

  React.useEffect(() => {
    if (!context || !pathname) return;
    context.setBreadcrumbs(pathname, JSON.parse(serialized) as AdminBreadcrumbItem[]);
  }, [context, pathname, serialized]);
}

function NewEventButton() {
  const { openEventCreation } = useEventCreation();
  return (
    <Button
      type="button"
      size="sm"
      className="hidden md:inline-flex"
      onClick={() => openEventCreation()}
      title="Nouvel événement (N)"
    >
      <Plus />
      Nouvel événement
      <kbd className="ml-0.5 hidden h-4 items-center rounded border border-primary-foreground/25 px-1 font-mono text-[10px] text-primary-foreground/70 lg:inline-flex">
        N
      </kbd>
    </Button>
  );
}

function AdminHeader({
  breadcrumbs,
}: {
  breadcrumbs: AdminBreadcrumbItem[];
}) {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:px-3">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-1 !h-4" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 ? <BreadcrumbSeparator className="hidden md:block" /> : null}
                <BreadcrumbItem className={isLast ? "min-w-0" : "hidden md:inline-flex"}>
                  {item.href && !isLast ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-1">
        <AdminCommandPalette />
        <ThemeToggle />
        <div className="ml-1.5 hidden md:block">
          <NewEventButton />
        </div>
      </div>
    </header>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pageBreadcrumbs, setPageBreadcrumbs] = React.useState<{
    pathname: string;
    items: AdminBreadcrumbItem[];
  } | null>(null);

  const { count: pendingRequests } = usePendingRequestsCount();
  const { count: pendingEvents } = usePendingEventsCount();
  const { count: openReports } = useOpenContentReportsCount();

  const counts = React.useMemo<AdminNavCounts>(
    () => ({ pendingRequests, pendingEvents, openReports }),
    [pendingRequests, pendingEvents, openReports],
  );

  const contextValue = React.useMemo<AdminShellContextValue>(
    () => ({
      setBreadcrumbs: (nextPathname, items) => {
        setPageBreadcrumbs((current) => {
          if (
            current &&
            current.pathname === nextPathname &&
            JSON.stringify(current.items) === JSON.stringify(items)
          ) {
            return current;
          }
          return { pathname: nextPathname, items };
        });
      },
    }),
    [],
  );

  const breadcrumbs = React.useMemo<AdminBreadcrumbItem[]>(() => {
    const root: AdminBreadcrumbItem = { label: "Admin", href: "/admin/dashboard" };
    if (pageBreadcrumbs && pageBreadcrumbs.pathname === pathname && pageBreadcrumbs.items.length) {
      return [root, ...pageBreadcrumbs.items];
    }
    const section = ADMIN_NAV_ITEMS.find((item) => isAdminNavItemActive(pathname, item.url));
    return section ? [root, { label: section.title }] : [root];
  }, [pageBreadcrumbs, pathname]);

  return (
    <AdminShellContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={300}>
        <EventCreationProvider>
          <SidebarProvider data-app-shell="admin" defaultOpen>
            <AdminSidebar counts={counts} />
            <SidebarInset className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
              <AdminHeader breadcrumbs={breadcrumbs} />
              {children}
            </SidebarInset>
            <MobileBottomNav counts={counts} />
          </SidebarProvider>
        </EventCreationProvider>
      </TooltipProvider>
    </AdminShellContext.Provider>
  );
}
