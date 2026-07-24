"use client";

import { useMemo, useState } from "react";
import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "@/components/page-header";
import { BoardToolbar, type WeekFilter } from "@/components/planning/board-toolbar";
import { KanbanBoard } from "@/components/planning/kanban-board";
import { addTask, moveTask } from "@/lib/planning-board";
import { PLAN_TASKS, isOverdueActive, tasksByColumn, type ColumnKey, type PlanTask } from "@/lib/mock/planning";
import { DEMO_MODE } from "@/lib/demo";

/** Honest empty state: there is no live task/planning source yet, and demo
 *  mode is off, so this board renders nothing fabricated rather than a
 *  kanban board of fake assignees and due dates that could read as real. */
function NoLivePlanning() {
  return (
    <Card className="flex flex-col items-center gap-1.5 py-10 text-center">
      <PlugZap className="size-5 text-muted" />
      <div className="text-[13.5px] font-semibold text-fg">No live planning board</div>
      <p className="max-w-[46ch] text-[12px] leading-5 text-muted">
        There is no live task/experiment-planning source connected yet. Set{" "}
        <code className="font-mono">NEXT_PUBLIC_DEMO_MODE=true</code> to preview this board with demo data.
      </p>
    </Card>
  );
}

/** Board view of the Experiments hub: a Kanban board of experiment/planning
 *  tasks moving through To Do -> Draft -> In Progress -> Review Requested ->
 *  Completed. Extracted from the old Planning page (app/planning/page.tsx) -
 *  board state is local React state seeded from the static mock
 *  (lib/mock/planning.ts); there is no live task/experiment-status source yet,
 *  so drag-and-drop and "add task" only persist for the current page session.
 *  The hub's Live/Board/Table tabs own view switching, so this component no
 *  longer carries its own Table/Gantt sub-views.
 *
 *  There is no live source for this board at all (unlike the Live tab, which
 *  has a real /api/experiments to prefer) - so it renders the mock only when
 *  NEXT_PUBLIC_DEMO_MODE is explicitly on, badged, and an honest empty state
 *  otherwise. See lib/demo.ts. */
export function PlanningBoard() {
  if (!DEMO_MODE) return <NoLivePlanning />;
  return <DemoPlanningBoard />;
}

function DemoPlanningBoard() {
  const [tasks, setTasks] = useState<PlanTask[]>(PLAN_TASKS);
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
      <div className="flex justify-end">
        <DemoBadge />
      </div>

      <BoardToolbar
        overdueCount={overdueCount}
        filter={filter}
        onFilterChange={setFilter}
        onRefresh={handleRefresh}
        onAddTask={(title) => handleAddItem("todo", title)}
      />

      <KanbanBoard tasksByCol={grouped} onMoveTask={handleMoveTask} onAddItem={handleAddItem} />
    </div>
  );
}
