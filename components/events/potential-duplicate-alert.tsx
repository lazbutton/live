"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  type PotentialDuplicateEvent,
} from "@/lib/events/potential-duplicates";

type PotentialDuplicateAlertProps = {
  duplicates: PotentialDuplicateEvent[];
  loading?: boolean;
  agendaBasePath?: string;
};

function buildAgendaHref(
  date: string,
  agendaBasePath: string,
) {
  const day = date.slice(0, 10);
  const separator = agendaBasePath.includes("?") ? "&" : "?";
  return `${agendaBasePath}${separator}view=agenda&start=${day}`;
}

export function PotentialDuplicateAlert({
  duplicates,
  loading = false,
  agendaBasePath = "/admin/events",
}: PotentialDuplicateAlertProps) {
  if (loading) {
    return (
      <Alert className="border-warning/25 bg-warning/10">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <AlertTitle>Vérification des doublons potentiels…</AlertTitle>
        <AlertDescription>
          Recherche d&apos;événements au même lieu sur des créneaux qui se croisent.
        </AlertDescription>
      </Alert>
    );
  }

  if (duplicates.length === 0) {
    return null;
  }

  return (
    <Alert className="border-warning/25 bg-warning/10">
      <AlertTriangle className="h-4 w-4 text-warning" />
      <AlertTitle>
        Doublon potentiel détecté
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Un ou plusieurs événements existent déjà dans le même lieu sur une plage
          horaire identique ou qui se chevauche.
        </p>
        <div className="flex flex-wrap gap-2">
          {duplicates.map((duplicate) => (
            <Link
              key={duplicate.id}
              href={buildAgendaHref(duplicate.date, agendaBasePath)}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Badge
                variant="outline"
                className="cursor-pointer border-warning/30 bg-background/80 px-3 py-1 text-foreground hover:bg-background"
              >
                {duplicate.matchKind === "exact" ? "Identique" : "Chevauchement"} ·{" "}
                {duplicate.title?.trim() || "Sans titre"}
              </Badge>
            </Link>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
