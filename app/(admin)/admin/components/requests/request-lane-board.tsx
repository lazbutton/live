"use client";

import * as React from "react";

import type { AdminRequestItem, AdminRequestLane } from "@/lib/admin-requests";
import { cn } from "@/lib/utils";
import type { RequestBoardByLane } from "./request-types";
import { RequestLaneColumn } from "./request-lane-column";

export function RequestLaneBoard({
  board,
  activeLane,
  renderCard,
  className,
}: {
  board: RequestBoardByLane;
  activeLane: AdminRequestLane;
  renderCard: (item: AdminRequestItem) => React.ReactNode;
  className?: string;
}) {
  const items = board[activeLane];

  return (
    <div className={cn("h-full min-h-0 space-y-3", className)}>
      <RequestLaneColumn lane={activeLane} items={items}>
        {items.map((item) => renderCard(item))}
      </RequestLaneColumn>
    </div>
  );
}
