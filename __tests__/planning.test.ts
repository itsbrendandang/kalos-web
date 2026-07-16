import { describe, expect, it } from "vitest";
import { COLUMNS, PLAN_TASKS, isOverdueActive, tasksByColumn, type PlanTask } from "@/lib/mock/planning";
import { addTask, moveTask } from "@/lib/planning-board";

describe("tasksByColumn", () => {
  it("groups every task under its column and preserves every column key", () => {
    const grouped = tasksByColumn(PLAN_TASKS);
    for (const col of COLUMNS) {
      expect(grouped[col.key].every((t) => t.column === col.key)).toBe(true);
    }
    const total = COLUMNS.reduce((sum, col) => sum + grouped[col.key].length, 0);
    expect(total).toBe(PLAN_TASKS.length);
  });

  it("returns an empty array (not undefined) for a column with no tasks", () => {
    const grouped = tasksByColumn([]);
    for (const col of COLUMNS) {
      expect(grouped[col.key]).toEqual([]);
    }
  });
});

describe("isOverdueActive", () => {
  it("is true for an overdue task still in flight", () => {
    const task: PlanTask = { id: "t1", title: "x", column: "review", priority: "high", overdue: true };
    expect(isOverdueActive(task)).toBe(true);
  });

  it("is false once the same overdue task lands in completed", () => {
    const task: PlanTask = { id: "t1", title: "x", column: "completed", priority: "high", overdue: true };
    expect(isOverdueActive(task)).toBe(false);
  });

  it("is false when the task was never marked overdue", () => {
    const task: PlanTask = { id: "t1", title: "x", column: "todo", priority: "low" };
    expect(isOverdueActive(task)).toBe(false);
  });
});

describe("moveTask", () => {
  it("updates only the matching task's column, leaving the rest untouched", () => {
    const before = tasksByColumnSeed();
    const after = moveTask(before, "a", "in_progress");

    expect(after.find((t) => t.id === "a")?.column).toBe("in_progress");
    expect(after.find((t) => t.id === "b")).toEqual(before.find((t) => t.id === "b"));
  });

  it("is a no-op when the id doesn't match any task", () => {
    const before = tasksByColumnSeed();
    const after = moveTask(before, "missing", "completed");
    expect(after).toEqual(before);
  });
});

describe("addTask", () => {
  it("appends a new medium-priority card to the target column", () => {
    const before = tasksByColumnSeed();
    const after = addTask(before, "New DoE review", "review");

    expect(after).toHaveLength(before.length + 1);
    const added = after.at(-1);
    expect(added).toMatchObject({ title: "New DoE review", column: "review", priority: "medium" });
    expect(added?.assignee).toBeDefined();
  });

  it("trims whitespace from the title", () => {
    const before = tasksByColumnSeed();
    const after = addTask(before, "  Padded title  ", "todo");
    expect(after.at(-1)?.title).toBe("Padded title");
  });

  it("is a no-op for a blank title", () => {
    const before = tasksByColumnSeed();
    const after = addTask(before, "   ", "todo");
    expect(after).toEqual(before);
  });
});

function tasksByColumnSeed(): PlanTask[] {
  return [
    { id: "a", title: "Task A", column: "todo", priority: "medium" },
    { id: "b", title: "Task B", column: "draft", priority: "low" },
  ];
}
