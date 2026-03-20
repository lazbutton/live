"use client";

import { Download, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type QuickActionsProps = {
  onCreateEvent: () => void;
  onImportFromUrl: () => void;
};

export function QuickActions({ onCreateEvent, onImportFromUrl }: QuickActionsProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Actions rapides</CardTitle>
        <CardDescription>Les 2 actions les plus courantes.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={onCreateEvent} className="gap-2 flex-1">
          <Plus className="h-4 w-4" />
          Créer un événement
        </Button>
        <Button type="button" variant="outline" onClick={onImportFromUrl} className="gap-2 flex-1">
          <Download className="h-4 w-4" />
          Importer depuis URL
        </Button>
      </CardContent>
    </Card>
  );
}

