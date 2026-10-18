import { cn } from "@/lib/utils";

/** Monogramme OutLive (« ● ! ») en version monochrome, sur tuile. */
export function AdminLogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 20 20" className="size-[70%]" fill="currentColor">
        <circle cx="6.6" cy="11.2" r="3.6" />
        <path d="M12.9 3.6h3.6l-1 8.8h-2z" />
        <rect x="12.9" y="14.2" width="2.8" height="2.8" rx="0.3" />
      </svg>
    </span>
  );
}

export function AdminWordmark({
  subtitle = "Administration",
  className,
}: {
  subtitle?: string;
  className?: string;
}) {
  return (
    <span className={cn("grid min-w-0 leading-tight", className)}>
      <span className="truncate text-sm font-semibold tracking-tight">OutLive</span>
      <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
    </span>
  );
}
