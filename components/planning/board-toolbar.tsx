"use client";

import type { ReactNode } from "react";
import { RefreshCw, Settings, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickAdd } from "@/components/planning/quick-add";

export type WeekFilter = "week" | "all";

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors",
        active ? "bg-card text-fg shadow-sm" : "text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function BoardToolbar({
  overdueCount,
  filter,
  onFilterChange,
  onRefresh,
  onAddTask,
}: {
  overdueCount: number;
  filter: WeekFilter;
  onFilterChange: (filter: WeekFilter) => void;
  onRefresh: () => void;
  onAddTask: (title: string) => void;
}) {
  // The hub's Live / Board / Table tabs own view switching now, so this toolbar
  // dropped its own Table/Gantt/Kanban segment - it carries only the board's
  // own controls (overdue count, week filter, refresh, Add Task).
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap",
            overdueCount > 0 ? "border-red/30 bg-red/10 text-red" : "border-border bg-card text-muted",
          )}
        >
          <TriangleAlert className="size-3.5 shrink-0" />
          {overdueCount} overdue
        </span>

        <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-border bg-blue-soft p-1">
          <SegmentButton active={filter === "week"} onClick={() => onFilterChange("week")}>
            This Week
          </SegmentButton>
          <SegmentButton active={filter === "all"} onClick={() => onFilterChange("all")}>
            All Tasks
          </SegmentButton>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh board"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted transition-colors hover:border-blue-border hover:bg-blue-soft hover:text-fg"
        >
          <RefreshCw className="size-4" />
        </button>

        <button
          type="button"
          aria-label="Board settings"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted transition-colors hover:border-blue-border hover:bg-blue-soft hover:text-fg"
        >
          <Settings className="size-4" />
        </button>

        <QuickAdd label="Add Task" onAdd={onAddTask} />
      </div>
    </div>
  );
}
