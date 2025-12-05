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
import { AdminSidebar } from "./admin-sidebar";

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  breadcrumbItems?: Array<{ label: string; href?: string }>;
}

export function AdminLayout({ children, title, breadcrumbItems = [] }: AdminLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true} className="flex h-screen">
      <AdminSidebar />
      <SidebarInset className="flex-1 overflow-auto">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-4 border-b border-border/20 px-6 bg-background">
          <SidebarTrigger className="-ml-1 cursor-pointer hover:bg-accent/20 rounded-lg transition-all duration-200" />
          <Separator orientation="vertical" className="mr-1 h-5 opacity-20" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/admin/dashboard">Admin</BreadcrumbLink>
                </BreadcrumbItem>
                {breadcrumbItems.map((item, index) => (
                  <React.Fragment key={index}>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      {item.href ? (
                        <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{item.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 md:p-6 lg:p-8">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">{title}</h1>
            </div>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

