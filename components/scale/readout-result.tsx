"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ListChecks, Pencil, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { Metric } from "@/components/kit/metric";
import { SourceLine, shortHash } from "@/components/kit/source-line";
import { Verdict } from "@/components/kit/verdict";
import type { Tone } from "@/components/kit/tone";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gateRefusal, parseReadoutDocument, type ReadoutResult, type ReadoutSummary } from "@/lib/scale-readout";

/**
 * Print the readout without a same-origin document. A text/html blob opened
 * from this origin would run with the app's origin (a blob inherits its
 * creator's), so it is never used. The readout goes into a hidden iframe
 * without same-origin permission, which gives it an opaque origin; its own
 * script (a print-on-load call, the only one added) prints that frame.
 * Scripts are allowed only so the frame can call print() itself: a parent
 * cannot call print() on a cross-origin frame.
 */
export function printReadout(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  frame.srcdoc = `${html}<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},0)});</script>`;
  document.body.appendChild(frame);
  // Keep the frame until the print dialog has had time to read it.
  setTimeout(() => frame.remove(), 60_000);
}

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

const DECISION_COPY: Record<NonNullable<ReadoutSummary["decision"]>, { tone: Tone; headline: string; detail: string }> = {
  NUMBER: {
    tone: "good",
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

/** The engine's readout page, read into the app's own type, with the page itself one click down. */
export function ReadoutReport({
  html,
  fileName,
  onEdit,
  onReset,
}: {
  html: string;
  fileName: string | null;
  onEdit: () => void;
  onReset: () => void;
}) {
  const summary = useMemo<ReadoutSummary | null>(() => {
    try {
      return parseReadoutDocument(new DOMParser().parseFromString(html, "text/html"));
    } catch {
      return null;
    }
  }, [html]);
  const decision = summary?.decision ?? null;
  const copy = decision ? DECISION_COPY[decision] : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Verdict tone={copy?.tone ?? "neutral"}>
          {copy?.headline ?? "The readout came back in a form this page could not read. The engine's full readout is below."}
        </Verdict>
        {copy ? <p className="ml-6.5 max-w-[68ch] text-body text-fg-muted">{copy.detail}</p> : null}
        {summary && summary.reasons.length > 0 ? (
          <div className="ml-6.5">
            <p className="text-label text-fg-muted">{decision === "REFUSAL" ? "The engine's reasons" : "The engine's warnings"}</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-body text-fg marker:text-fg-muted">
              {summary.reasons.map((r) => (
                <li key={r.raw}>{r.plain}</li>
              ))}
            </ul>
            <Disclosure summary="The engine's exact words" className="border-t-0">
              <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-fg-muted">
                {summary.reasons.map((r) => (
                  <li key={r.raw} className="font-mono">
                    {r.raw}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        ) : null}
      </div>

      {summary?.prediction ? <PredictionBlock summary={summary} /> : null}

      {summary ? <WhatItWouldTake lines={summary.dataPlan} source="engine" /> : null}

      {summary?.scaleOnlyNote ? <p className="max-w-[68ch] text-body text-fg-muted">{summary.scaleOnlyNote}</p> : null}

      {summary ? <Evidence summary={summary} /> : null}

      <div className="flex flex-col gap-3">
        <SourceLine
          parts={[
            { label: "Engine readout of", value: fileName ?? null },
            { label: "generated", value: summary?.generatedAt ?? null },
            { label: "engine", value: summary?.engineVersion ?? null },
            { label: "upload SHA-256", value: shortHash(summary?.uploadSha256), title: summary?.uploadSha256 ?? undefined },
          ]}
        />
        <p className="text-caption text-fg-muted">
          Nothing is stored on the server. To regenerate this readout, upload the same sheet with the same inputs; the hash above lets
          anyone holding the file check it is the same one.
        </p>
        <OutcomeActions onEdit={onEdit} onReset={onReset}>
          <Button size="sm" onClick={() => printReadout(html)}>
            <Printer />
            Print or save as PDF
          </Button>
        </OutcomeActions>
      </div>

      <Disclosure summary="The engine's full readout" meta="the printable page" defaultOpen={!summary || !decision}>
        <iframe
          srcDoc={html}
          sandbox=""
          title="Scale-up readout from the engine"
          className="h-[1100px] w-full rounded-xl border border-border bg-surface"
        />
      </Disclosure>
    </div>
  );
}

function PredictionBlock({ summary }: { summary: ReadoutSummary }) {
  const p = summary.prediction!;
  const subject = p.label.replace(/^Predicted\s*/, "");
  return (
    <section aria-label="Prediction" className="flex flex-col gap-1">
      <p className="flex items-center gap-2 text-label text-fg-muted">
        <span className="size-2.5 shrink-0 rounded-full border-2 border-chart-predicted" aria-hidden />
        Predicted <span className="text-fg">{subject}</span>
      </p>
      <p className="text-metric text-fg tabular-nums">{p.value}</p>
      <p className="text-body text-fg tabular-nums">
        {p.low != null && p.high != null ? (
          <>
            Interval {p.low} to {p.high}
          </>
        ) : (
          <>Interval {p.intervalRaw || "n/a"}</>
        )}{" "}
        <span className="text-fg-muted">({p.intervalLabel})</span>
      </p>
      <p className="mt-1 max-w-[68ch] text-caption text-fg-muted">
        Split-conformal on the backtest residuals{summary.alpha ? ` at alpha ${summary.alpha}` : ""}. The engine calls this approximate
        coverage, not calibrated: a scale you have not run need not behave like the smaller scales it was tested on. It predicts a level at
        the target scale, not a ranking of recipes there.
      </p>
    </section>
  );
}

/** "n/a (reason)" as the engine prints a missing ratio: the value and its reason, shown apart. */
function splitNa(v: string | null): { value: string | null; note?: string } {
  const m = v?.match(/^n\/a\s*\((.*)\)$/);
  return m ? { value: "n/a", note: m[1] } : { value: v };
}

function Evidence({ summary }: { summary: ReadoutSummary }) {
  const b = summary.baseline;
  const ref = splitNa(summary.referenceRatio);
  return (
    <section aria-labelledby="readout-evidence" className="flex flex-col gap-4">
      <div>
        <h3 id="readout-evidence" className="text-heading text-fg">
          The evidence behind it
        </h3>
        <p className="mt-0.5 max-w-[68ch] text-body text-fg-muted">
          The engine hides each larger scale in your sheet, predicts it from the smaller ones, and compares its error with two naive
          baselines. Lower error is better.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric size="sm" label="Model error (MAE)" value={b?.modelMae ?? null} />
        <Metric size="sm" label="Mean-carry baseline" value={b?.naiveMeanMae ?? null} qualifier="smallest scale's mean" />
        <Metric size="sm" label="Nearest-recipe baseline" value={b?.naiveNnMae ?? null} qualifier="most similar run at another scale" />
        <Metric size="sm" label="Beats both" value={b?.beatsBoth ?? null} qualifier={b?.nResiduals ? `over ${b.nResiduals} held-out runs` : undefined} />
        <Metric size="sm" label="Requested step" value={summary.requestedRatio} qualifier="target over largest scale run" />
        <Metric size="sm" label="Backtested step" value={ref.value} qualifier={ref.note ?? "largest step the backtest supports"} />
      </div>
      {summary.outOfRange ? (
        <p className="text-body text-fg">
          Outside the range in your sheet: <span className="font-mono text-code">{summary.outOfRange}</span>
        </p>
      ) : null}

      <Disclosure summary="Backtest ladder, scale by scale" meta={summary.rungs.length ? `${summary.rungs.length} ${summary.rungs.length === 1 ? "scale" : "scales"} tested` : "none tested"}>
        {summary.rungs.length > 0 ? (
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
              {summary.rungs.map((r) => (
                <TableRow key={r.scale}>
                  <TableCell className="tabular-nums">{r.scale}</TableCell>
                  <TableCell numeric>{r.stepRatio}</TableCell>
                  <TableCell numeric>{r.n}</TableCell>
                  <TableCell numeric>{r.mae}</TableCell>
                  <TableCell numeric>{r.naiveMeanMae}</TableCell>
                  <TableCell numeric>{r.naiveNnMae}</TableCell>
                  <TableCell>{r.beatsBoth}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-body text-fg-muted">No scale in this sheet had enough smaller scales below it to be tested.</p>
        )}
        {summary.skippedRungs.length > 0 ? (
          <div className="mt-3">
            <p className="text-label text-fg-muted">Not tested</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-caption text-fg-muted">
              {summary.skippedRungs.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-3 text-caption text-fg-muted">
          A scale with fewer than the engine&apos;s minimum runs reads &quot;too few to judge&quot;. &quot;Below license window&quot; means the
          scale is too far below your largest scale to vouch for a step at the target.
        </p>
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
