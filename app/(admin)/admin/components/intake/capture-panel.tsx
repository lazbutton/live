"use client";

import * as React from "react";
import { ChevronDown, Facebook, ImageIcon, Link2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectSearchable } from "@/components/ui/select-searchable";
import { Textarea } from "@/components/ui/textarea";
import type {
  EventSource,
  IntakeCaptureMode,
  OpportunityFormState,
} from "./intake-types";
import { intakeUi } from "./intake-utils";

const captureModeOptions: Array<{
  value: IntakeCaptureMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "url", label: "URL", icon: Link2 },
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "facebook", label: "Facebook", icon: Facebook },
];

function normalizeCaptureMode(mode: IntakeCaptureMode | null | undefined): IntakeCaptureMode {
  if (mode === "image" || mode === "facebook") return mode;
  return "url";
}

export function CapturePanel(props: {
  activeSource?: EventSource | null;
  sourceById: Map<string, EventSource>;
  sources: EventSource[];
  form: OpportunityFormState;
  categoryOptions: Array<{ value: string; label: string }>;
  detectedLocationOptions: Array<{ value: string; label: string }>;
  saving: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: React.Dispatch<React.SetStateAction<OpportunityFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const sourceSelectValue = props.form.sourceId || "none";
  const selectedSource = props.form.sourceId ? props.sourceById.get(props.form.sourceId) : null;
  const focusSource = selectedSource ?? props.activeSource ?? null;
  const activeSourceForSync = props.activeSource;
  const onFormChange = props.onFormChange;
  const sourceOptions = React.useMemo(
    () => [{ value: "none", label: "Sans source" }, ...props.sources.map((source) => ({
      value: source.id,
      label: source.name,
    }))],
    [props.sources],
  );

  React.useEffect(() => {
    const activeSource = activeSourceForSync;
    if (!activeSource) return;
    onFormChange((current) => {
      if (current.sourceId === activeSource.id) return current;
      return {
        ...current,
        sourceId: activeSource.id,
        captureMode: normalizeCaptureMode(activeSource.default_capture_mode ?? current.captureMode),
        sourceUrl: activeSource.url,
        importUrl: "",
        detectedLocation: "",
        detectedCategory: "",
      };
    });
  }, [activeSourceForSync, onFormChange]);

  const submitLabel =
    props.form.captureMode === "url"
      ? "Importer URL"
      : props.form.captureMode === "image"
        ? "Importer image"
        : "Importer Facebook";

  return (
    <Card className={`${intakeUi.panelCard} border-primary/15`}>
      <CardHeader className={intakeUi.panelHeader}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle className={intakeUi.panelTitle}>Nouvelle opportunite</CardTitle>
              {focusSource ? (
                <Badge variant="outline" className={`max-w-[180px] truncate border-primary/30 text-primary ${intakeUi.compactBadge}`}>
                  {focusSource.name}
                </Badge>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => props.onOpenChange(!props.open)}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${props.open ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <form className="space-y-2" onSubmit={props.onSubmit}>
          {!focusSource ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Aucune source selectionnee
            </div>
          ) : null}

          <div className={intakeUi.sectionCard}>
            <div className="grid grid-cols-3 gap-1">
            {captureModeOptions.map((option) => {
              const Icon = option.icon;
              const active = props.form.captureMode === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  className={`${intakeUi.input} gap-1 border px-1.5 text-[11px] ${
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-transparent bg-background hover:border-primary/30"
                  }`}
                  onClick={() =>
                    props.onFormChange((current) => ({
                      ...current,
                      captureMode: option.value,
                      importUrl: current.importUrl,
                    }))
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </Button>
              );
            })}
            </div>
          </div>

          <div className={`${intakeUi.sectionCard} space-y-2`}>
            <Input
              className={intakeUi.inputStrong}
              placeholder="Titre brut de l'evenement"
              value={props.form.rawTitle}
              onChange={(event) =>
                props.onFormChange((current) => ({ ...current, rawTitle: event.target.value }))
              }
            />

            {props.form.captureMode === "url" || props.form.captureMode === "facebook" ? (
              <Input
                className={intakeUi.inputStrong}
                type="url"
                placeholder={
                  props.form.captureMode === "facebook"
                    ? "URL de l'evenement Facebook"
                    : "URL a importer pour pre-remplir"
                }
                value={props.form.importUrl}
                onChange={(event) =>
                  props.onFormChange((current) => ({
                    ...current,
                    importUrl: event.target.value,
                    sourceUrl: event.target.value || current.sourceUrl,
                  }))
                }
              />
            ) : null}

            {props.form.captureMode === "image" ? (
              <Input
                className="h-10 border-primary/20"
                type="file"
                accept="image/*"
                onChange={(event) =>
                  props.onFormChange((current) => ({
                    ...current,
                    imageFile: event.target.files?.[0] ?? null,
                  }))
                }
              />
            ) : null}
          </div>

          {!props.activeSource ? (
            <SelectSearchable
              options={sourceOptions}
              value={sourceSelectValue}
              placeholder="Source associee"
              searchPlaceholder="Rechercher une source..."
              className="min-h-9 text-sm"
              onValueChange={(value) => {
                const source = value === "none" ? undefined : props.sourceById.get(value);
                props.onFormChange((current) => ({
                  ...current,
                  sourceId: value === "none" ? "" : value,
                  captureMode: normalizeCaptureMode(source?.default_capture_mode ?? current.captureMode),
                  sourceUrl: source?.url ?? current.sourceUrl,
                  importUrl: "",
                  detectedLocation: "",
                  detectedCategory: "",
                }));
              }}
            />
          ) : null}

          {props.open ? (
            <div className={`${intakeUi.sectionCard} space-y-2 bg-muted/15 p-2.5`}>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Details avances
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  className={intakeUi.input}
                  type="datetime-local"
                  value={props.form.detectedDate}
                  onChange={(event) =>
                    props.onFormChange((current) => ({ ...current, detectedDate: event.target.value }))
                  }
                />
                <SelectSearchable
                  options={[
                    { value: "none", label: "Aucun lieu detecte" },
                    ...props.detectedLocationOptions,
                  ]}
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
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <SelectSearchable
                  options={[{ value: "none", label: "Aucune categorie" }, ...props.categoryOptions]}
                  value={props.form.detectedCategory || "none"}
                  placeholder="Categorie"
                  searchPlaceholder="Rechercher une categorie..."
                  className="min-h-9 text-sm"
                  onValueChange={(value) =>
                    props.onFormChange((current) => ({
                      ...current,
                      detectedCategory: value === "none" ? "" : value,
                    }))
                  }
                />
                <Input
                  className={intakeUi.input}
                  type="number"
                  min={0}
                  max={100}
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

              <Input
                className={intakeUi.input}
                placeholder="URL source specifique"
                value={props.form.sourceUrl}
                onChange={(event) =>
                  props.onFormChange((current) => ({ ...current, sourceUrl: event.target.value }))
                }
              />

              {props.form.captureMode === "image" ? (
                <Input
                  className={intakeUi.input}
                  type="url"
                  placeholder="Ou URL d'image"
                  value={props.form.imageUrl}
                  onChange={(event) =>
                    props.onFormChange((current) => ({ ...current, imageUrl: event.target.value }))
                  }
                />
              ) : null}

              <Input
                className={intakeUi.input}
                placeholder="Champs manquants: prix, image, horaires"
                value={props.form.missingFields}
                onChange={(event) =>
                  props.onFormChange((current) => ({ ...current, missingFields: event.target.value }))
                }
              />

              <Textarea
                className="min-h-20"
                placeholder="Notes de traitement"
                value={props.form.notes}
                onChange={(event) =>
                  props.onFormChange((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>
          ) : null}

          <Button className={`${intakeUi.input} w-full text-sm font-semibold`} type="submit">
            {submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
