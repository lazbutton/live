"use client";

import * as React from "react";

import type { AdminRequestItem, AdminRequestLane } from "@/lib/admin-requests";
import type { RequestBoardByLane } from "./request-types";
import { RequestLaneColumn } from "./request-lane-column";

export function RequestLaneBoard({
  board,
  activeLane,
  renderCard,
}: {
  board: RequestBoardByLane;
  activeLane: AdminRequestLane;
  renderCard: (item: AdminRequestItem) => React.ReactNode;
}) {
  const items = board[activeLane];

  return (
    <div className="space-y-3">
      <RequestLaneColumn lane={activeLane} items={items}>
        {items.map((item) => renderCard(item))}
      </RequestLaneColumn>
    </div>
  );
}
