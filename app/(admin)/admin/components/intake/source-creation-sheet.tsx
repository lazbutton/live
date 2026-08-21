"use client";

import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type IntakeCaptureMode,
  priorityOptions,
  type SourceFormState,
  type SourceScope,
} from "./intake-types";
import { intakeUi } from "./intake-utils";

export function SourceCreationSheet(props: {
  open: boolean;
  saving: boolean;
  form: SourceFormState;
  mode?: "create" | "edit";
  notice?: string | null;
  sourceScope?: SourceScope | null;
  ownerName?: string | null;
  onOpenChange: (open: boolean) => void;
  onFormChange: React.Dispatch<React.SetStateAction<SourceFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const isOwnerSource = props.sourceScope === "owner";
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pb-4">
          <SheetTitle>
            {props.mode === "edit"
              ? isOwnerSource
                ? "Modifier la source synchronisee"
                : "Modifier une source globale"
              : "Ajouter une source globale"}
          </SheetTitle>
          <SheetDescription>
            {props.mode === "edit"
              ? isOwnerSource
                ? "Ajuste les parametres de collecte de cette source. Les infos owner restent synchronisees."
                : "Ajuste une source globale manuelle."
              : "Les sources liees a un organisateur sont synchronisees automatiquement."}
          </SheetDescription>
        </SheetHeader>

        <form className="space-y-4" onSubmit={props.onSubmit}>
          {props.notice ? (
            <div className={`${intakeUi.sectionCard} border-amber-500/40 bg-amber-500/10 text-sm text-amber-700 dark:text-amber-300`}>
              {props.notice}
            </div>
          ) : null}

          {isOwnerSource ? (
            <div className={`${intakeUi.sectionCard} bg-muted/20 text-sm`}>
              <div className="font-medium text-foreground">
                Source synchronisee{props.ownerName ? ` · ${props.ownerName}` : ""}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Le nom, l'URL et le mode d'entree principal restent lies a la fiche organisateur / lieu.
                Tu peux modifier ici les parametres de collecte de la source.
              </p>
            </div>
          ) : null}

          <Input
            className={intakeUi.input}
            placeholder={isOwnerSource ? "Nom de la source" : "Nom de la source globale"}
            value={props.form.name}
            disabled={isOwnerSource}
            onChange={(event) =>
              props.onFormChange((current) => ({ ...current, name: event.target.value }))
            }
          />

          <Input
            className={intakeUi.input}
            placeholder="URL directe"
            value={props.form.url}
            disabled={isOwnerSource}
            onChange={(event) =>
              props.onFormChange((current) => ({ ...current, url: event.target.value }))
            }
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={props.form.defaultCaptureMode}
              disabled={isOwnerSource}
              onValueChange={(value: IntakeCaptureMode) =>
                props.onFormChange((current) => ({ ...current, defaultCaptureMode: value }))
              }
            >
              <SelectTrigger className={intakeUi.input}>
                <SelectValue placeholder="Mode opportunite par defaut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="url">URL</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
              </SelectContent>
            </Select>

            <Input
              className={intakeUi.input}
              placeholder="Ville (optionnel)"
              value={props.form.cityHint}
              onChange={(event) =>
                props.onFormChange((current) => ({ ...current, cityHint: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={props.form.priority}
              onValueChange={(value) =>
                props.onFormChange((current) => ({
                  ...current,
                  priority: value as SourceFormState["priority"],
                }))
              }
            >
              <SelectTrigger className={intakeUi.input}>
                <SelectValue placeholder="Priorite" />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label} · {option.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              className={intakeUi.input}
              type="number"
              min={1}
              placeholder="Frequence de scan (jours)"
              value={props.form.scanFrequencyDays}
              onChange={(event) =>
                props.onFormChange((current) => ({
                  ...current,
                  scanFrequencyDays: event.target.value,
                }))
              }
            />
          </div>

          <Input
            className={intakeUi.input}
            placeholder="Categorie source (optionnel)"
            value={props.form.categoryHint}
            onChange={(event) =>
              props.onFormChange((current) => ({ ...current, categoryHint: event.target.value }))
            }
          />

          <Textarea
            className="min-h-24"
            placeholder="Notes internes de collecte"
            value={props.form.notes}
            onChange={(event) =>
              props.onFormChange((current) => ({ ...current, notes: event.target.value }))
            }
          />

          <Button className={`${intakeUi.input} w-full`} disabled={props.saving} type="submit">
            {props.mode === "edit"
              ? props.notice
                ? "Enregistrer et reprendre"
                : "Enregistrer les modifications"
              : "Ajouter la source globale"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
