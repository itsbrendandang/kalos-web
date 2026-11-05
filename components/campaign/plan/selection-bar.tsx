"use client";

import { Button } from "@/components/ui/button";
import { COMPARE_MIN } from "@/components/campaign/plan-view";
import { formatNumber } from "@/lib/format";

/** The line above the table: how many are selected, and the batch-wide selection and comparison actions. */
export function SelectionBar({
  chosen,
  total,
  comparing,
  allSelected,
  announced,
  onToggleAll,
  onViewComparison,
}: {
  chosen: number;
  total: number;
  comparing: number;
  allSelected: boolean;
  /** The debounced selection sentence for screen readers. */
  announced: string;
  onToggleAll: () => void;
  onViewComparison: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-1">
      <p className="text-label text-fg tabular-nums">
        {formatNumber(chosen, "count")} of {formatNumber(total, "count")} selected to run
        {comparing ? <span className="text-fg-muted">, {formatNumber(comparing, "count")} in comparison</span> : null}
      </p>
      <span className="sr-only" aria-live="polite">
        {announced}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {comparing === 1 ? <span className="text-caption text-fg-muted">Select one more to compare</span> : null}
        {comparing >= COMPARE_MIN ? (
          <Button variant="outline" size="sm" onClick={onViewComparison}>
            View comparison
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onToggleAll}>
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
      </div>
    </div>
  );
}
