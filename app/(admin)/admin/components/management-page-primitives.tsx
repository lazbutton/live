"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ManagementHero({
  icon,
  title,
  description,
  actions,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-background via-muted/15 to-primary/5 shadow-sm">
      <div className="absolute -right-16 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute left-0 top-0 h-24 w-24 rounded-full bg-primary/5 blur-2xl" />
      <div className="relative p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-foreground">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background/90 shadow-sm">
                {icon}
              </span>
              <h2 className="text-xl font-semibold md:text-2xl">{title}</h2>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </div>
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
    <div className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-4", className)}>
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
    <Card className="rounded-2xl border-border/70 bg-background/85 shadow-sm">
      <CardContent className="space-y-1 p-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-lg font-semibold leading-none">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export function ManagementToolbar({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border border-border/70 bg-card/70 shadow-sm">
      <CardContent className="p-3 md:p-4">{children}</CardContent>
    </Card>
  );
}

export function ManagementEmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="rounded-3xl border border-dashed border-border/70 bg-muted/15 shadow-none">
      <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-background/90 text-muted-foreground shadow-sm">
          {icon}
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ManagementSectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </p>
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
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : tone === "muted"
          ? "border-border/60 bg-muted/40 text-muted-foreground"
          : "border-primary/15 bg-primary/5 text-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
        toneClassName,
        className,
      )}
    >
      {children}
    </span>
  );
}
