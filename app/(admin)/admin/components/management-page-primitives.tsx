"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * En-tête de page : titre, description, actions, puis contenu optionnel
 * (statistiques, onglets…). L'icône est conservée dans l'API pour la
 * compatibilité mais n'est plus affichée.
 */
export function ManagementHero({
  title,
  description,
  actions,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children ? <div>{children}</div> : null}
    </section>
  );
}

export function ManagementStatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}

export function ManagementStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5 shadow-xs">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-xl font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function ManagementToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col gap-3", className)}>{children}</div>;
}

export function ManagementEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground shadow-xs [&_svg]:size-5">
        {icon}
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function ManagementSectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <p className="shrink-0 text-xs font-medium text-muted-foreground">{children}</p>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function ManagementPill({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "positive" | "warning" | "muted";
  className?: string;
}) {
  const toneClassName =
    tone === "positive"
      ? "border-success/20 bg-success/10 text-success"
      : tone === "warning"
        ? "border-warning/25 bg-warning/10 text-warning"
        : tone === "muted"
          ? "border-transparent bg-muted text-muted-foreground"
          : "border-border bg-background text-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium leading-4",
        toneClassName,
        className,
      )}
    >
      {children}
    </span>
  );
}
