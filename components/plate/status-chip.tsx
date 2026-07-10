import { cn } from "@/lib/utils";
import type { WellStatus } from "@/lib/plate-data";

export const STATUS_LABEL: Record<WellStatus, string> = { pass: "Pass", warn: "Warn", fail: "Fail" };
const STATUS_TEXT: Record<WellStatus, string> = { pass: "text-green", warn: "text-amber", fail: "text-red" };
const STATUS_DOT: Record<WellStatus, string> = { pass: "bg-green", warn: "bg-amber", fail: "bg-red" };

/** Pass/Warn/Fail chip: colored dot + count + text label (never color alone). */
export function StatusChip({ status, count }: { status: WellStatus; count: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] font-bold", STATUS_TEXT[status])}>
      <span className={cn("size-2 shrink-0 rounded-[2px]", STATUS_DOT[status])} />
      <span className="tabular font-mono">{count}</span> {STATUS_LABEL[status]}
    </span>
  );
}
