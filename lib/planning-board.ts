// Pure state-transition helpers for the Planning board (app/planning/page.tsx).
// Kept separate from lib/mock/planning.ts (data + read-only helpers) so the
// mutation logic driving drag-and-drop and "add task" is easy to unit test
// in isolation.

import { ASSIGNEES, type ColumnKey, type PlanTask } from "@/lib/mock/planning";

/** Moves `taskId` into `toColumn`. A no-op (returns a task with the same
 *  shape) if the task is already there or doesn't exist. */
export function moveTask(tasks: PlanTask[], taskId: string, toColumn: ColumnKey): PlanTask[] {
  return tasks.map((t) => (t.id === taskId ? { ...t, column: toColumn } : t));
}

/** Appends a new card to `column` from a title-only quick-add input.
 *  Defaults: medium priority, no due date, an assignee rotated deterministically
 *  from the existing task count (so repeated adds spread across the team
 *  instead of always landing on the same person). Blank titles are ignored. */
export function addTask(tasks: PlanTask[], title: string, column: ColumnKey): PlanTask[] {
  const trimmed = title.trim();
  if (!trimmed) return tasks;
  const task: PlanTask = {
    id: `plan-new-${tasks.length + 1}`,
    title: trimmed,
    column,
    priority: "medium",
    assignee: ASSIGNEES[tasks.length % ASSIGNEES.length],
  };
  return [...tasks, task];
}
