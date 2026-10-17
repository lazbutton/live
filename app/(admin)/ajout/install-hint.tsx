"use client";

import * as React from "react";
import { Smartphone, X } from "lucide-react";

import { buttonClass, Card } from "./ui";

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
    <Card className="flex items-start gap-3 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Smartphone className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-[15px] font-medium leading-tight">Garde-la sur ton écran d&apos;accueil</p>
        <p className="text-[13px] leading-snug text-muted-foreground">
          {isIos
            ? "Dans Safari : Partager, puis « Sur l'écran d'accueil »."
            : promptEvent
              ? "Elle s'ouvrira en un geste et recevra les liens partagés depuis Instagram."
              : "Menu du navigateur, puis « Installer l'application »."}
        </p>
        {promptEvent ? (
          <button
            type="button"
            className={buttonClass({ size: "sm" })}
            onClick={async () => {
              await promptEvent.prompt();
              setPromptEvent(null);
              dismiss();
            }}
          >
            Installer
          </button>
        ) : null}
      </div>
      <button type="button" aria-label="Masquer le conseil" onClick={dismiss} className="-m-1 p-1 text-muted-foreground">
        <X className="size-[18px]" />
      </button>
    </Card>
  );
}
