"use client";

import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectSearchable } from "@/components/ui/select-searchable";
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
import { Textarea } from "@/components/ui/textarea";
import {
  opportunityStatusOptions,
  type OpportunityEditFormState,
  type OpportunityStatus,
} from "./intake-types";
import { intakeUi } from "./intake-utils";

export function OpportunityEditSheet(props: {
  open: boolean;
  saving: boolean;
  form: OpportunityEditFormState;
  sourceOptions: Array<{ value: string; label: string }>;
  categoryOptions: Array<{ value: string; label: string }>;
  detectedLocationOptions: Array<{ value: string; label: string }>;
  onOpenChange: (open: boolean) => void;
  onFormChange: React.Dispatch<React.SetStateAction<OpportunityEditFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pb-4">
          <SheetTitle>Modifier une opportunite</SheetTitle>
          <SheetDescription>
            Corrige les informations detectees sans quitter la collecte.
          </SheetDescription>
        </SheetHeader>

        <form className="space-y-4" onSubmit={props.onSubmit}>
          <Input
            className={intakeUi.input}
            placeholder="Titre de l'evenement"
            value={props.form.rawTitle}
            onChange={(event) =>
              props.onFormChange((current) => ({ ...current, rawTitle: event.target.value }))
            }
          />

          <SelectSearchable
            options={[{ value: "none", label: "Sans source" }, ...props.sourceOptions]}
            value={props.form.sourceId || "none"}
            placeholder="Source associee"
            searchPlaceholder="Rechercher une source..."
            className="min-h-9 text-sm"
            onValueChange={(value) =>
              props.onFormChange((current) => ({
                ...current,
                sourceId: value === "none" ? "" : value,
              }))
            }
          />

          <Input
            className={intakeUi.input}
            placeholder="URL source"
            value={props.form.sourceUrl}
            onChange={(event) =>
              props.onFormChange((current) => ({ ...current, sourceUrl: event.target.value }))
            }
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              className={intakeUi.input}
              type="datetime-local"
              value={props.form.detectedDate}
              onChange={(event) =>
                props.onFormChange((current) => ({ ...current, detectedDate: event.target.value }))
              }
            />

            <Input
              className={intakeUi.input}
              min={0}
              max={100}
              type="number"
              placeholder="Confiance 0-100"
              value={props.form.confidenceScore}
              onChange={(event) =>
                props.onFormChange((current) => ({
                  ...current,
                  confidenceScore: event.target.value,
                }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectSearchable
              options={[{ value: "none", label: "Aucun lieu detecte" }, ...props.detectedLocationOptions]}
              value={props.form.detectedLocation || "none"}
              placeholder="Lieu ou ville detecte"
              searchPlaceholder="Rechercher un lieu ou une ville..."
              className="min-h-9 text-sm"
              onValueChange={(value) =>
                props.onFormChange((current) => ({
                  ...current,
                  detectedLocation: value === "none" ? "" : value,
                }))
              }
            />

            <SelectSearchable
              options={[{ value: "none", label: "Aucune categorie" }, ...props.categoryOptions]}
              value={props.form.detectedCategory || "none"}
              placeholder="Categorie detectee"
              searchPlaceholder="Rechercher une categorie..."
              className="min-h-9 text-sm"
              onValueChange={(value) =>
                props.onFormChange((current) => ({
                  ...current,
                  detectedCategory: value === "none" ? "" : value,
                }))
              }
            />
          </div>

          <Select
            value={props.form.status}
            onValueChange={(value: OpportunityStatus) =>
              props.onFormChange((current) => ({ ...current, status: value }))
            }
          >
            <SelectTrigger className={intakeUi.input}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opportunityStatusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className={intakeUi.input}
            placeholder="Champs manquants: prix, image, horaires"
            value={props.form.missingFields}
            onChange={(event) =>
              props.onFormChange((current) => ({ ...current, missingFields: event.target.value }))
            }
          />

          <Textarea
            placeholder="Raison de decision: hors scope, doublon, a revoir..."
            value={props.form.decisionReason}
            onChange={(event) =>
              props.onFormChange((current) => ({
                ...current,
                decisionReason: event.target.value,
              }))
            }
          />

          <Textarea
            placeholder="Notes de traitement"
            value={props.form.notes}
            onChange={(event) =>
              props.onFormChange((current) => ({ ...current, notes: event.target.value }))
            }
          />

          <Button className={`${intakeUi.input} w-full`} disabled={props.saving} type="submit">
            Enregistrer l'opportunite
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
