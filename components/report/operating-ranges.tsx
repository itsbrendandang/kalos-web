"use client";

import { useId, useState, type FormEvent } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { formatTimestamp } from "@/components/kit/source-line";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefusalBlock } from "@/components/viz/refusal";
import { computeOperatingRanges, type Goal, type OperatingRanges } from "@/lib/api";
import { formatProb, formatSetting, formatValue } from "@/lib/num";
import type { OperatingRangesRequest, OperatingRangesRun } from "@/lib/report-package";
import { OPERATING_RANGE_REASONS, typedValue } from "@/components/report/report-copy";
import { engineDetail, unavailableFrom } from "@/components/report/report-data";

const PROB_MIN = 0.5;
const PROB_MAX = 0.99;

/** Parse the two inputs; null with a message when either is out of the engine's accepted range. */
export function parseRequest(threshold: string, probability: string): { ok: true; request: OperatingRangesRequest } | { ok: false; message: string } {
  const t = Number(threshold);
  const p = Number(probability);
  if (threshold.trim() === "" || !Number.isFinite(t)) return { ok: false, message: "Enter a threshold: a number in the target's units." };
  if (probability.trim() === "" || !Number.isFinite(p) || p < PROB_MIN || p > PROB_MAX) {
    return { ok: false, message: `Enter a probability from ${PROB_MIN} to ${PROB_MAX}.` };
  }
  return { ok: true, request: { threshold: t, probability: p, basis: "target" } };
}

/**
 * Operating ranges (POST /operating-ranges): the model-based box around the
 * best measured recipe where every sampled point has at least the chosen
 * probability of meeting the threshold. The engine computes it only when the
 * analysis is current and its reliability is established; otherwise it says
 * why and what would fix it. Every computed range is a model estimate and is
 * labelled so.
 */
export function OperatingRangesSection({
  campaignId,
  target,
  unit,
  goal,
  bestMeasured,
  inSync,
  last,
  onResult,
}: {
  campaignId: string;
  target: string | null;
  unit: string | null;
  goal: Goal;
  bestMeasured: number | null;
  inSync: boolean | null;
  last: OperatingRangesRun | null;
  onResult: (run: OperatingRangesRun) => void;
}) {
  const ids = useId();
  const [threshold, setThreshold] = useState("");
  const [probability, setProbability] = useState("0.9");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const parsed = parseRequest(threshold, probability);
  const direction = goal === "minimize" ? "at most" : "at least";
  const targetText = target ? <span className="font-mono text-code">{target}</span> : "the target";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) {
      setInvalid(parsed.message);
      return;
    }
    setInvalid(null);
    setDetail(null);
    setBusy(true);
    const requested_at = new Date().toISOString();
    try {
      const outcome = await computeOperatingRanges(campaignId, { threshold: parsed.request.threshold, probability: parsed.request.probability });
      onResult({ status: "answered", request: parsed.request, requested_at, outcome });
    } catch (err) {
      const u = unavailableFrom(err);
      setDetail(engineDetail(err));
      onResult({ status: "failed", request: parsed.request, requested_at, code: u.code, reason: u.reason });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      id="operating-ranges"
      className="min-w-0"
      title="Operating ranges"
      description={
        <>
          The engine refits its model and looks for the largest box of input settings around the best measured recipe in which every sampled point has at
          least the probability you choose of {targetText} being {direction} your threshold. It computes this only when the analysis includes the latest
          results and the model has shown it can rank held-out runs; otherwise it says why. The result is a model estimate, not a measurement.
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3 print:hidden" noValidate>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex w-48 flex-col gap-1.5" htmlFor={`${ids}-t`}>
            <span className="text-label text-fg">
              Threshold{unit ? ` (${unit})` : ""}
            </span>
            <Input
              id={`${ids}-t`}
              type="number"
              inputMode="decimal"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              aria-describedby={`${ids}-hint`}
              aria-invalid={invalid != null && threshold.trim() === "" ? true : undefined}
            />
          </label>
          <label className="flex w-48 flex-col gap-1.5" htmlFor={`${ids}-p`}>
            <span className="text-label text-fg">Probability ({PROB_MIN} to {PROB_MAX})</span>
            <Input id={`${ids}-p`} type="number" inputMode="decimal" min={PROB_MIN} max={PROB_MAX} step={0.01} value={probability} onChange={(e) => setProbability(e.target.value)} />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {busy ? "Computing" : "Compute operating ranges"}
          </Button>
        </div>
        <p id={`${ids}-hint`} className="text-caption text-fg-muted tabular-nums">
          {parsed.ok ? (
            <>
              Rule: at least {formatProb(parsed.request.probability).text} probability that {targetText} is {direction}{" "}
              {typedValue(parsed.request.threshold, unit)}.
            </>
          ) : (
            "Choose a threshold in the target's units and a probability."
          )}{" "}
          {bestMeasured != null ? `Best measured so far: ${formatValue(bestMeasured, { unit, basis: "measured" }).text}.` : null}
          {inSync === false ? " The analysis is older than the latest results, so the engine will decline until it is re-analyzed." : null}
        </p>
        {invalid ? (
          <p role="alert" className="text-body text-fg">
            {invalid}
          </p>
        ) : null}
        {busy ? (
          <p role="status" className="text-caption text-fg-muted">
            The engine is refitting the model and sampling the search box. It reports no stages for this, so there is no progress bar.
          </p>
        ) : null}
      </form>
      {last ? <OperatingRangesResult run={last} unit={unit} detail={detail} /> : null}
    </Section>
  );
}

function Asked({ run, unit }: { run: OperatingRangesRun; unit: string | null }) {
  return (
    <p className="text-caption text-fg-muted tabular-nums">
      Asked {formatTimestamp(Date.parse(run.requested_at))}: threshold {typedValue(run.request.threshold, unit)}, probability{" "}
      {formatProb(run.request.probability).text}.
    </p>
  );
}

export function OperatingRangesResult({ run, unit, detail }: { run: OperatingRangesRun; unit: string | null; detail?: string | null }) {
  if (run.status === "failed") {
    return (
      <div className="flex flex-col gap-2" role="status">
        <Asked run={run} unit={unit} />
        <p className="text-body text-fg">
          {run.code === "engine_busy" ? "The engine is busy with another fit (operating ranges share its analysis slot). Try again in a minute." : run.reason} Nothing
          was computed.
        </p>
        {detail ? <p className="text-caption text-fg-muted">Engine: {detail}</p> : null}
      </div>
    );
  }
  const o = run.outcome;
  if (o.status === "not_computed") return <NotComputed o={o} run={run} unit={unit} />;
  return <Computed o={o} run={run} unit={unit} />;
}

function NotComputed({ o, run, unit }: { o: Extract<OperatingRanges, { status: "not_computed" }>; run: OperatingRangesRun; unit: string | null }) {
  const known = OPERATING_RANGE_REASONS[o.reason_code];
  const reason = known?.reason ?? o.reason;
  const fix = known?.fix ?? o.what_would_fix_it ?? null;
  const anchor = (o.diagnostics as { anchor?: { probability_meets_rule?: unknown } } | undefined)?.anchor;
  const pAnchor = typeof anchor?.probability_meets_rule === "number" ? anchor.probability_meets_rule : null;
  return (
    <div className="flex flex-col gap-2" role="status">
      <Asked run={run} unit={unit} />
      <RefusalBlock
        title="Not computed by the engine"
        reasons={[reason]}
        fix={fix ? [fix] : undefined}
        footer={pAnchor != null ? `Model probability that the best measured recipe meets the rule: ${formatProb(pAnchor).text} (model-based).` : undefined}
      />
      <Disclosure summary="The engine's words and diagnostics">
        <div className="flex flex-col gap-2 text-body text-fg-muted">
          <p>
            <code className="font-mono text-code text-fg">{o.reason_code}</code>: {o.reason}
          </p>
          {o.what_would_fix_it ? <p>What would fix it: {o.what_would_fix_it}</p> : null}
          {o.diagnostics ? (
            <pre className="max-h-80 overflow-auto rounded-lg bg-subtle p-3 font-mono text-caption break-all whitespace-pre-wrap text-fg">{JSON.stringify(o.diagnostics, null, 2)}</pre>
          ) : null}
        </div>
      </Disclosure>
    </div>
  );
}

function Computed({ o, run, unit }: { o: Extract<OperatingRanges, { status: "computed" }>; run: OperatingRangesRun; unit: string | null }) {
  const caveats = o.caveats ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-3" role="status">
      <Asked run={run} unit={unit} />
      <p className="flex items-start gap-2 rounded-xl border border-border bg-surface p-tight text-label text-fg">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
        <span>
          Model-based estimate, must be verified experimentally. These ranges come from the model&apos;s predictions, not from measurements; run
          confirmation experiments inside them before relying on them.
        </span>
      </p>
      <Table containerClassName="rounded-xl border border-border">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="bg-surface">Input</TableHead>
            <TableHead className="bg-surface" numeric>
              Low
            </TableHead>
            <TableHead className="bg-surface" numeric>
              High
            </TableHead>
            <TableHead className="bg-surface" numeric>
              Search box low
            </TableHead>
            <TableHead className="bg-surface" numeric>
              Search box high
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {o.ranges.map((r) => {
            const box: [number, number] = [r.design_low, r.design_high];
            return (
              <TableRow key={r.feature}>
                <TableCell className="font-mono text-code">{r.feature}</TableCell>
                <TableCell numeric>{formatSetting(r.low, box).text}</TableCell>
                <TableCell numeric>{formatSetting(r.high, box).text}</TableCell>
                <TableCell numeric className="text-fg-muted">
                  {formatSetting(r.design_low, box).text}
                </TableCell>
                <TableCell numeric className="text-fg-muted">
                  {formatSetting(r.design_high, box).text}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-body text-fg tabular-nums">
        {o.fraction_of_design_space_meeting_rule != null ? (
          <>
            {formatProb(o.fraction_of_design_space_meeting_rule).text} of the search box meets the rule
            <span className="text-fg-muted"> (share of the engine&apos;s sample points, model-based).</span>
          </>
        ) : (
          <span className="text-fg-muted">Share of the search box meeting the rule: n/a (not reported).</span>
        )}
      </p>
      <p className="text-body text-fg-muted">
        Engine statement: <span className="text-fg">{o.statement}</span>
      </p>
      {caveats.length ? (
        <div>
          <p className="text-label text-fg">Caveats from the engine</p>
          <ul className="mt-1 list-disc pl-5 text-body text-fg-muted">
            {caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Disclosure summary="Method, model and sampling, as the engine sent them">
        <pre className="max-h-80 overflow-auto rounded-lg bg-subtle p-3 font-mono text-caption break-all whitespace-pre-wrap text-fg">
          {JSON.stringify({ method: o.method, rule: o.rule, model: o.model, sampling: o.sampling, anchor: o.anchor, box: o.box, reliability: o.reliability }, null, 2)}
        </pre>
      </Disclosure>
    </div>
  );
}
