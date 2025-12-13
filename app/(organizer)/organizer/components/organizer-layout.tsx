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
      <SidebarProvider defaultOpen={!isMobile} className="flex h-screen">
        <OrganizerSidebar />
        <SidebarInset className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0" style={{ minWidth: 0, maxWidth: '100%', width: '100%' }}>
          <header className="sticky top-0 z-10 flex h-14 md:h-16 shrink-0 items-center gap-2 md:gap-4 border-b border-border px-3 md:px-6 bg-background">
            <SidebarTrigger className="cursor-pointer hover:bg-accent/20 rounded-lg transition-all duration-200 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0" />
            <Separator orientation="vertical" className="mr-1 h-5 opacity-20 hidden md:block" />
            <div className="flex-1 min-w-0 flex items-center">
              <Breadcrumb>
                <BreadcrumbList className="items-center">
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="/organizer/dashboard">Organisateur</BreadcrumbLink>
                  </BreadcrumbItem>
                  {breadcrumbItems.map((item, index) => (
                    <React.Fragment key={index}>
                      <BreadcrumbSeparator className="hidden md:block" />
                      <BreadcrumbItem className="flex items-center">
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
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-3 md:p-4 lg:p-6 xl:p-8">
            <div className="flex items-center justify-between">
              <h1 className="text-xl md:text-2xl font-semibold truncate">{title}</h1>
            </div>
            {children}
          </div>
        </SidebarInset>
        <MobileBottomNavOrganizer />
      </SidebarProvider>
    </TooltipProvider>
  );
}



