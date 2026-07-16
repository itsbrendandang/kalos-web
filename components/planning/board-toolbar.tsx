"use client";

import type { ReactNode } from "react";
import { ChartGantt, LayoutGrid, RefreshCw, Settings, Table2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickAdd } from "@/components/planning/quick-add";

export type BoardView = "table" | "gantt" | "kanban";
export type WeekFilter = "week" | "all";

const VIEWS: { key: BoardView; label: string; icon: typeof Table2 }[] = [
  { key: "table", label: "Table", icon: Table2 },
  { key: "gantt", label: "Gantt", icon: ChartGantt },
  { key: "kanban", label: "Kanban", icon: LayoutGrid },
];

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
  view,
  onViewChange,
  overdueCount,
  filter,
  onFilterChange,
  onRefresh,
  onAddTask,
}: {
  view: BoardView;
  onViewChange: (view: BoardView) => void;
  overdueCount: number;
  filter: WeekFilter;
  onFilterChange: (filter: WeekFilter) => void;
  onRefresh: () => void;
  onAddTask: (title: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-border bg-blue-soft p-1">
        {VIEWS.map((v) => (
          <SegmentButton key={v.key} active={view === v.key} onClick={() => onViewChange(v.key)}>
            <v.icon className="size-3.5" />
            {v.label}
          </SegmentButton>
        ))}
      </div>

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
