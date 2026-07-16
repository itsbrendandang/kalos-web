"use client";

import { useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { COLUMNS, type ColumnTone, type PlanTask } from "@/lib/mock/planning";
import { TaskCard } from "@/components/planning/task-card";
import { QuickAdd } from "@/components/planning/quick-add";

const TONE_DOT: Record<ColumnTone, string> = {
  neutral: "bg-muted",
  chart1: "bg-chart-1",
  amber: "bg-amber",
  good: "bg-green",
};

export function KanbanColumn({
  column,
  tasks,
  draggingId,
  onDragStartTask,
  onDragEndTask,
  onDropTask,
  onAddItem,
}: {
  column: (typeof COLUMNS)[number];
  tasks: PlanTask[];
  draggingId: string | null;
  onDragStartTask: (id: string) => void;
  onDragEndTask: () => void;
  onDropTask: (id: string) => void;
  onAddItem: (title: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    if (id) onDropTask(id);
  }

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[column.tone])} />
        <span className="text-[12.5px] font-semibold text-fg">{column.label}</span>
        <span className="ml-auto rounded-full bg-blue-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-muted">
          {tasks.length}
        </span>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex max-h-[65vh] min-h-[100px] flex-col gap-2 overflow-y-auto rounded-xl border border-dashed p-2 transition-colors motion-reduce:transition-none",
          dragOver ? "border-accent-hover bg-blue-soft" : "border-border/70",
        )}
      >
        {tasks.length === 0 ? (
          <p className="py-6 text-center text-[11.5px] text-muted">No items</p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isDragging={draggingId === task.id}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", task.id);
                e.dataTransfer.effectAllowed = "move";
                onDragStartTask(task.id);
              }}
              onDragEnd={onDragEndTask}
            />
          ))
        )}
      </div>

      <div className="mt-2 px-1">
        <QuickAdd
          label="Add an item"
          onAdd={onAddItem}
          triggerClassName="w-full justify-start text-muted hover:text-fg"
        />
      </div>
    </div>
  );
}
