import type { DragEvent } from "react";
import { Calendar, Link2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOverdueActive, type Assignee, type PlanTask, type Priority } from "@/lib/mock/planning";

const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };

const PRIORITY_PILL: Record<Priority, string> = {
  high: "border-red/30 bg-red/10 text-red",
  medium: "border-chart-1/30 bg-chart-1/10 text-chart-1-ink",
  low: "border-border bg-card text-muted",
};

const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-red",
  medium: "bg-chart-1",
  low: "bg-muted",
};

/** Left stripe by priority, matching the RunCard convention (Operations
 *  surface) of flagging attention with a colored left border rather than
 *  color alone. Subtle: low priority gets no stripe at all. */
const PRIORITY_STRIPE: Record<Priority, string> = {
  high: "border-l-4 border-l-red/70",
  medium: "border-l-4 border-l-chart-1/70",
  low: "border-l border-l-border",
};

export function PriorityPill({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap",
        PRIORITY_PILL[priority],
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[priority])} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function OverduePill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red/30 bg-red/10 px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap text-red">
      <TriangleAlert className="size-3 shrink-0" />
      Overdue
    </span>
  );
}

export function DueChip({ label, overdue = false }: { label: string; overdue?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-semibold whitespace-nowrap",
        overdue ? "border-red/30 bg-red/10 text-red" : "border-border bg-card text-muted",
      )}
    >
      <Calendar className="size-3 shrink-0" />
      {label}
    </span>
  );
}

export function LinksChip({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap text-muted">
      <Link2 className="size-3 shrink-0" />
      {count}
    </span>
  );
}

export function AssigneeAvatar({ assignee }: { assignee: Assignee }) {
  return (
    <span
      title={assignee.name}
      className="grid size-6 shrink-0 place-items-center rounded-full bg-chart-1 text-[10px] font-bold text-chart-1-ink"
    >
      {assignee.initials}
    </span>
  );
}

/** One draggable task card: title, a chip row (priority / overdue / due /
 *  links - never color alone, every chip carries a text label or icon), and
 *  a footer with the assignee avatar plus an optional target/vessel tag.
 *  `draggable` + onDragStart/onDragEnd are native HTML5 DnD, wired up by the
 *  owning KanbanColumn - this component has no drag state of its own. */
export function TaskCard({
  task,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  task: PlanTask;
  isDragging?: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  const overdue = isOverdueActive(task);
  const tag = [task.target, task.vessel].filter(Boolean).join(" · ");

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-xl border border-border bg-card p-3 transition-colors motion-reduce:transition-none hover:border-accent-hover hover:shadow-sm active:cursor-grabbing",
        PRIORITY_STRIPE[task.priority],
        isDragging && "opacity-40",
      )}
    >
      <div className="text-[13.5px] font-semibold text-fg">{task.title}</div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityPill priority={task.priority} />
        {overdue ? <OverduePill /> : null}
        {task.dueLabel ? <DueChip label={task.dueLabel} overdue={overdue} /> : null}
        {task.links ? <LinksChip count={task.links} /> : null}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        {task.assignee ? <AssigneeAvatar assignee={task.assignee} /> : <span />}
        {tag ? <span className="truncate font-mono text-[10.5px] text-muted">{tag}</span> : null}
      </div>
    </div>
  );
}
