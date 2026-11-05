"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Verdict } from "@/components/kit/verdict";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/honest-state";
import { useEngineWrites } from "@/hooks/use-engine";
import { proposalRecipe } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { COMPARE_MAX, COMPARE_MIN, toggleCompare, type PlanAnalysis, type UploadRejection } from "@/components/campaign/plan-view";
import { ApproveDialog } from "@/components/campaign/plan/approve-dialog";
import { BatchHeader } from "@/components/campaign/plan/batch-header";
import { BeforeStart } from "@/components/campaign/plan/before-start";
import { KeepPreviousCallout } from "@/components/campaign/plan/states";
import { PlanFrame } from "@/components/campaign/plan/header";
import { RecommendationCards } from "@/components/campaign/plan/recommendation-cards";
import { RecommendationsTable } from "@/components/campaign/plan/recommendations";
import { SecondaryPanels, type PlanTab } from "@/components/campaign/plan/secondary-panels";
import { SelectionBar } from "@/components/campaign/plan/selection-bar";
import { BatchSummary } from "@/components/campaign/plan/summary";
import { useBatchModel } from "@/components/campaign/plan/use-batch-model";
import { MarkLegend } from "@/components/campaign/plan/marks";
import type { PlanRow, RowState } from "@/components/campaign/plan/types";

/**
 * One round's proposed batch: what to run next, in a table; the one action,
 * Approve batch; and the detail (comparison, response surface, method) under
 * secondary tabs. Nothing starts without the explicit approval step.
 */
export function Batch({
  d,
  round,
  rejection,
  onKeepPrevious,
}: {
  d: PlanAnalysis;
  round: number;
  rejection: UploadRejection | null;
  onKeepPrevious: () => void;
}) {
  const { startRuns } = useEngineWrites();
  const m = useBatchModel(d);
  const { rows, ctx } = m;

  // Unticked proposals, by the engine's index: empty means every proposal is selected to run.
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [compare, setCompare] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [approving, setApproving] = useState(false);
  const [tab, setTab] = useState<PlanTab>("compare");
  const panelsRef = useRef<HTMLElement>(null);
  // Set once the engine confirmed a start. If the campaign refresh after it failed, the page would still show
  // this batch; keeping Approve disabled here prevents starting the same runs twice.
  const [startedHere, setStartedHere] = useState(false);

  const chosen = rows.filter((r) => !skipped.has(r.item.index));
  const compared = compare.map((rank) => rows.find((r) => r.item.rank === rank)).filter((r): r is PlanRow => r != null);
  const blocked = rejection != null;
  const canStart = chosen.length > 0 && !blocked && !startedHere;
  const startHint = startedHere
    ? "Runs started; check Run before approving more"
    : blocked
      ? "Choose an option in the upload note first"
      : chosen.length === 0
        ? "Select at least one proposal to run"
        : null;
  // Announce selection changes once the user pauses, not on every tick.
  const selectionText = `${formatNumber(chosen.length, "count")} of ${formatNumber(rows.length, "count")} selected to run${compare.length ? `, ${formatNumber(compare.length, "count")} in comparison` : ""}`;
  const announced = useDebounced(selectionText, 600);

  const toggleSkip = (key: number) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleExpand = (key: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAll = () => setSkipped(chosen.length === rows.length ? new Set(rows.map((r) => r.item.index)) : new Set());

  const state = (row: PlanRow): RowState => ({
    included: !skipped.has(row.item.index),
    onInclude: () => toggleSkip(row.item.index),
    compared: compare.includes(row.item.rank),
    compareDisabled: compare.length >= COMPARE_MAX,
    onCompare: () => setCompare((c) => toggleCompare(c, row.item.rank)),
    expanded: expanded.has(row.item.rank),
    onExpand: () => toggleExpand(row.item.rank),
  });

  async function start(): Promise<boolean> {
    try {
      await startRuns(chosen.map(({ item: { proposal: p } }) => ({ recipe: proposalRecipe(p, d.proposal_features), pred: p.pred, std: p.std, mode: p.mode, reason: p.reason })));
      setStartedHere(true);
      return true;
    } catch {
      return false;
    }
  }

  function viewComparison() {
    setTab("compare");
    panelsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const approve = (
    <Button onClick={() => setApproving(true)} disabled={!canStart}>
      Approve batch
    </Button>
  );

  return (
    <PlanFrame>
      <BatchHeader dataset={d.dataset} round={round} target={d.target} m={m} approve={approve} hint={startHint} />

      {rejection ? <KeepPreviousCallout rejection={rejection} dataset={d.dataset} onKeep={onKeepPrevious} /> : null}

      {startedHere ? (
        <Verdict tone="good">
          Runs started. If this page has not switched to the runs in flight, check{" "}
          <Link href="/campaign/run" className="text-accent underline underline-offset-4">
            Run
          </Link>{" "}
          before approving anything again.
        </Verdict>
      ) : null}

      <BatchSummary d={d} m={m} />

      <BeforeStart m={m} notes={m.dataNotes} diversity={m.diversity} />

      <section aria-labelledby="plan-batch-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="plan-batch-title" className="text-heading text-fg">
            Proposed experiments
          </h2>
          <p className="max-w-[72ch] text-body text-fg-muted">
            Model-generated proposals for {m.name}, sorted by predicted value. Untick any you will not run. Compare {COMPARE_MIN} to {COMPARE_MAX} to see them side by side.
          </p>
          <MarkLegend className="mt-1" />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="The engine proposed no experiments"
            description={m.diversity?.short ? `${m.diversity.headline} ${m.spread.join(" ")}` : "This analysis returned an empty batch."}
          />
        ) : (
          <>
            <SelectionBar
              chosen={chosen.length}
              total={rows.length}
              comparing={compared.length}
              allSelected={chosen.length === rows.length}
              announced={announced}
              onToggleAll={toggleAll}
              onViewComparison={viewComparison}
            />
            <div className="hidden @4xl:block">
              <RecommendationsTable rows={rows} ctx={ctx} state={state} />
            </div>
            <div className="@4xl:hidden">
              <RecommendationCards rows={rows} ctx={ctx} state={state} />
            </div>
          </>
        )}
      </section>

      <SecondaryPanels
        d={d}
        m={m}
        tab={tab}
        onTabChange={setTab}
        compared={compared}
        onRemove={(rank) => setCompare((c) => c.filter((r) => r !== rank))}
        onClear={() => setCompare([])}
        rootRef={panelsRef}
      />

      <p className="max-w-[72ch] text-caption text-fg-muted">
        Predicted values are the model&apos;s estimates, not measurements. How well the model ranked held-out runs is on{" "}
        <Link href="/campaign/learn" className="text-accent underline underline-offset-4">
          Learn
        </Link>
        .
      </p>

      {rows.length > 0 ? (
        <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-bg px-4 py-3 sm:hidden">
          <span className="text-label text-fg tabular-nums">
            {formatNumber(chosen.length, "count")} of {formatNumber(rows.length, "count")} selected
            {startHint ? <span className="block text-caption text-fg-muted">{startHint}</span> : null}
          </span>
          {approve}
        </div>
      ) : null}

      <ApproveDialog open={approving} onOpenChange={setApproving} rows={chosen} ctx={ctx} d={d} round={round} onStart={start} />
    </PlanFrame>
  );
}

/** `value`, but only after it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

