"use client";

import * as React from "react";
import { Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

const DISMISS_KEY = "outlive-ajout:install-dismissed";

/** Conseil d'installation, masqué une fois l'application installée ou le conseil refermé. */
export function InstallHint() {
  const [visible, setVisible] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* stockage indisponible */
    }
    if (standalone || dismissed) return;

    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setVisible(true);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* stockage indisponible */
    }
  };

  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-[13px] leading-5">
      <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="flex-1 text-muted-foreground">
        {isIos ? (
          <>
            Mets-la sur ton écran d&apos;accueil : <span className="text-foreground">Partager</span> puis{" "}
            <span className="text-foreground">« Sur l&apos;écran d&apos;accueil »</span>.
          </>
        ) : promptEvent ? (
          "Installe l'app : elle s'ouvre en un geste et reçoit les liens partagés depuis Instagram."
        ) : (
          <>
            Installe l&apos;app depuis le menu du navigateur (<span className="text-foreground">« Installer l&apos;application »</span>).
          </>
        )}
      </p>
      {promptEvent ? (
        <Button
          size="sm"
          onClick={async () => {
            await promptEvent.prompt();
            setPromptEvent(null);
            dismiss();
          }}
        >
          Installer
        </Button>
      ) : null}
      <button type="button" aria-label="Masquer le conseil" onClick={dismiss} className="text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}
