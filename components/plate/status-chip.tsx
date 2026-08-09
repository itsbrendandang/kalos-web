import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WellStatus } from "@/lib/plate-data";

export const STATUS_LABEL: Record<WellStatus, string> = { pass: "Pass", warn: "Warn", fail: "Fail" };
const STATUS_TEXT: Record<WellStatus, string> = { pass: "text-green", warn: "text-amber", fail: "text-red" };
const STATUS_BORDER: Record<WellStatus, string> = {
  pass: "border-green/30",
  warn: "border-amber/30",
  fail: "border-red/30",
};
const STATUS_DOT: Record<WellStatus, string> = { pass: "bg-green", warn: "bg-amber", fail: "bg-red" };

/** Pass/Warn/Fail chip: colored square dot + (optional) count + text label -
 *  never color alone. `count` is omitted for a single-well status read (the
 *  plate/vessel detail views); qc-tiles.tsx passes it for the QC roll-up. */
export function StatusChip({ status, count }: { status: WellStatus; count?: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto gap-1.5 rounded-full bg-card px-2 py-0.5 text-[13px] font-bold",
        STATUS_TEXT[status],
        STATUS_BORDER[status],
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-[2px]", STATUS_DOT[status])} />
      {count != null ? <span className="tabular font-mono">{count}</span> : null} {STATUS_LABEL[status]}
    </Badge>
  );
}
