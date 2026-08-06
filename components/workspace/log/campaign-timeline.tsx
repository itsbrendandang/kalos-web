import { cn, fmt, num } from "@/lib/utils";
import { deltaBetween, formatDelta, formatShortDate, roundsToTarget } from "@/lib/workspace/log-logic";
import type { TimelineRound } from "@/lib/workspace/log-types";
import { NotInstrumentedNote } from "@/components/workspace/primitives/not-instrumented-note";
import { DOT, InlineNumeral, SectionLabel } from "./primitives";

type Column = {
  key: string;
  kind: "closed" | "open" | "target";
  /** The headline numeral. Null renders a spacer, so every column's label
   *  still sits on the same baseline - never a fabricated value. */
  value: string | null;
  chip: { text: string; tone: "gain" | "loss" | "muted" } | null;
  label: string;
  subtitle: string | null;
  bottom: string | null;
};

const CHIP_TONE = { gain: "text-green", loss: "text-red", muted: "text-muted" } as const;

/** "BO explore · 24 runs", or just whichever half the engine actually knows.
 *  The design says "wells" here; kalos counts runs, so this says runs. */
function methodLine(round: TimelineRound): string | null {
  const parts: string[] = [];
  if (round.method) parts.push(round.method);
  if (round.runCount != null) parts.push(`${round.runCount} run${round.runCount === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(DOT) : null;
}

/** Builds the timeline's columns: one per round, then the target column the
 *  design ends on. Kept as data (not JSX) so the rail geometry below is driven
 *  off the same column count and the same closed-round count, instead of two
 *  places agreeing by hand. */
function buildColumns(rounds: TimelineRound[], goal: number | null): Column[] {
  const columns: Column[] = [];
  let previousBest: number | null = null;

  for (const round of rounds) {
    if (round.status === "closed") {
      const delta = deltaBetween(round.bestValue, previousBest);
      columns.push({
        key: `round-${round.number}`,
        kind: "closed",
        value: round.bestValue != null ? fmt(round.bestValue, 1) : null,
        chip: delta != null && delta !== 0 ? { text: formatDelta(delta), tone: delta > 0 ? "gain" : "loss" } : null,
        label: round.label,
        subtitle: methodLine(round),
        bottom: round.dateISO ? formatShortDate(round.dateISO) : null,
      });
      if (round.bestValue != null) previousBest = round.bestValue;
      continue;
    }

    // The open round has no measured best. The only real number available is
    // the batch's own top prediction and its band, labelled as a prediction
    // and never presented as a result.
    const awaiting = round.awaitingCount;
    columns.push({
      key: `round-${round.number}`,
      kind: "open",
      value: round.predicted != null ? fmt(round.predicted, 1) : null,
      chip: round.predictedBand != null ? { text: `±${num(round.predictedBand, 1)}`, tone: "muted" } : null,
      label: `${round.label} · open`,
      subtitle:
        // `awaitingCount` counts runs the engine has STARTED and not yet
        // measured (`n_awaiting`), so what they are waiting on is a
        // measurement, not a decision.
        awaiting != null && awaiting > 0
          ? `${awaiting} run${awaiting === 1 ? "" : "s"} awaiting results`
          : methodLine(round),
      bottom: round.predicted != null ? "predicted, not measured" : null,
    });
  }

  const bestSoFar = previousBest;
  const gains: number[] = [];
  let running: number | null = null;
  for (const r of rounds) {
    if (r.status !== "closed" || r.bestValue == null) continue;
    const d = deltaBetween(r.bestValue, running);
    if (d != null) gains.push(d);
    running = r.bestValue;
  }
  const remainingRounds = roundsToTarget(bestSoFar, goal, gains);

  columns.push({
    key: "target",
    kind: "target",
    value: goal != null ? fmt(goal, 1) : null,
    chip: null,
    label: "Target",
    subtitle:
      goal == null
        ? "No target value is set for this campaign."
        : remainingRounds != null
          ? `${remainingRounds} more round${remainingRounds === 1 ? "" : "s"} at this rate`
          : null,
    bottom: null,
  });

  return columns;
}

/** Design spec 1.3.C. Five columns in the mock; here, one per round plus the
 *  target column, so a campaign on round 2 or round 9 both render correctly.
 *  Two absolutely-positioned rails sit behind the columns: a full hairline
 *  running from the first dot to the last, and a darker progress segment
 *  covering exactly the closed span. */
export function CampaignTimeline({
  rounds,
  goal,
  targetNoun,
}: {
  rounds: TimelineRound[];
  goal: number | null;
  targetNoun: string;
}) {
  const ordered = [...rounds].sort((a, b) => a.number - b.number);
  const columns = buildColumns(ordered, goal);
  const closedValues = ordered
    .filter((r) => r.status === "closed")
    .map((r) => r.bestValue)
    .filter((v): v is number => v != null);
  // The dark rail spans dot-to-dot across the closed rounds, so it covers one
  // fewer column-width than there are closed rounds (3 closed rounds = 2
  // hops), matching the design's `calc(2 * (100% / 5))`.
  const progressSteps = Math.max(0, ordered.filter((r) => r.status === "closed").length - 1);
  const n = columns.length;

  const gaps: string[] = [];
  if (ordered.some((r) => r.status === "closed" && r.dateISO == null)) gaps.push("read-out dates");
  if (ordered.some((r) => r.method == null)) gaps.push("how each round's recipes were chosen");
  if (ordered.some((r) => r.status === "closed" && r.runCount == null)) gaps.push("runs per round");

  return (
    <section className="border-t border-border pt-[22px]">
      <div className="mb-[22px] flex flex-wrap items-baseline gap-2.5">
        <SectionLabel>Campaign timeline</SectionLabel>
        <span className="text-[12px] text-muted">
          best {targetNoun} by round
          {closedValues.length > 0 && (
            <>
              {DOT}
              <InlineNumeral>{fmt(closedValues[0], 1)}</InlineNumeral>
              {closedValues.length > 1 && (
                <>
                  {" → "}
                  <InlineNumeral>{fmt(closedValues[closedValues.length - 1], 1)}</InlineNumeral>
                </>
              )}{" "}
              so far
            </>
          )}
          {goal != null && (
            <>
              , target <InlineNumeral>{fmt(goal, 1)}</InlineNumeral>
            </>
          )}
        </span>
      </div>

      {ordered.length === 0 ? (
        <NotInstrumentedNote>This campaign has no rounds on record yet, so there is no trajectory to plot.</NotInstrumentedNote>
      ) : (
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          <div
            className="pointer-events-none absolute top-[5px] left-[5px] h-px bg-border"
            style={{ right: `calc(100% / ${n} - 6px)` }}
            aria-hidden
          />
          {progressSteps > 0 && (
            <div
              className="pointer-events-none absolute top-[5px] left-[5px] h-px bg-action"
              style={{ width: `calc(${progressSteps} * (100% / ${n}))` }}
              aria-hidden
            />
          )}

          {columns.map((c, i) => (
            <div key={c.key} className={cn("relative flex flex-col gap-3", i < n - 1 && "pr-4")}>
              <span
                className={cn(
                  "box-border size-[11px] shrink-0 rounded-[6px]",
                  c.kind === "closed" && "bg-action",
                  c.kind === "open" && "border-2 border-action bg-card",
                  c.kind === "target" && "border border-dashed border-muted bg-card",
                )}
                aria-hidden
              />
              <div>
                {c.value != null ? (
                  <div
                    className={cn(
                      "font-plex-mono text-[17px] leading-none font-semibold tabular-nums",
                      c.kind === "target" ? "text-muted" : "text-fg",
                    )}
                  >
                    {c.value}
                    {c.chip && (
                      <span className={cn("ml-1.5 text-[11px] font-semibold", CHIP_TONE[c.chip.tone])}>
                        {c.chip.text}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="h-[17px]" aria-hidden />
                )}
                <div className={cn("mt-1 text-[12px] font-semibold", c.kind === "target" ? "text-muted" : "text-fg")}>
                  {c.label}
                </div>
                {c.subtitle && <div className="mt-px text-[11.5px] leading-[1.35] text-muted">{c.subtitle}</div>}
                {c.bottom && <div className="mt-[3px] font-plex-mono text-[10.5px] text-muted">{c.bottom}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {gaps.length > 0 && (
        <NotInstrumentedNote className="mt-4">
          Not recorded per round yet: {gaps.join(", ")}. Those lines stay blank rather than being guessed.
        </NotInstrumentedNote>
      )}
    </section>
  );
}
