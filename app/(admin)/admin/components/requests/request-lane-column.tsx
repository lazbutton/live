"use client";

import * as React from "react";
import { CircleAlert } from "lucide-react";

import type { AdminRequestItem, AdminRequestLane } from "@/lib/admin-requests";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getLaneMeta } from "./request-ui";

export function RequestLaneColumn({
  lane,
  items,
  children,
}: {
  lane: AdminRequestLane;
  items: AdminRequestItem[];
  children: React.ReactNode;
}) {
  const meta = getLaneMeta(lane);

  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-card/55 shadow-sm", meta.borderClassName)}>
      <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3", meta.softClassName, meta.borderClassName)}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-semibold", meta.accentClassName)}>{meta.title}</span>
            <Badge variant="secondary" className="h-6 px-2 text-[11px]">
              {items.length}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-[24rem] flex-col items-center justify-center gap-2 px-6 py-10 text-center text-muted-foreground">
          <CircleAlert className="h-8 w-8 opacity-25" />
          <div className="font-medium">{meta.emptyTitle}</div>
          <div className="max-w-sm text-sm">{meta.emptyDescription}</div>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-13.5rem)] space-y-2.5 overflow-y-auto p-3">
          {children}
        </div>
      )}
    </section>
  );
}
