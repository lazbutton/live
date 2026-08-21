"use client";

import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventSource, EventSourceScanLog } from "./intake-types";
import { formatDateOnly, formatDateTime, getSourceDomainLabel, getSourceStatusLabel } from "./intake-utils";

const actionLabels: Record<EventSourceScanLog["action"], string> = {
  scanned: "Scan",
  reset_scan: "Reset",
  status_change: "Statut",
};

export function ScanHistoryPanel(props: {
  activeSource?: EventSource | null;
  logs: EventSourceScanLog[];
}) {
  const compactLogs = props.logs.slice(0, 3);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/20 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-3.5 w-3.5" />
            Source active
          </CardTitle>
          {props.activeSource ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {getSourceStatusLabel(props.activeSource.status)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-2">
        {!props.activeSource ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Aucune source active
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-background px-2.5 py-2">
              <div className="truncate text-sm font-semibold">{props.activeSource.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>{getSourceDomainLabel(props.activeSource.url)}</span>
                <span>Prochain: {formatDateOnly(props.activeSource.next_scan_at)}</span>
                <span>{props.activeSource.discovery_count} trouves</span>
              </div>
            </div>

            {compactLogs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Aucun scan journalise pour cette source.
              </p>
            ) : compactLogs.map((log) => (
            <div key={log.id} className="rounded-lg border border-border bg-background px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {actionLabels[log.action]}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{formatDateTime(log.scanned_at)}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Prochain scan: {formatDateTime(log.next_scan_at)}
                {log.opportunities_found > 0 ? ` · ${log.opportunities_found} trouves` : ""}
              </div>
              {log.notes ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{log.notes}</p> : null}
            </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
