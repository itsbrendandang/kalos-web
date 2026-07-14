import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExperimentStatus } from "@/lib/experiments";

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  PROCESSING: "Processing",
  DONE: "Done",
  FAILED: "Failed",
};

const STATUS_TEXT: Record<ExperimentStatus, string> = {
  DRAFT: "text-muted",
  READY: "text-accent-hover",
  PROCESSING: "text-amber",
  DONE: "text-green",
  FAILED: "text-red",
};

const STATUS_DOT: Record<ExperimentStatus, string> = {
  DRAFT: "bg-muted",
  READY: "bg-accent",
  PROCESSING: "bg-amber",
  DONE: "bg-green",
  FAILED: "bg-red",
};

/** Status chip for the Experiments surface: colored dot/spinner + text label
 *  (never color alone), matching the plate surface's Pass/Warn/Fail pattern. */
export function ExperimentStatusChip({ status }: { status: ExperimentStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-semibold", STATUS_TEXT[status])}>
      {status === "PROCESSING" ? (
        <Loader2 className="size-3 shrink-0 animate-spin" />
      ) : (
        <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />
      )}
      {EXPERIMENT_STATUS_LABEL[status]}
    </span>
  );
}
