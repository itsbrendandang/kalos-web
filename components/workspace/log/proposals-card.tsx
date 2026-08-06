"use client";

import { useState } from "react";
import { cn, fmt, num } from "@/lib/utils";
import { spellCount } from "@/lib/workspace/log-copy";
import {
  beatsBest,
  columnLabel,
  formatRecipeValue,
  modeSplit,
  recipeColumns,
  recipeDecimals,
} from "@/lib/workspace/proposal-logic";
import type { Proposal, Run } from "@/lib/workspace/types";
import { NotInstrumentedNote } from "@/components/workspace/primitives/not-instrumented-note";
import { DOT } from "./primitives";

/** How many rows are visible before the "show the rest" disclosure. */
const VISIBLE_ROWS = 3;

/** Design spec 1.3.F. The open round's batch: an optional warning banner, the
 *  ranked proposal table, and the approve bar. Every column except the first
 *  is derived from the batch the engine actually returned - the design's
 *  hard-coded "Glucose / Feed start" pair is only correct for the campaign in
 *  the mock. */
export function ProposalsCard({
  proposals,
  excludedRuns,
  roundNumber,
  bestSoFar,
  targetUnit,
}: {
  proposals: Proposal[];
  /** Runs excluded from the fit for cause. The engine does not model run
   *  failure yet (lib/workspace/types.ts), so this is empty in practice and
   *  the banner stays unrendered rather than showing the design's illustrative
   *  "four wells breached the pH window" claim about runs nobody flagged. */
  excludedRuns: Run[];
  roundNumber: number | null;
  bestSoFar: number | null;
  targetUnit: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const { keys, hidden } = recipeColumns(proposals);
  const decimals = new Map(keys.map((key) => [key, recipeDecimals(proposals, key)] as const));
  const split = modeSplit(proposals);
  const visible = expanded ? proposals : proposals.slice(0, VISIBLE_ROWS);
  const remaining = proposals.length - visible.length;

  // 92px per recipe column, not the mock's 84px: the mock's two headers
  // ("Glucose", "Feed start") are short, while a real engine feature key
  // ("feed_start_day") needs the extra 8px to avoid truncating at 10px/0.09em.
  const gridTemplateColumns = `26px minmax(0,1fr) ${keys.map(() => "92px").join(" ")} 150px 78px`;

  return (
    <div className="overflow-hidden rounded-[16px] bg-card">
      {excludedRuns.length > 0 && (
        <div className="flex items-center gap-3.5 bg-amber-soft px-7 py-5">
          <span className="size-2 shrink-0 rounded-[4px] bg-amber" aria-hidden />
          <p className="flex-1 font-serif text-[15px] leading-[1.5] text-amber">
            <span className="font-semibold">Needs your call.</span> {spellCount(excludedRuns.length)} run
            {excludedRuns.length === 1 ? "" : "s"} in this campaign are excluded from the fit, not deleted.
          </p>
          <button
            type="button"
            className="rounded-[10px] bg-amber px-[15px] py-2 text-[12px] font-semibold whitespace-nowrap text-card transition-opacity hover:opacity-90"
          >
            Review the {spellCount(excludedRuns.length)}
          </button>
        </div>
      )}

      <div className="p-7">
        <div className="mb-[22px]">
          <h3 className="font-serif text-[22px] font-semibold tracking-[-0.01em] text-fg">
            {proposals.length > 0 ? `Run these ${spellCount(proposals.length)} next` : "No batch is waiting on you"}
          </h3>
          {proposals.length > 0 ? (
            <p className="mt-1.5 text-[13px] text-muted">
              {proposals.length} run{proposals.length === 1 ? "" : "s"}
              {DOT}
              {split.exploit} exploit, {split.explore} explore{DOT}ranked by the acquisition function
            </p>
          ) : (
            <p className="mt-1.5 text-[13px] text-muted">
              The engine has no proposals awaiting a decision for this campaign right now.
            </p>
          )}
        </div>

        {proposals.length > 0 && (
          <>
            <div
              className="grid gap-[14px] border-b border-border pb-3 text-[10px] font-semibold tracking-[0.09em] text-muted uppercase"
              style={{ gridTemplateColumns }}
            >
              <span>#</span>
              <span>Change from best</span>
              {keys.map((key) => (
                <span key={key} className="truncate" title={key}>
                  {columnLabel(key)}
                </span>
              ))}
              <span>Predicted</span>
              <span>Mode</span>
            </div>

            {visible.map((p) => {
              const up = beatsBest(p.run.predicted, bestSoFar);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "grid items-center gap-[14px] border-b border-border py-[15px]",
                    p.run.mode === "explore" && "bg-blue-soft",
                  )}
                  style={{ gridTemplateColumns }}
                >
                  <span className="font-plex-mono text-[12px] tabular-nums text-muted">{p.rank}</span>
                  <span className="font-serif text-[14.5px] text-fg">
                    {p.summary ?? <span className="text-[13px] text-muted">No summary recorded</span>}
                  </span>
                  {keys.map((key) => (
                    <span key={key} className="font-plex-mono text-[12px] tabular-nums text-fg">
                      {p.run.recipe[key] != null
                        ? formatRecipeValue(p.run.recipe[key], decimals.get(key) ?? 2)
                        : ""}
                    </span>
                  ))}
                  <span className="font-plex-mono text-[12px] tabular-nums text-fg">
                    {p.run.predicted != null ? fmt(p.run.predicted, 1) : "not predicted"}
                    {p.run.predictedBand != null && (
                      <span className="ml-1 text-muted">±{num(p.run.predictedBand, 1)}</span>
                    )}
                    {up === true && (
                      <span className="ml-1 text-green" title={`Above the measured best so far`}>
                        ↑
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[11.5px]",
                      p.run.mode === "explore" ? "font-semibold text-fg" : "font-normal text-muted",
                    )}
                  >
                    {p.run.mode}
                  </span>
                </div>
              );
            })}

            {(remaining > 0 || expanded) && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full border-b border-border py-[17px] text-center text-[12.5px] text-muted transition-colors hover:text-fg"
              >
                {expanded
                  ? `Show fewer rows`
                  : `Show rows ${visible.length + 1}–${proposals.length}`}
              </button>
            )}

            {hidden.length > 0 && (
              <NotInstrumentedNote className="mt-3">
                This batch also varies {hidden.join(", ")}. Those columns do not fit the table; open a proposal to see
                its full recipe.
              </NotInstrumentedNote>
            )}

            <ApproveBar
              count={proposals.length}
              roundNumber={roundNumber}
              bestSoFar={bestSoFar}
              targetUnit={targetUnit}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Design spec 1.3.F3. The design's message books wells against a named SOP
 *  and notifies a named colleague; kalos models neither wells, nor SOPs, nor
 *  people, so the sentence states what approving this batch actually does in
 *  the engine: it books runs into the open round. */
function ApproveBar({
  count,
  roundNumber,
  bestSoFar,
  targetUnit,
}: {
  count: number;
  roundNumber: number | null;
  bestSoFar: number | null;
  targetUnit: string;
}) {
  const unit = targetUnit ? ` ${targetUnit}` : "";
  return (
    <div className="mt-7 flex flex-wrap items-center gap-3.5 rounded-[12px] bg-blue-soft px-6 py-[22px]">
      <span className="grid size-[26px] shrink-0 place-items-center rounded-[13px] border border-blue-border bg-blue-tint font-plex-mono text-[10px] font-semibold text-fg">
        AO
      </span>
      <p className="min-w-[24ch] flex-1 text-[12px] leading-[1.45] text-muted">
        Books {count} run{count === 1 ? "" : "s"}
        {roundNumber != null && <> into round {roundNumber}</>} and closes the batch.
        {bestSoFar != null && (
          <>
            {" "}
            The measured best stays{" "}
            <span className="font-plex-mono tabular-nums text-fg">
              {fmt(bestSoFar, 1)}
              {unit}
            </span>{" "}
            until a result comes back.
          </>
        )}
      </p>
      <button
        type="button"
        className="rounded-[10px] border border-border bg-card px-[13px] py-[7px] text-[12px] font-semibold whitespace-nowrap text-fg transition-colors hover:bg-blue-tint"
      >
        Ask
      </button>
      <button
        type="button"
        className="rounded-[10px] border border-border bg-card px-[13px] py-[7px] text-[12px] font-semibold whitespace-nowrap text-fg transition-colors hover:bg-blue-tint"
      >
        Edit batch
      </button>
      <button
        type="button"
        className="rounded-[10px] bg-action px-[15px] py-[7px] text-[12px] font-semibold whitespace-nowrap text-white transition-opacity hover:opacity-90"
      >
        Approve {spellCount(count)}
      </button>
    </div>
  );
}
