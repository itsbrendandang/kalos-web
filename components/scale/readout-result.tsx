"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ListChecks, Pencil, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { Metric } from "@/components/kit/metric";
import { SourceLine, formatTimestamp, shortHash } from "@/components/kit/source-line";
import { Verdict } from "@/components/kit/verdict";
import type { Tone } from "@/components/kit/tone";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScaleLadderChart } from "@/components/viz/charts/scale-ladder-chart";
import { BasisGlyph, Num } from "@/components/viz/num";
import { columnDecimals, formatValue, formatVolume, type IntervalSpec } from "@/lib/num";
import { gateRefusal, readReasons, type ReadoutDecision, type ReadoutResult, type ScaleReadout } from "@/lib/scale-readout";
import type { Source } from "@/lib/source";
import { backtestMethodLabel, sourceFromReadout, toScaleLadderData, type LadderStages } from "@/lib/viz-data/scale-ladder";

/** The actions under every outcome: back to the form with the inputs kept, or start over. */
function OutcomeActions({ onEdit, onReset, children }: { onEdit: () => void; onReset: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil />
        Change the inputs
      </Button>
      <Button variant="ghost" size="sm" onClick={onReset}>
        <RotateCcw />
        New sheet
      </Button>
    </div>
  );
}

/** "What it would take": the specific data that would change the answer. */
function WhatItWouldTake({ lines, source }: { lines: string[]; source: "engine" | "gate" }) {
  if (lines.length === 0) return null;
  return (
    <section aria-labelledby="would-take" className="rounded-xl border border-border bg-surface p-panel">
      <h3 id="would-take" className="flex items-center gap-2 text-heading text-fg">
        <ListChecks className="size-4 shrink-0 text-accent" aria-hidden />
        What it would take
      </h3>
      <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-body text-fg marker:text-fg-muted">
        {lines.map((l) => (
          <li key={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</li>
        ))}
      </ul>
      <p className="mt-3 text-caption text-fg-muted">
        {source === "engine"
          ? "Computed by the engine from its own decision rules and your sheet; not an estimate of how likely the extra runs are to succeed."
          : "From the engine's entry checks, which every sheet has to pass before the readout runs."}
      </p>
    </section>
  );
}

const DECISION_COPY: Record<ReadoutDecision, { tone: Tone; headline: string; detail: string }> = {
  NUMBER: {
    tone: "neutral",
    headline: "Prediction issued.",
    detail:
      "Backtested on the smaller scales in your sheet, the model beat both naive baselines, and the step to the target is within what that backtest supports.",
  },
  NUMBER_WITH_WARNING: {
    tone: "warn",
    headline: "Prediction issued, with warnings.",
    detail: "The engine issued a number but flagged the conditions below. Read the interval with them in mind.",
  },
  REFUSAL: {
    tone: "neutral",
    headline: "No prediction at this scale.",
    detail: "The engine refused rather than give a number your data does not support. That is a result, not a failure.",
  },
};

/**
 * The engine's JSON readout: the decision and its reasons, the prediction with
 * the interval and coverage the engine reported (or the refusal and what would
 * fix it), the C9 ladder chart, the backtest evidence and the source. Every
 * value is an engine field; nothing is parsed out of HTML or recomputed.
 */
export function ReadoutReport({
  readout: r,
  fileName,
  stages,
  onEdit,
  onReset,
  actions,
}: {
  readout: ScaleReadout;
  fileName: string | null;
  /** Stage volume bands behind the chart: the campaign's own, or the engine's defaults (labelled). */
  stages?: LadderStages;
  onEdit: () => void;
  onReset: () => void;
  /** Extra actions (e.g. "Attach to a gate decision" on a campaign's scale-up track). */
  actions?: ReactNode;
}) {
  const data = useMemo(() => toScaleLadderData(r, stages), [r, stages]);
  const copy = DECISION_COPY[r.decision];
  const reasons = useMemo(() => r.reasons.flatMap(readReasons), [r.reasons]);
  const source = sourceFromReadout(r, "readout", r.decision === "REFUSAL" ? "derived" : "predicted", fileName);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Verdict tone={copy.tone}>{copy.headline}</Verdict>
        <p className="ml-6.5 max-w-[68ch] text-body text-fg-muted">{copy.detail}</p>
        {reasons.length > 0 ? (
          <div className="ml-6.5">
            <p className="text-label text-fg-muted">{r.decision === "REFUSAL" ? "The engine's reasons" : "The engine's warnings"}</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-body text-fg marker:text-fg-muted">
              {reasons.map((x) => (
                <li key={x.raw}>{x.plain}</li>
              ))}
            </ul>
            <Disclosure summary="The engine's exact words" className="border-t-0">
              <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-fg-muted">
                {r.reasons.map((x) => (
                  <li key={x} className="font-mono">
                    {x}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        ) : null}
      </div>

      {r.decision !== "REFUSAL" ? <PredictionBlock r={r} source={source} /> : null}

      <WhatItWouldTake lines={r.data_plan} source="engine" />

      {r.feature_set === "scale_only" || (r.missing_physics_inputs?.length ?? 0) > 0 ? (
        <p className="max-w-[68ch] text-body text-fg-muted">
          The sheet does not record both agitation and airflow, so the engine used its scale-only model: it accounts for volume and hydrostatic
          pressure but not mixing or oxygen transfer.
        </p>
      ) : null}

      <ScaleLadderChart data={data} source={source} />

      <Evidence r={r} />

      <div className="flex flex-col gap-3">
        <SourceLine
          parts={[
            { label: "Engine readout of", value: fileName ?? null },
            { label: "generated", value: r.generated_at_utc ? formatTimestamp(Date.parse(r.generated_at_utc)) : null },
            { label: "engine", value: r.provenance?.engine_version ?? null },
            { label: "readout", value: <span className="font-mono text-code">{shortHash(r.readout_id)}</span>, title: r.readout_id },
            { label: "upload SHA-256", value: shortHash(r.provenance?.raw_upload_sha256), title: r.provenance?.raw_upload_sha256 ?? undefined },
          ]}
        />
        <p className="max-w-[68ch] text-caption text-fg-muted">
          Nothing is stored on the server. The readout id is a SHA-256 over the engine version, the sheet and the target, so the same sheet
          with the same inputs gives the same id; a gate decision can link to it.
        </p>
        <OutcomeActions onEdit={onEdit} onReset={onReset}>
          {actions}
          <Button size="sm" variant="outline" onClick={() => window.print()} className="print:hidden">
            <Printer />
            Print
          </Button>
        </OutcomeActions>
      </div>
    </div>
  );
}

function PredictionBlock({ r, source }: { r: ScaleReadout; source: Source }) {
  const value = Number.isFinite(r.prediction) ? (r.prediction as number) : null;
  const interval: IntervalSpec | null =
    r.interval && Number.isFinite(r.interval[0]) && Number.isFinite(r.interval[1])
      ? { lo: r.interval[0], hi: r.interval[1], coverage: Number.isFinite(r.interval_coverage) ? r.interval_coverage : null, method: "scale-ladder" }
      : null;
  const unit = r.target_column_unit ?? null;
  return (
    <section aria-label="Prediction" className="flex flex-col gap-1">
      <p className="flex items-center gap-2 text-label text-fg-muted">
        <BasisGlyph basis="predicted" />
        Predicted <span className="font-mono text-code text-fg">{r.target_column}</span> at{" "}
        <span className="text-fg tabular-nums">{formatVolume(r.target_inputs.scale_L).text}</span>
      </p>
      <Num value={value} basis="predicted" unit={unit} interval={interval} size="title" glyph={false} layout="stacked" source={{ ...source, field: "prediction, interval" }} />
      {interval ? null : <p className="text-body text-fg-muted">Interval n/a: the engine reported none.</p>}
      <p className="mt-1 max-w-[68ch] text-caption text-fg-muted">Interval, as the engine labels it: {r.interval_label}</p>
      <p className="max-w-[68ch] text-caption text-fg-muted">It predicts a level at the target scale, not a ranking of recipes there.</p>
    </section>
  );
}

function Evidence({ r }: { r: ScaleReadout }) {
  const b = r.baseline_comparison;
  const unit = r.target_column_unit ?? null;
  const rungs = r.backtest?.per_scale?.length ? r.backtest.per_scale : r.rungs;
  const maeDec = columnDecimals(
    rungs.flatMap((x) => [x.mae, x.naive_mean_mae, x.naive_nn_mae]).filter((v): v is number => v != null && Number.isFinite(v)).map((value) => ({ value, u: null })),
  );
  const pooledDec = columnDecimals(
    [b?.pooled_mae, b?.pooled_naive_mean_mae, b?.pooled_naive_nn_mae].filter((v): v is number => v != null && Number.isFinite(v)).map((value) => ({ value, u: null })),
  );
  const yesNo = (v: boolean | null | undefined) => (v == null ? "n/a" : v ? "yes" : "no");
  const method = backtestMethodLabel(r.backtest?.method);
  return (
    <section aria-labelledby="readout-evidence" className="flex flex-col gap-4">
      <div>
        <h3 id="readout-evidence" className="text-heading text-fg">
          The evidence behind it
        </h3>
        <p className="mt-0.5 max-w-[68ch] text-body text-fg-muted">
          {method ? `Backtest: ${method}. ` : ""}
          {r.backtest?.method_description ? `The engine: ${r.backtest.method_description}. ` : ""}
          Each held-out scale&apos;s error is compared with two naive baselines. Lower error is better.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric size="sm" label="Model error (MAE)" value={b?.pooled_mae} unit={unit} options={{ decimals: pooledDec }} qualifier="pooled over held-out runs" />
        <Metric size="sm" label="Mean-carry baseline" value={b?.pooled_naive_mean_mae} unit={unit} options={{ decimals: pooledDec }} qualifier="smallest scale's mean" />
        <Metric size="sm" label="Nearest-recipe baseline" value={b?.pooled_naive_nn_mae} unit={unit} options={{ decimals: pooledDec }} qualifier="most similar run at another scale" />
        <Metric
          size="sm"
          label="Beats both"
          value={yesNo(b?.pooled_beats_both)}
          qualifier={b?.n_residuals != null ? `over ${formatValue(b.n_residuals, { quantity: "count" }).text} held-out runs` : undefined}
        />
        <Metric size="sm" label="Requested step" value={r.requested_ratio} quantity="ratio" qualifier="target over largest scale run" />
        <Metric
          size="sm"
          label="Backtested step"
          value={r.reference_ratio}
          quantity="ratio"
          qualifier={r.reference_ratio == null ? "no rung licensed a reference step" : "the step the backtest supports"}
        />
      </div>
      {r.out_of_range_params.length > 0 ? (
        <p className="text-body text-fg">
          Outside the range in your sheet:{" "}
          {r.out_of_range_params.map((o, i) => (
            <span key={o}>
              {i ? ", " : ""}
              <span className="font-mono text-code">{o}</span>
            </span>
          ))}
        </p>
      ) : null}

      <Disclosure summary="Backtest ladder, scale by scale" meta={rungs.length ? `${rungs.length} ${rungs.length === 1 ? "scale" : "scales"} tested` : "none tested"}>
        {rungs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Held-out scale</TableHead>
                <TableHead numeric>Step</TableHead>
                <TableHead numeric>Runs</TableHead>
                <TableHead numeric>Model MAE</TableHead>
                <TableHead numeric>Mean-carry MAE</TableHead>
                <TableHead numeric>Nearest-recipe MAE</TableHead>
                <TableHead>Beats both</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rungs.map((x) => (
                <TableRow key={x.scale_L}>
                  <TableCell className="tabular-nums">{formatVolume(x.scale_L).text}</TableCell>
                  <TableCell numeric>{formatValue(x.step_ratio, { quantity: "ratio" }).text}</TableCell>
                  <TableCell numeric>{formatValue(x.n, { quantity: "count" }).text}</TableCell>
                  <TableCell numeric>{formatValue(x.mae, { decimals: maeDec }).text}</TableCell>
                  <TableCell numeric>{formatValue(x.naive_mean_mae, { decimals: maeDec }).text}</TableCell>
                  <TableCell numeric>{formatValue(x.naive_nn_mae, { decimals: maeDec }).text}</TableCell>
                  <TableCell>{x.too_few_to_judge ? "too few to judge" : yesNo(x.beats_both)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-body text-fg-muted">No scale in this sheet had enough smaller scales below it to be tested.</p>
        )}
        {r.skipped_rungs.length > 0 ? (
          <div className="mt-3">
            <p className="text-label text-fg-muted">Not tested</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-caption text-fg-muted">
              {r.skipped_rungs.map((s) => (
                <li key={s.scale_L}>
                  <span className="tabular-nums">{formatVolume(s.scale_L).text}</span>: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Disclosure>
    </section>
  );
}

/** A 422 from the engine's entry checks: a normal outcome, in plain words, with what would get past it. */
export function GateRefusalView({
  failedCheck,
  detail,
  onEdit,
  onReset,
}: {
  failedCheck: string;
  detail: string;
  onEdit: () => void;
  onReset: () => void;
}) {
  const g = gateRefusal(failedCheck, detail);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Verdict tone="neutral">No readout for this sheet and target.</Verdict>
        <p className="ml-6.5 max-w-[68ch] text-body text-fg">{g.statement}</p>
        <p className="ml-6.5 max-w-[68ch] text-body text-fg-muted">
          The engine checks every sheet before it backtests anything, and stops here rather than guess.
        </p>
      </div>
      <WhatItWouldTake lines={g.fix} source="gate" />
      <OutcomeActions onEdit={onEdit} onReset={onReset} />
      <Disclosure summary="The engine's exact words">
        <dl className="grid gap-1 text-body">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg-muted">Check</dt>
            <dd className="font-mono text-code text-fg">{failedCheck}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-fg-muted">Detail</dt>
            <dd className="text-fg">{detail || "n/a"}</dd>
          </div>
        </dl>
      </Disclosure>
    </div>
  );
}

/** Busy, signed out, upload rejected, or the service did not answer: never a result about the process. */
export function ReadoutProblem({
  result,
  onRetry,
  onEdit,
  onReset,
}: {
  result: Extract<ReadoutResult, { kind: "busy" | "auth" | "upload" | "unavailable" }>;
  onRetry: () => void;
  onEdit: () => void;
  onReset: () => void;
}) {
  if (result.kind === "busy") {
    return (
      <Callout
        tone="warn"
        title="The analysis service is busy"
        action={
          <OutcomeActions onEdit={onEdit} onReset={onReset}>
            <Button size="sm" onClick={onRetry}>
              <RefreshCw />
              Try again
            </Button>
          </OutcomeActions>
        }
      >
        It runs one analysis at a time and another one is in progress. Try again in{" "}
        {result.retryAfterSeconds != null ? `${result.retryAfterSeconds} seconds` : "a minute"}. Nothing was run on your sheet.
      </Callout>
    );
  }
  if (result.kind === "auth") {
    return (
      <Callout
        tone="bad"
        title={result.signIn ? "Sign in again" : "Not allowed for this account"}
        action={
          result.signIn ? (
            <Link href="/sign-in" className="text-label text-accent underline-offset-4 hover:underline">
              Sign in
            </Link>
          ) : (
            <OutcomeActions onEdit={onEdit} onReset={onReset} />
          )
        }
      >
        {result.message}
      </Callout>
    );
  }
  if (result.kind === "upload") {
    return (
      <Callout tone="bad" title="The engine could not read this file" action={<OutcomeActions onEdit={onEdit} onReset={onReset} />}>
        {result.message}
      </Callout>
    );
  }
  return (
    <Callout
      tone="bad"
      title="No answer from the analysis service"
      action={
        <OutcomeActions onEdit={onEdit} onReset={onReset}>
          <Button size="sm" onClick={onRetry}>
            <RefreshCw />
            Try again
          </Button>
        </OutcomeActions>
      }
    >
      {result.message} This is a connection problem, not a result about your process.
    </Callout>
  );
}
