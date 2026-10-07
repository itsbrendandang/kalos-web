// Mock data for the Planning board (app/planning/page.tsx). There is no live
// task/experiment-status source yet - this is deterministic STATIC data
// standing in for one, so the board has something real-looking to render.
// No `Math.random()` at module scope and no `Date.now()`/`new Date()` here:
// due dates are baked as pre-computed `dueLabel` strings (with `overdue`
// baked alongside them) rather than derived from the real clock at render
// time, so server- and client-rendered HTML always match (no hydration
// warnings) and the board doesn't silently drift as real time passes.
//
// Swap this module for a real client (mirroring lib/api.ts's client functions)
// once there's a real planning/task-tracking source.

/** Column definitions, in board order. `tone` drives the header dot color
 *  and (for the Table view) the section dot - "neutral" for the two
 *  not-yet-in-flight stages, "chart1" for the one in-flight/data-accent
 *  stage, and the semantic status colors for the two review/done stages. */
export const COLUMNS = [
  { key: "todo", label: "To Do", tone: "neutral" },
  { key: "draft", label: "Draft", tone: "neutral" },
  { key: "in_progress", label: "In Progress", tone: "chart1" },
  { key: "review", label: "Review Requested", tone: "amber" },
  { key: "completed", label: "Completed", tone: "good" },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];
export type ColumnTone = (typeof COLUMNS)[number]["tone"];

export type Priority = "low" | "medium" | "high";

export interface Assignee {
  initials: string;
  name: string;
}

export interface PlanTask {
  id: string;
  title: string;
  column: ColumnKey;
  priority: Priority;
  /** Pre-formatted due date, e.g. "Jun 26". Baked as a static string - never
   *  derived from `new Date()` at render time. */
  dueLabel?: string;
  /** Baked alongside `dueLabel`: whether this due date has already passed.
   *  Only rendered as "overdue" while the task isn't in `completed` - see
   *  `isOverdueActive`. */
  overdue?: boolean;
  links?: number;
  assignee?: Assignee;
  /** Bioprocess target this task supports, e.g. "mAb titer". */
  target?: string;
  vessel?: string;
}

/** The lab operators planning tasks are assigned to. */
export const ASSIGNEES: Assignee[] = [
  { initials: "JA", name: "J. Alvarez" },
  { initials: "RC", name: "R. Chen" },
  { initials: "MO", name: "M. Osei" },
];

const [JA, RC, MO] = ASSIGNEES;

export const PLAN_TASKS: PlanTask[] = [
  // --- To Do ---
  {
    id: "plan-1",
    title: "Design pH x Methanol DoE (16 runs)",
    column: "todo",
    priority: "high",
    dueLabel: "Jul 28",
    assignee: MO,
    target: "lipase_titer",
  },
  {
    id: "plan-2",
    title: "Book ambr time - week of Jul 21",
    column: "todo",
    priority: "medium",
    dueLabel: "Jul 19",
    assignee: RC,
  },
  {
    id: "plan-3",
    title: "Order fresh Pichia seed stock",
    column: "todo",
    priority: "low",
    assignee: JA,
  },
  {
    id: "plan-4",
    title: "Plan Q3 mAb-Titer campaign kickoff",
    column: "todo",
    priority: "medium",
    dueLabel: "Aug 1",
    links: 1,
    assignee: RC,
    target: "mAb titer",
  },
  {
    id: "plan-5",
    title: "Draft ambr-16 vessel calibration SOP",
    column: "todo",
    priority: "low",
    assignee: JA,
    vessel: "ambr-16",
  },

  // --- Draft (mostly empty by design, one card) ---
  {
    id: "plan-6",
    title: "Draft fed-batch protocol v3",
    column: "draft",
    priority: "medium",
    dueLabel: "Jun 26",
    overdue: true,
    links: 2,
    assignee: JA,
    target: "mAb titer",
  },

  // --- In Progress ---
  {
    id: "plan-7",
    title: "Run ambr-04 induction batch",
    column: "in_progress",
    priority: "high",
    dueLabel: "Jul 18",
    assignee: JA,
    target: "mAb titer",
    vessel: "ambr-04",
  },
  {
    id: "plan-8",
    title: "Analyze lipase_titer OOF drift",
    column: "in_progress",
    priority: "medium",
    dueLabel: "Jul 17",
    assignee: MO,
    target: "lipase_titer",
    vessel: "ambr-19",
  },
  {
    id: "plan-9",
    title: "CHO fed-batch scale-down trial - SF-250",
    column: "in_progress",
    priority: "high",
    dueLabel: "Jul 22",
    assignee: RC,
    target: "mAb titer",
    vessel: "SF-250#7",
  },
  {
    id: "plan-10",
    title: "Calibrate DO probes - ambr-11",
    column: "in_progress",
    priority: "low",
    assignee: RC,
    vessel: "ambr-11",
  },

  // --- Review Requested ---
  {
    id: "plan-11",
    title: "Review titer QC - CHO scale-down",
    column: "review",
    priority: "high",
    dueLabel: "Jul 15",
    overdue: true,
    links: 1,
    assignee: RC,
    target: "mAb titer",
  },
  {
    id: "plan-12",
    title: "Review DoE randomization script",
    column: "review",
    priority: "medium",
    dueLabel: "Jul 20",
    links: 3,
    assignee: MO,
  },
  {
    id: "plan-13",
    title: "Sign off induction OD600 setpoint change",
    column: "review",
    priority: "medium",
    dueLabel: "Jul 14",
    overdue: true,
    assignee: JA,
  },

  // --- Completed ---
  {
    id: "plan-14",
    title: "Baseline fed-batch protocol v2 signed off",
    column: "completed",
    priority: "low",
    dueLabel: "Jun 10",
    assignee: JA,
  },
  {
    id: "plan-15",
    title: "Q2 lipase screen retro",
    column: "completed",
    priority: "low",
    dueLabel: "Jun 30",
    assignee: MO,
  },
  {
    id: "plan-16",
    title: "ambr-02 run 14 QC passed",
    column: "completed",
    priority: "medium",
    assignee: RC,
    target: "mAb titer",
    vessel: "ambr-02",
  },
];

/** Groups tasks by column, preserving `COLUMNS` order and each task's
 *  relative order within its column. Every column key is always present
 *  (as `[]` if empty) so callers never need an `?? []` fallback. */
export function tasksByColumn(tasks: PlanTask[]): Record<ColumnKey, PlanTask[]> {
  const grouped = Object.fromEntries(COLUMNS.map((c) => [c.key, [] as PlanTask[]])) as Record<ColumnKey, PlanTask[]>;
  for (const task of tasks) {
    grouped[task.column].push(task);
  }
  return grouped;
}

/** A task only reads as "overdue" while it's still in flight - once it lands
 *  in Completed the due date no longer matters, so the red overdue pill and
 *  the toolbar's overdue count both stop counting it. */
export function isOverdueActive(task: PlanTask): boolean {
  return Boolean(task.overdue) && task.column !== "completed";
}
