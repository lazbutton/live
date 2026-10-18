"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useAdminBreadcrumbs, type AdminBreadcrumbItem } from "./admin-shell";

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbItems?: AdminBreadcrumbItem[];
  className?: string;
}

export function AdminPageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Contenu d'une page admin. La sidebar et l'en-tête sont rendus une seule fois
 * par le shell persistant (voir `admin-shell.tsx` et `admin/layout.tsx`).
 */
export function AdminLayout({
  children,
  title,
  description,
  actions,
  breadcrumbItems = [],
  className,
}: AdminLayoutProps) {
  useAdminBreadcrumbs(breadcrumbItems);

  return (
    <div
      className={cn(
        "mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-5 md:px-6 md:py-6 lg:px-8",
        className,
      )}
    >
      {title ? <AdminPageHeader title={title} description={description} actions={actions} /> : null}
      {children}
    </div>
  );
}
