"use client";

import * as React from "react";
import { CircleAlert, LucideIcon } from "lucide-react";

import type { AdminRequestItem } from "@/lib/admin-requests";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RequestListSection = {
  id: string;
  title: string;
  description: string;
  items: AdminRequestItem[];
  icon?: LucideIcon;
  accentClassName?: string;
  softClassName?: string;
  borderClassName?: string;
};

export function RequestQueueBoard({
  sections,
  title,
  description,
  emptyTitle,
  emptyDescription,
  renderCard,
  getItemRef,
  className,
}: {
  sections: RequestListSection[];
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  renderCard: (item: AdminRequestItem) => React.ReactNode;
  getItemRef?: (itemId: string) => (node: HTMLDivElement | null) => void;
  className?: string;
}) {
  const itemCount = sections.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card/55 shadow-sm",
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            <Badge variant="secondary" className="h-6 px-2 text-[11px]">
              {itemCount}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {itemCount === 0 ? (
        <div className="flex min-h-[24rem] flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center text-muted-foreground">
          <CircleAlert className="h-8 w-8 opacity-25" />
          <div className="font-medium">{emptyTitle}</div>
          <div className="max-w-sm text-sm">{emptyDescription}</div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          {sections.map((section) => {
            const Icon = section.icon;

            return (
              <div key={section.id} className="space-y-2.5">
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                    section.softClassName,
                    section.borderClassName,
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {Icon ? (
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          section.accentClassName,
                        )}
                      />
                    ) : null}
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-sm font-semibold",
                          section.accentClassName,
                        )}
                      >
                        {section.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {section.description}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[11px]">
                    {section.items.length}
                  </Badge>
                </div>

                <div className="space-y-2.5">
                  {section.items.map((item) => (
                    <div key={item.id} ref={getItemRef?.(item.id)}>
                      {renderCard(item)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
