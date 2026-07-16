"use client";

import { useMemo, useState } from "react";
import { ChartGantt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BoardToolbar, type BoardView, type WeekFilter } from "@/components/planning/board-toolbar";
import { KanbanBoard } from "@/components/planning/kanban-board";
import { PlanningTableView } from "@/components/planning/table-view";
import { addTask, moveTask } from "@/lib/planning-board";
import { PLAN_TASKS, isOverdueActive, tasksByColumn, type ColumnKey, type PlanTask } from "@/lib/mock/planning";

/** Board view of the Experiments hub: a Kanban board of experiment/planning
 *  tasks moving through To Do -> Draft -> In Progress -> Review Requested ->
 *  Completed, with Table and Gantt sub-views via the same toolbar. Extracted
 *  from the old Planning page (app/planning/page.tsx) verbatim - board state
 *  is local React state seeded from the static mock (lib/mock/planning.ts) -
 *  there is no live task/experiment-status source yet, so drag-and-drop and
 *  "add task" only persist for the current page session. */
export function PlanningBoard() {
  const [tasks, setTasks] = useState<PlanTask[]>(PLAN_TASKS);
  const [view, setView] = useState<BoardView>("kanban");
  const [filter, setFilter] = useState<WeekFilter>("all");

  const overdueCount = useMemo(() => tasks.filter(isOverdueActive).length, [tasks]);

  // "This Week" is a stand-in per the design brief: there's no calendar/week
  // model behind the mock data, so it shows anything overdue or carrying a
  // due date at all (i.e. already scheduled) and hides the handful of
  // not-yet-dated backlog cards. "All Tasks" shows everything.
  const visibleTasks = useMemo(
    () => (filter === "week" ? tasks.filter((t) => isOverdueActive(t) || t.dueLabel) : tasks),
    [tasks, filter],
  );

  const grouped = useMemo(() => tasksByColumn(visibleTasks), [visibleTasks]);

  function handleMoveTask(taskId: string, toColumn: ColumnKey) {
    setTasks((prev) => moveTask(prev, taskId, toColumn));
  }

  function handleAddItem(column: ColumnKey, title: string) {
    setTasks((prev) => addTask(prev, title, column));
  }

  function handleRefresh() {
    setTasks(PLAN_TASKS);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <BoardToolbar
        view={view}
        onViewChange={setView}
        overdueCount={overdueCount}
        filter={filter}
        onFilterChange={setFilter}
        onRefresh={handleRefresh}
        onAddTask={(title) => handleAddItem("todo", title)}
      />

      {view === "kanban" ? (
        <KanbanBoard tasksByCol={grouped} onMoveTask={handleMoveTask} onAddItem={handleAddItem} />
      ) : null}

      {view === "table" ? <PlanningTableView tasksByCol={grouped} /> : null}

      {view === "gantt" ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-soft text-muted">
            <ChartGantt className="size-5" />
          </span>
          <div className="font-head text-[15px] font-semibold text-fg">Gantt view coming soon</div>
          <p className="max-w-[46ch] text-[13px] leading-5 text-muted">
            Timeline scheduling across vessels and campaigns is on the roadmap - use Kanban or Table for now.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
