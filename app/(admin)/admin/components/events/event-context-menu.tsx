"use client";

import * as React from "react";
import { CheckCircle2, Pencil, Sparkles, Star, Users } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { cn } from "@/lib/utils";

import type { AdminEvent } from "./types";

type EventContextMenuProps = {
  event: AdminEvent;
  x: number;
  y: number;
  open: boolean;
  onClose: () => void;
  onEdit: (event: AdminEvent) => void;
  onEditArtists: (event: AdminEvent) => void;
  onToggleFull: (event: AdminEvent) => Promise<void>;
  onToggleFeatured: (event: AdminEvent) => Promise<void>;
  onQuickApprove?: (event: AdminEvent) => Promise<void>;
};

type ActionButtonProps = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
};

function ActionButton({ icon, label, onClick, danger = false }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        danger
          ? "text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
          : "text-foreground hover:bg-accent/60",
      )}
      onClick={onClick}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export function EventContextMenu({
  event,
  x,
  y,
  open,
  onClose,
  onEdit,
  onEditArtists,
  onToggleFull,
  onToggleFeatured,
  onQuickApprove,
}: EventContextMenuProps) {
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    function handlePointerDown(mouseEvent: PointerEvent) {
      const target = mouseEvent.target;
      if (!(target instanceof Node)) {
        onClose();
        return;
      }
      if (menuRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    function handleEscape(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("blur", onClose);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose, open]);

  const dateLabel = React.useMemo(() => {
    try {
      return format(new Date(event.date), "EEE d MMM • HH:mm", { locale: fr });
    } catch {
      return event.date;
    }
  }, [event.date]);

  function runAction(action: () => void | Promise<void>) {
    onClose();
    void action();
  }

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[80] min-w-[250px] rounded-xl border border-border bg-background/95 p-2 shadow-2xl backdrop-blur-xl"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
      role="menu"
      aria-label={`Actions rapides pour ${event.title || "cet événement"}`}
    >
      <div className="border-b border-border/60 px-2 pb-2 pt-1">
        <div className="truncate text-sm font-semibold">{event.title || "(Sans titre)"}</div>
        <div className="mt-1 text-xs text-muted-foreground">{dateLabel}</div>
      </div>

      <div className="space-y-1 pt-2">
        <ActionButton
          icon={<Pencil className="h-4 w-4" />}
          label="Modifier l’événement"
          onClick={() => runAction(() => onEdit(event))}
        />

        <ActionButton
          icon={<Users className="h-4 w-4" />}
          label="Artistes / collaborateurs"
          onClick={() => runAction(() => onEditArtists(event))}
        />

        <ActionButton
          icon={<CheckCircle2 className="h-4 w-4" />}
          label={event.is_full ? "Retirer le statut complet" : "Marquer comme complet"}
          onClick={() => runAction(() => onToggleFull(event))}
        />

        <ActionButton
          icon={event.is_featured ? <Sparkles className="h-4 w-4" /> : <Star className="h-4 w-4" />}
          label={event.is_featured ? "Retirer de la une" : "Mettre à la une"}
          onClick={() => runAction(() => onToggleFeatured(event))}
        />

        {event.status === "pending" && onQuickApprove ? (
          <>
            <div className="my-2 h-px bg-border/70" />
            <ActionButton
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Approuver l’événement"
              onClick={() => runAction(() => onQuickApprove(event))}
              danger
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
