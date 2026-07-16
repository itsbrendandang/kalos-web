import { cn } from "@/lib/utils";
import { COLUMNS, isOverdueActive, type ColumnKey, type ColumnTone, type PlanTask } from "@/lib/mock/planning";
import { AssigneeAvatar, DueChip, PriorityPill } from "@/components/planning/task-card";

const TONE_DOT: Record<ColumnTone, string> = {
  neutral: "bg-muted",
  chart1: "bg-chart-1",
  amber: "bg-amber",
  good: "bg-green",
};

/** Table view: the same tasks as the Kanban board, grouped into a section
 *  per column instead of a drag-and-drop column. Read-only - no reordering
 *  here, matching the reference's table view. */
export function PlanningTableView({ tasksByCol }: { tasksByCol: Record<ColumnKey, PlanTask[]> }) {
  return (
    <div className="flex flex-col gap-6">
      {COLUMNS.map((col) => (
        <div key={col.key}>
          <div className="mb-2 flex items-center gap-2">
            <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[col.tone])} />
            <h3 className="text-[12.5px] font-semibold text-fg">{col.label}</h3>
            <span className="font-mono text-[11px] text-muted">{tasksByCol[col.key].length}</span>
          </div>
          {tasksByCol[col.key].length === 0 ? (
            <p className="py-2 text-[12px] text-muted">No items</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-y-1.5 text-[13px]">
                <thead>
                  <tr className="text-[10px] text-muted uppercase">
                    <th className="px-3 py-1.5 text-left">Title</th>
                    <th className="px-3 py-1.5 text-left">Priority</th>
                    <th className="px-3 py-1.5 text-left">Due</th>
                    <th className="px-3 py-1.5 text-left">Assignee</th>
                  </tr>
                </thead>
                <tbody>
                  {tasksByCol[col.key].map((task) => (
                    <tr key={task.id} className="group">
                      <td className="rounded-l-xl border-y border-l border-border/70 bg-card px-3 py-2.5 font-semibold text-fg group-hover:bg-blue-soft">
                        {task.title}
                      </td>
                      <td className="border-y border-border/70 bg-card px-3 py-2.5 group-hover:bg-blue-soft">
                        <PriorityPill priority={task.priority} />
                      </td>
                      <td className="border-y border-border/70 bg-card px-3 py-2.5 group-hover:bg-blue-soft">
                        {task.dueLabel ? <DueChip label={task.dueLabel} overdue={isOverdueActive(task)} /> : <span className="text-muted">-</span>}
                      </td>
                      <td className="rounded-r-xl border-y border-r border-border/70 bg-card px-3 py-2.5 group-hover:bg-blue-soft">
                        {task.assignee ? (
                          <div className="flex items-center gap-2">
                            <AssigneeAvatar assignee={task.assignee} />
                            <span className="text-muted">{task.assignee.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
