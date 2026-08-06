import { fmt, num } from "@/lib/utils";
import type { WorkspaceLogStats } from "@/lib/workspace/log-types";
import { NotInstrumentedNote } from "@/components/workspace/primitives/not-instrumented-note";
import { SectionLabel } from "./primitives";

type Cell = {
  label: string;
  value: string | null;
  /** Muted trailing text after the numeral ("g/L", "/ 384", "runs"). */
  suffix?: string;
  /** Shown in place of the numeral when the engine cannot supply one. */
  missing?: string;
};

/** Design spec 1.3.B, top piece. Rounded on its TOP corners only - the plane
 *  below (StatPlane) is rounded on its bottom corners only and cancels the
 *  40px flex gap between them, so the two siblings read as one card with two
 *  rounding contexts. They are deliberately not one element.
 *
 *  No top margin of its own: the mock carried `margin-top:40px` here ON TOP
 *  of the content column's own `gap:40px`, which stacks to 80px (~90px once
 *  the hero paragraph's half-leading is counted) between the hero and this
 *  strip - double the 40px rhythm section 1.1 states for every top-level
 *  block. The gap alone is the rhythm; StatPlane's -40px still cancels that
 *  same gap below, so the two halves stay flush. */
export function StatStrip({
  stats,
  awaitingRuns,
}: {
  stats: WorkspaceLogStats;
  /** Runs proposed for the open round and not yet measured. The design's
   *  fourth cell is "Wells spent 192 / 384"; kalos has no well, plate, or
   *  capacity-budget concept anywhere in its data model, so that number
   *  cannot be sourced or estimated. This is the closest quantity the engine
   *  really tracks about committed-but-unfinished work. */
  awaitingRuns: number;
}) {
  const unit = stats.targetUnit;
  const cells: Cell[] = [
    {
      label: "Best so far",
      value: stats.bestSoFar != null ? fmt(stats.bestSoFar, 1) : null,
      suffix: unit || undefined,
      missing: "No measured result yet.",
    },
    {
      label: "Band",
      value: stats.band != null ? `± ${num(stats.band, 2)}` : null,
      missing: "Not scored on this fit.",
    },
    {
      label: "Runs / inputs",
      value:
        stats.runsMeasured != null && stats.runsInputs != null
          ? `${stats.runsMeasured} / ${stats.runsInputs}`
          : null,
      missing: "Not reported.",
    },
    {
      label: "Awaiting results",
      value: String(awaitingRuns),
      suffix: awaitingRuns === 1 ? "run" : "runs",
    },
  ];

  return (
    <div className="flex flex-wrap gap-10 rounded-t-[16px] bg-card px-7">
      {cells.map((c) => (
        <div key={c.label} className="min-w-[104px] flex-1 pt-6 pb-[22px]">
          <SectionLabel>{c.label}</SectionLabel>
          {c.value != null ? (
            <div className="mt-1.5 font-plex-mono text-[22px] leading-none font-semibold tabular-nums text-fg">
              {c.value}
              {c.suffix && <span className="ml-1 text-[12px] font-normal text-muted">{c.suffix}</span>}
            </div>
          ) : (
            <NotInstrumentedNote className="mt-1.5">{c.missing}</NotInstrumentedNote>
          )}
        </div>
      ))}
    </div>
  );
}

/** The strip's geometry with a single honest sentence in place of the four
 *  cells, for when the analysis behind them is missing or unreadable. Keeps
 *  the card's top rounding so the surface never loses its shape just because
 *  one read failed. */
export function StatStripMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-t-[16px] bg-card px-7 pt-6 pb-[22px]">
      <NotInstrumentedNote>{children}</NotInstrumentedNote>
    </div>
  );
}

/** Design spec 1.3.B, bottom piece: the plane that carries the timeline and
 *  the activity strip. The negative top margin cancels the content column's
 *  own 40px flex gap so this half sits flush against the strip above it, with
 *  no seam between the two rounding contexts - see StatStrip's note. */
export function StatPlane({ children }: { children: React.ReactNode }) {
  return <div className="-mt-10 rounded-b-[16px] bg-card px-7 pt-6 pb-7">{children}</div>;
}
