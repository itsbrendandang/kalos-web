import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExperimentStatus } from "@/lib/experiments";

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  PROCESSING: "Processing",
  DONE: "Done",
  FAILED: "Failed",
};

/** Border/background/text per status - the same "colored soft pill" idiom as
 *  DriftChip (components/operations/drift-chip.tsx) and PriorityPill
 *  (components/planning/task-card.tsx), so status chips read consistently
 *  across the hub. */
const STATUS_STYLE: Record<ExperimentStatus, string> = {
  DRAFT: "border-border bg-card text-muted",
  READY: "border-blue-border bg-blue-tint text-accent-text",
  PROCESSING: "border-amber/30 bg-amber-soft text-amber",
  DONE: "border-green/30 bg-green-soft text-green",
  FAILED: "border-red/30 bg-red/10 text-red",
};

const STATUS_DOT: Record<ExperimentStatus, string> = {
  DRAFT: "bg-muted",
  READY: "bg-accent",
  PROCESSING: "bg-amber",
  DONE: "bg-green",
  FAILED: "bg-red",
};

/** Status chip for the Experiments surface, on the shadcn `badge` primitive -
 *  colored dot/spinner + text label (never color alone), matching the
 *  DriftChip/PriorityPill pill convention used elsewhere in the hub. */
export function ExperimentStatusChip({ status }: { status: ExperimentStatus }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 text-[11px] font-semibold", STATUS_STYLE[status])}>
      {status === "PROCESSING" ? (
        <Loader2 className="size-3 shrink-0 animate-spin" />
      ) : (
        <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status])} />
      )}
      {EXPERIMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
