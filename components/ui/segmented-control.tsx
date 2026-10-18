"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type SegmentedControlItem<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number | null;
  title?: string;
};

/**
 * Bascule exclusive compacte (filtres de statut, changement de vue…).
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onValueChange,
  size = "default",
  className,
  "aria-label": ariaLabel,
}: {
  items: Array<SegmentedControlItem<T>>;
  value: T;
  onValueChange: (value: T) => void;
  size?: "sm" | "default";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5",
        size === "sm" ? "h-8" : "h-9 max-md:h-10",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={item.title}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium outline-none transition-[color,background-color,box-shadow] duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 [&_svg]:size-3.5 [&_svg]:shrink-0",
              active
                ? "bg-background text-foreground shadow-xs dark:bg-input/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
            {item.count != null && item.count > 0 ? (
              <span
                className={cn(
                  "rounded px-1 text-[11px] tabular-nums",
                  active ? "bg-muted text-foreground" : "bg-background/70 text-muted-foreground dark:bg-input/40",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
