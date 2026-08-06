"use client";

// The replay footer (DESIGN_SPEC.md section 3.4).
//
// The one thing that makes this footer worth building: its ticks are placed
// by REAL ELAPSED DATE, not by round index. A campaign that waited seven
// weeks for an assay shows a seven-week gap. Even spacing would erase the
// single most expensive fact about the campaign, so the uneven spacing is not
// a stylistic flourish - it is the content.
//
// Dragging reveals nodes in booking-date order. It NEVER relayouts the graph:
// the simulation is frozen (lib/workspace/graph/simulation.ts) and this only
// changes which already-positioned nodes are drawn.
import { useEffect, useMemo, useState } from "react";
import { projectDate, tickPositions, type PositionedTick } from "@/lib/workspace/graph/replay";
import { lineageTicks } from "@/lib/workspace/graph/build-lineage";
import type { LineageGraph } from "@/lib/workspace/map-types";

type RoundTick = PositionedTick & { round: number };

function formatTickDate(dateMs: number | null): string {
  // The em dash is the spec's literal placeholder for a round with no date.
  if (dateMs == null) return "—";
  return new Date(dateMs)
    .toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    .toUpperCase();
}

export function ReplayFooter({
  graph,
  openRound,
  onReveal,
}: {
  graph: LineageGraph;
  openRound: number;
  onReveal: (ids: Set<string> | null) => void;
}) {
  const [scrub, setScrub] = useState(100);

  const ticks: RoundTick[] = useMemo(() => {
    const raw = lineageTicks(graph, openRound);
    return tickPositions(raw).map((t, i) => ({ ...t, round: raw[i].round }));
  }, [graph, openRound]);

  const hubCount = graph.nodes.filter((n) => n.kind === "round-hub" || n.kind === "round-hub-open").length;
  const undatedLeading = hubCount - ticks.length;

  // Rounds with no tick at all (undated rounds that precede the first datable
  // one - in practice the original upload) are always visible: they cannot be
  // placed on a time axis, so hiding them behind one would be a lie.
  const untickedRounds = useMemo(() => {
    const ticked = new Set(ticks.map((t) => t.round));
    return new Set(graph.nodes.map((n) => n.round).filter((r) => !ticked.has(r)));
  }, [graph.nodes, ticks]);

  useEffect(() => {
    if (scrub >= 100) {
      onReveal(null);
      return;
    }
    const roundPct = new Map(ticks.map((t) => [t.round, t.pct] as const));
    const revealed = new Set<string>();
    for (const node of graph.nodes) {
      if (untickedRounds.has(node.round)) {
        revealed.add(node.id);
        continue;
      }
      // A run appears when it was BOOKED (created_at); a node with no booking
      // date of its own (a round hub) appears with its round.
      const pct = node.createdAtMs != null ? projectDate(node.createdAtMs, ticks) : (roundPct.get(node.round) ?? 100);
      if (pct <= scrub) revealed.add(node.id);
    }
    onReveal(revealed);
  }, [scrub, ticks, graph.nodes, untickedRounds, onReveal]);

  if (ticks.length === 0) {
    return (
      <div className="flex shrink-0 items-center gap-7 border-t border-border bg-card px-7 pb-5 pt-[18px]">
        <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">Replay</span>
        <p className="text-[11.5px] text-muted">
          No round in this campaign has a dated readout, so there is no real elapsed time to replay.
        </p>
      </div>
    );
  }

  const currentIndex = lastIndexAtOrBefore(ticks, scrub);

  return (
    <div className="flex shrink-0 items-center gap-7 border-t border-border bg-card px-7 pb-5 pt-[18px]">
      <div className="flex flex-col gap-1 pb-3">
        <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">Replay</span>
        {undatedLeading > 0 && (
          <span className="whitespace-nowrap text-[10px] text-muted">
            {undatedLeading} undated round{undatedLeading === 1 ? "" : "s"} omitted
          </span>
        )}
      </div>

      {/* The track scrolls rather than letting tick labels collide. Below the
          design's 1180px canvas width (a narrow window with the Ask panel
          open, say) five date-spaced ticks can land within a few pixels of
          each other; a scrolling track keeps every date and caption readable
          instead of stacking them on top of one another. */}
      <div className="min-w-0 flex-1 overflow-x-auto">
      <div className="relative mx-[46px] h-14 min-w-[420px]">
        <div className="absolute left-0 top-2 h-px w-full bg-border" />
        <div className="absolute left-0 top-2 h-px bg-action" style={{ width: `${scrub}%` }} />

        {ticks.map((tick, i) => {
          const isCurrent = i === currentIndex;
          const reached = tick.pct <= scrub;
          return (
            <div
              key={tick.id}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-[7px]"
              style={{ left: `${tick.pct}%` }}
            >
              {isCurrent ? (
                <span className="my-0 box-border size-[17px] rounded-full border-2 border-action bg-card" />
              ) : tick.dateMs == null ? (
                <span className="my-[3px] box-border size-[11px] rounded-full border border-dashed border-muted bg-card" />
              ) : (
                <span className={`my-[3px] size-[11px] rounded-full ${reached ? "bg-action" : "bg-border"}`} />
              )}
              <span className="whitespace-nowrap font-plex-mono text-[10px] text-muted">{formatTickDate(tick.dateMs)}</span>
              <span className={`whitespace-nowrap text-[10.5px] ${isCurrent ? "text-fg" : "text-muted"}`}>
                {tick.dateMs == null ? `round ${tick.round} proposed` : `round ${tick.round}`}
              </span>
            </div>
          );
        })}

        {/* The real control. A range input rather than a bespoke pointer
            handler so dragging, clicking the track, and full keyboard control
            (arrows, Home/End) all work, and so it is announced properly. */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={scrub}
          onChange={(e) => setScrub(Number(e.target.value))}
          aria-label="Replay position"
          aria-valuetext={`round ${ticks[Math.max(0, currentIndex)]?.round ?? 0}, ${formatTickDate(ticks[Math.max(0, currentIndex)]?.dateMs ?? null)}`}
          className="absolute -top-1 left-0 h-6 w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>
      </div>

      <p className="max-w-[190px] whitespace-normal pb-3 text-[11.5px] text-muted [text-wrap:pretty]">
        Drag to watch the graph grow. Gaps are real waiting time.
      </p>
    </div>
  );
}

function lastIndexAtOrBefore(ticks: readonly PositionedTick[], scrub: number): number {
  let index = 0;
  for (let i = 0; i < ticks.length; i++) if (ticks[i].pct <= scrub) index = i;
  return index;
}
