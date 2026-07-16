"use client";

import { useState } from "react";
import { COLUMNS, type ColumnKey, type PlanTask } from "@/lib/mock/planning";
import { KanbanColumn } from "@/components/planning/kanban-column";

/** The five-column board. Holds only the transient "which card is currently
 *  being dragged" state (for the dimmed-source-card affordance) - the task
 *  list itself lives in the page, one level up, since Table/Gantt need the
 *  same data. Horizontally scrollable so five columns never force the page
 *  body to scroll sideways; each column scrolls its own card stack. */
export function KanbanBoard({
  tasksByCol,
  onMoveTask,
  onAddItem,
}: {
  tasksByCol: Record<ColumnKey, PlanTask[]>;
  onMoveTask: (taskId: string, toColumn: ColumnKey) => void;
  onAddItem: (column: ColumnKey, title: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  return (
    <div className="w-full min-w-0 overflow-x-auto pb-2">
      <div className="flex w-max gap-4">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.key}
            column={col}
            tasks={tasksByCol[col.key]}
            draggingId={draggingId}
            onDragStartTask={setDraggingId}
            onDragEndTask={() => setDraggingId(null)}
            onDropTask={(taskId) => onMoveTask(taskId, col.key)}
            onAddItem={(title) => onAddItem(col.key, title)}
          />
        ))}
      </div>
    </div>
  );
}
