import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Briques de l'écran /ajout. Volontairement locales : les composants partagés de l'admin
 * n'ont pas le même rendu selon la version déployée.
 */

export function buttonClass({
  variant = "primary",
  size = "lg",
}: { variant?: "primary" | "secondary" | "ghost"; size?: "lg" | "md" | "sm" } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium outline-none",
    "transition-[transform,background-color,opacity] duration-150 active:scale-[0.98]",
    "focus-visible:ring-4 focus-visible:ring-ring/15 disabled:pointer-events-none disabled:opacity-35",
    "[&_svg]:shrink-0",
    size === "lg" && "h-[52px] rounded-2xl px-5 text-[17px] [&_svg]:size-5",
    size === "md" && "h-12 rounded-xl px-4 text-[15px] [&_svg]:size-[18px]",
    size === "sm" && "h-10 rounded-xl px-3.5 text-[14px] [&_svg]:size-4",
    variant === "primary" && "bg-primary text-primary-foreground",
    variant === "secondary" && "border border-border bg-card text-foreground",
    variant === "ghost" && "text-foreground active:bg-muted",
  );
}

export const inputClass = cn(
  "h-12 w-full min-w-0 rounded-xl border border-border bg-input px-4 text-[16px] text-foreground outline-none",
  "transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground",
  "focus:border-foreground/35 focus:ring-4 focus:ring-ring/10 aria-invalid:border-warning",
);

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...props} />;
  },
);

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-1 pb-2">
      <h2 className="text-[13px] font-medium text-muted-foreground">{children}</h2>
      {aside}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-card", className)} {...props} />;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full outline-none transition-colors duration-200",
        "focus-visible:ring-4 focus-visible:ring-ring/15",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute size-[27px] rounded-full shadow-sm transition-transform duration-200",
          checked ? "translate-x-[22px] bg-primary-foreground" : "translate-x-[2px] bg-white",
        )}
      />
    </button>
  );
}

/** Pastille de statut : la couleur ne sert qu'à « Suivi ». */
export function Pill({ tone, children }: { tone: "success" | "muted" | "outline"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium leading-5",
        tone === "success" && "bg-success/12 text-success",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "outline" && "border border-border text-foreground",
      )}
    >
      {tone === "success" ? <span className="size-1.5 rounded-full bg-success" aria-hidden /> : null}
      {children}
    </span>
  );
}
