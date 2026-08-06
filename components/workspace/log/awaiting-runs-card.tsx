"use client";

import { useState } from "react";
import { cn, fmt, num } from "@/lib/utils";
import { spellCount } from "@/lib/workspace/log-copy";
import { columnLabel, formatRecipeValue, recipeColumns, recipeDecimals } from "@/lib/workspace/proposal-logic";
import type { MutationResult } from "@/lib/workspace/adapter";
import type { Run } from "@/lib/workspace/types";
import { NotInstrumentedNote } from "@/components/workspace/primitives/not-instrumented-note";
import { DOT } from "./primitives";
import { MutationError } from "./mutation-error";

/**
 * The other half of the loop, and the half the design spec never drew: the
 * recipes that have already been booked into the open round and are sitting in
 * the lab. One row per run, each either taking a measured value or already
 * holding one, plus the bar that folds the measured ones back into the model.
 *
 * Deliberately shaped like the proposals card above it (same plane, same
 * 16px card, same mono tabular grid, same eyebrow headers) rather than as a
 * new visual idea: it is the same batch, one step further along, and reading
 * it should feel like continuing down the page rather than arriving somewhere
 * else.
 */
export function AwaitingRunsCard({
  awaitingRuns,
  measuredRuns,
  roundNumber,
  targetUnit,
  onLogResult,
  onCloseLoop,
  canWrite,
}: {
  awaitingRuns: Run[];
  measuredRuns: Run[];
  roundNumber: number | null;
  targetUnit: string;
  onLogResult: (runId: string, value: number) => Promise<MutationResult>;
  onCloseLoop: () => Promise<MutationResult>;
  /** False for a demo campaign: there is no engine behind it to write to. */
  canWrite: boolean;
}) {
  const runs = [...awaitingRuns, ...measuredRuns];
  const { keys, hidden } = recipeColumns(runs);
  const decimals = new Map(keys.map((key) => [key, recipeDecimals(runs, key)] as const));

  if (runs.length === 0) return null;

  const unit = targetUnit ? ` ${targetUnit}` : "";
  // Recipe columns, then the prediction, then the measured column. The last
  // one takes the slack (`minmax(0,1fr)`, not a fixed minimum): with the Ask
  // panel open at 1280 the card is only ~628px wide, and a hard minimum here
  // would push the "Log result" button past the card's own padding.
  const gridTemplateColumns = `26px ${keys.map(() => "92px").join(" ")} 104px minmax(0,1fr)`;

  return (
    <div className="overflow-hidden rounded-[16px] bg-card">
      <div className="p-7">
        <div className="mb-[22px]">
          <h3 className="font-serif text-[22px] font-semibold tracking-[-0.01em] text-fg">
            {awaitingRuns.length > 0
              ? `${spellCount(awaitingRuns.length)} run${awaitingRuns.length === 1 ? "" : "s"} out with the lab`
              : `${spellCount(measuredRuns.length)} result${measuredRuns.length === 1 ? "" : "s"} ready to fold in`}
          </h3>
          <p className="mt-1.5 text-[13px] text-muted">
            {roundNumber != null && (
              <>
                Booked into round {roundNumber}
                {DOT}
              </>
            )}
            {measuredRuns.length} measured, {awaitingRuns.length} still awaiting
            {DOT}a measured value only moves the best once it is folded in
          </p>
        </div>

        <div
          className="grid gap-[14px] border-b border-border pb-3 text-[10px] font-semibold tracking-[0.09em] text-muted uppercase"
          style={{ gridTemplateColumns }}
        >
          <span>#</span>
          {keys.map((key) => (
            <span key={key} className="truncate" title={key}>
              {columnLabel(key)}
            </span>
          ))}
          <span>Predicted</span>
          <span>Measured</span>
        </div>

        {runs.map((run, i) => (
          <div
            key={run.id}
            className="grid items-center gap-[14px] border-b border-border py-[13px]"
            style={{ gridTemplateColumns }}
          >
            <span className="font-plex-mono text-[12px] tabular-nums text-muted">{i + 1}</span>
            {keys.map((key) => (
              <span key={key} className="font-plex-mono text-[12px] tabular-nums text-fg">
                {run.recipe[key] != null ? formatRecipeValue(run.recipe[key], decimals.get(key) ?? 2) : ""}
              </span>
            ))}
            <span className="font-plex-mono text-[12px] tabular-nums text-fg">
              {run.predicted != null ? fmt(run.predicted, 1) : <span className="text-muted">not predicted</span>}
              {run.predictedBand != null && <span className="ml-1 text-muted">±{num(run.predictedBand, 1)}</span>}
            </span>
            {run.status === "measured" ? (
              <span className="font-plex-mono text-[12px] tabular-nums text-fg">
                {run.measuredValue != null ? (
                  <>
                    {fmt(run.measuredValue, 2)}
                    {unit && <span className="ml-1 font-sans text-[11px] text-muted">{targetUnit}</span>}
                  </>
                ) : (
                  <span className="font-sans text-[11.5px] text-muted">measured, value not reported</span>
                )}
              </span>
            ) : (
              <LogResultField runId={run.id} targetUnit={targetUnit} onLogResult={onLogResult} canWrite={canWrite} />
            )}
          </div>
        ))}

        {hidden.length > 0 && (
          <NotInstrumentedNote className="mt-3">
            These runs also vary {hidden.join(", ")}. Those columns do not fit the table.
          </NotInstrumentedNote>
        )}

        <CloseLoopBar
          measuredCount={measuredRuns.length}
          awaitingCount={awaitingRuns.length}
          roundNumber={roundNumber}
          onCloseLoop={onCloseLoop}
          canWrite={canWrite}
        />

        {!canWrite && (
          <NotInstrumentedNote className="mt-3">
            This campaign is demo data, so there is no engine behind it to record a result against.
          </NotInstrumentedNote>
        )}
      </div>
    </div>
  );
}

/** One awaiting run's measured-value control. Local state is the typed text
 *  only: nothing here marks the run measured on its own, the value comes back
 *  from the engine on the next read. */
function LogResultField({
  runId,
  targetUnit,
  onLogResult,
  canWrite,
}: {
  runId: string;
  targetUnit: string;
  onLogResult: (runId: string, value: number) => Promise<MutationResult>;
  canWrite: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const parsed = Number(trimmed);
  // A blank box is not an error, it is just nothing typed yet. A typed value
  // the engine would reject IS an error, and it says so before the round trip
  // instead of after it.
  const parseError = trimmed === "" ? null : Number.isFinite(parsed) ? null : `"${trimmed}" is not a finite number.`;
  const canSubmit = canWrite && trimmed !== "" && parseError == null && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await onLogResult(runId, parsed);
    setBusy(false);
    if (result.status === "error") {
      setError(result.reason);
      return;
    }
    // On success the run comes back measured from the engine and this whole
    // field unmounts; clearing is only for the case where it does not.
    setText("");
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder={targetUnit ? `measured ${targetUnit}` : "measured value"}
          aria-label={`Measured value for this run${targetUnit ? ` in ${targetUnit}` : ""}`}
          aria-invalid={parseError != null || error != null}
          disabled={busy || !canWrite}
          className={cn(
            "h-[30px] w-full min-w-[84px] flex-1 basis-[84px] rounded-[8px] border bg-card px-2.5 font-plex-mono text-[12px] tabular-nums text-fg placeholder:font-sans placeholder:text-[11px] placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-55",
            parseError || error ? "border-amber" : "border-border focus:border-action",
          )}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-[10px] border border-border bg-card px-[13px] py-[6px] text-[12px] font-semibold whitespace-nowrap text-fg transition-colors hover:bg-blue-tint disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy ? "Logging..." : "Log result"}
        </button>
      </div>
      {parseError && <p className="text-[11px] leading-[1.4] text-amber">{parseError}</p>}
      {error && <p className="text-[11px] leading-[1.4] text-amber">Not recorded. {error}</p>}
    </div>
  );
}

/** Closes the loop. The engine refuses outright with nothing measured, so the
 *  action is disabled until at least one result is in - with the reason said
 *  out loud rather than left to a failed click to explain. */
function CloseLoopBar({
  measuredCount,
  awaitingCount,
  roundNumber,
  onCloseLoop,
  canWrite,
}: {
  measuredCount: number;
  awaitingCount: number;
  roundNumber: number | null;
  onCloseLoop: () => Promise<MutationResult>;
  canWrite: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await onCloseLoop();
    setBusy(false);
    if (result.status === "error") setError(result.reason);
  }

  const ready = measuredCount > 0 && canWrite;

  return (
    <>
      {/* Same as the approve bar: the design's leading avatar chip named a
          scientist kalos has no concept of, so it is not drawn. */}
      <div className="mt-7 flex flex-wrap items-center gap-3.5 rounded-[12px] bg-blue-soft px-6 py-[22px]">
        <p className="min-w-[24ch] flex-1 text-[12px] leading-[1.45] text-muted">
          {measuredCount === 0 ? (
            <>
              Nothing to fold in yet. Record at least one measured value and the engine can close
              {roundNumber != null ? <> round {roundNumber}</> : <> the round</>} and propose the next batch.
            </>
          ) : (
            <>
              Folds {measuredCount} measured result{measuredCount === 1 ? "" : "s"} into the data, re-fits, and opens the
              next round.
              {awaitingCount > 0 && (
                <>
                  {" "}
                  The {awaitingCount} run{awaitingCount === 1 ? "" : "s"} still awaiting a value stay
                  {awaitingCount === 1 ? "s" : ""} open.
                </>
              )}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={run}
          disabled={!ready || busy}
          title={canWrite ? undefined : "This is a demo campaign, so there is no engine to re-analyse."}
          className="rounded-[10px] bg-action px-[15px] py-[7px] text-[12px] font-semibold whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy ? "Re-analysing..." : `Fold in ${measuredCount === 0 ? "results" : spellCount(measuredCount)}`}
        </button>
      </div>
      {error && <MutationError reason={error} />}
    </>
  );
}
