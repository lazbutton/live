"use client";

import * as React from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { OrganizerSidebar } from "./organizer-sidebar";
import { MobileBottomNavOrganizer } from "./mobile-bottom-nav-organizer";
import { ThemeToggle } from "@/app/(admin)/admin/components/theme-toggle";
import { useIsMobile } from "@/hooks/use-mobile";
import { TooltipProvider } from "@/components/ui/tooltip";

interface OrganizerLayoutProps {
  children: React.ReactNode;
  title: string;
  breadcrumbItems?: Array<{ label: string; href?: string }>;
}

export function OrganizerLayout({ children, title, breadcrumbItems = [] }: OrganizerLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <TooltipProvider>
      <SidebarProvider data-app-shell="organizer" defaultOpen={!isMobile}>
        <OrganizerSidebar />
        <SidebarInset className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:px-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-1 !h-4" />
            <div className="flex min-w-0 flex-1 items-center">
              <Breadcrumb>
                <BreadcrumbList className="flex-nowrap">
                  <BreadcrumbItem className="hidden md:inline-flex">
                    <BreadcrumbLink href="/organizer/dashboard">Organisateur</BreadcrumbLink>
                  </BreadcrumbItem>
                  {breadcrumbItems.map((item, index) => (
                    <React.Fragment key={index}>
                      <BreadcrumbSeparator className="hidden md:block" />
                      <BreadcrumbItem className="min-w-0">
                        {item.href ? (
                          <BreadcrumbLink href={item.href} className="truncate">{item.label}</BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                    </React.Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
            </div>
          </header>
          <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-5 md:px-6 md:py-6 lg:px-8">
            <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
            {children}
          </div>
        </SidebarInset>
        <MobileBottomNavOrganizer />
      </SidebarProvider>
    </TooltipProvider>
  );
}



