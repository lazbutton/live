"use client";

import type * as React from "react";

export function IntakeEmptyState(props: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  const Icon = props.icon;
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
      <Icon className="mb-3 h-8 w-8 text-muted-foreground" />
      <h3 className="font-semibold">{props.title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{props.description}</p>
    </div>
  );
}
