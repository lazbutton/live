"use client";

import * as React from "react";
import { Crop, ImagePlus, Loader2, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { EntityAvatar, getInitials } from "./directory";

/** Classes du panneau latéral des fiches (lieu, organisateur, artiste). */
export const ENTITY_SHEET_CLASSNAME = "flex w-full flex-col gap-0 bg-background p-0 sm:w-[640px] sm:max-w-[100vw]";

/** En-tête de fiche : avatar, titre, sous-titre, bouton fermer et onglets éventuels. */
export function EntitySheetHeader({
  imageSrc,
  name,
  title,
  description,
  onClose,
  actions,
  children,
}: {
  imageSrc?: string | null;
  name: string;
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  /** Boutons secondaires affichés avant « Fermer ». */
  actions?: React.ReactNode;
  /** Onglets (`TabsList variant="line"`) affichés sous le titre. */
  children?: React.ReactNode;
}) {
  return (
    <SheetHeader className="gap-3 border-b border-border px-6 pb-0 pt-5">
      <div className="flex items-center gap-3">
        <EntityAvatar src={imageSrc} name={name} className="size-10" />
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate text-lg">{title}</SheetTitle>
          <SheetDescription className="truncate text-[13px]">{description}</SheetDescription>
        </div>
        {actions}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X />
        </Button>
      </div>
      {children ?? <div className="h-1" />}
    </SheetHeader>
  );
}

/** Zone défilante sous l'en-tête. */
export function EntitySheetBody({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5">{children}</div>;
}

/** Barre d'actions collée en bas du formulaire. */
export function EntitySheetFooter({
  onCancel,
  submitLabel,
  busy,
  busyLabel = "Enregistrement…",
  hint,
}: {
  onCancel: () => void;
  submitLabel: string;
  busy?: boolean;
  busyLabel?: string;
  /** Texte discret à gauche (raccourci, état…). */
  hint?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-6 mt-8 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      {hint ? <p className="mr-auto hidden text-xs text-muted-foreground sm:block">{hint}</p> : null}
      <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="max-sm:h-10 max-sm:flex-1">
        Annuler
      </Button>
      <Button type="submit" disabled={busy} className="max-sm:h-10 max-sm:flex-1">
        {busy ? <Loader2 className="animate-spin" /> : null}
        {busy ? busyLabel : submitLabel}
      </Button>
    </div>
  );
}

/** Groupe de champs titré à l'intérieur d'une fiche. */
export function EntityFormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4 border-t border-border pt-6 first:border-t-0 first:pt-0", className)}>
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Option activable avec titre et explication (switch à droite). */
export function EntitySwitchRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        {description ? <span className="block text-xs text-muted-foreground">{description}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/**
 * Champ image : aperçu, import de fichier, recadrage, suppression et URL distante.
 * Le recadrage est délégué à `ImageCropDialog` via `onFileSelected` / `onRecrop`.
 */
export function EntityImageField({
  id,
  name,
  preview,
  url,
  onUrlChange,
  onFileSelected,
  onRecrop,
  onRemove,
  hasLocalFile,
  shape = "wide",
  hint,
}: {
  id: string;
  /** Nom de l'entité, pour les initiales de l'aperçu vide. */
  name: string;
  preview: string | null;
  url: string;
  onUrlChange: (value: string) => void;
  /** Fichier choisi, lu en data URL. */
  onFileSelected: (dataUrl: string) => void;
  onRecrop?: () => void;
  onRemove: () => void;
  /** Un fichier local remplace l'URL (le champ URL est alors désactivé). */
  hasLocalFile?: boolean;
  shape?: "square" | "wide";
  hint?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Ce fichier n'est pas une image.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => onFileSelected(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => (preview && onRecrop ? onRecrop() : inputRef.current?.click())}
          className={cn(
            "group relative shrink-0 overflow-hidden rounded-lg border border-border bg-muted outline-none transition-colors hover:border-foreground/30 focus-visible:ring-[3px] focus-visible:ring-ring/40",
            shape === "square" ? "size-24" : "aspect-video w-40",
          )}
          aria-label={preview ? "Recadrer l'image" : "Importer une image"}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground/60">
              {name.trim() ? getInitials(name) : <ImagePlus className="h-5 w-5" />}
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <ImagePlus />
              {preview ? "Remplacer" : "Importer"}
            </Button>
            {preview && onRecrop ? (
              <Button type="button" variant="ghost" size="sm" onClick={onRecrop}>
                <Crop />
                Recadrer
              </Button>
            ) : null}
            {preview ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={onRemove}
              >
                <Trash2 />
                Retirer
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {hint || "JPG, PNG ou WebP. L'image est compressée avant l'envoi."}
          </p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <input ref={inputRef} id={`${id}-file`} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-url`} className="text-xs font-normal text-muted-foreground">
          Ou depuis une URL
        </Label>
        <Input
          id={`${id}-url`}
          type="url"
          value={hasLocalFile ? "" : url}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder={hasLocalFile ? "Fichier importé — retirez-le pour utiliser une URL" : "https://…"}
          disabled={hasLocalFile}
        />
      </div>
    </div>
  );
}
