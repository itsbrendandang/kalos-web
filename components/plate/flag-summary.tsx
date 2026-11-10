import type { FlagCategory } from "@/lib/plate-data";

const FLAG_CATEGORIES: FlagCategory[] = ["Growth", "Spatial", "Control", "Environment"];
const FLAG_DOT_COLOR: Record<FlagCategory, string> = {
  Growth: "var(--accent)",
  Spatial: "var(--warn)",
  Control: "var(--fg-muted)",
  Environment: "var(--bad)",
};

interface FlagSummaryProps {
  flagCatCounts: Record<FlagCategory, number>;
  flaggedWellCount: number;
  totalWells: number;
}

/** Counts of wells carrying each flag category, for the side panel. */
export function FlagSummary({ flagCatCounts, flaggedWellCount, totalWells }: FlagSummaryProps) {
  return (
    <div>
      {FLAG_CATEGORIES.map((cat, i) => (
        <div
          key={cat}
          className={`flex items-center justify-between py-1.5 text-caption ${i < FLAG_CATEGORIES.length - 1 ? "border-b border-border" : ""}`}
        >
          <span className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full" style={{ background: FLAG_DOT_COLOR[cat] }} />
            {cat}
          </span>
          <span className="tabular-nums font-semibold">{flagCatCounts[cat]}</span>
        </div>
      ))}
      <div className="mt-1.5 text-caption text-fg-muted">
        {flaggedWellCount} / {totalWells} wells carry at least one flag.
      </div>
    </div>
  );
}
