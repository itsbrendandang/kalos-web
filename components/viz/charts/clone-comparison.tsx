"use client";

import { useMemo } from "react";
import { CloneChip } from "@/components/viz/clone-chip";
import { ChartFrame, type DataTable } from "@/components/viz/frame";
import { DerivedDiamond, IntervalBar } from "@/components/viz/marks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { coverageText, formatValue } from "@/lib/num";
import type { Source } from "@/lib/source";
import { cn } from "@/lib/utils";
import { CLONE_MIN_RUNS, cloneGlyphs, describeCloneComparison, effectText, flagText, type CloneComparison, type CloneRow } from "@/lib/viz-data/clones";

/*
 * SV-G4: the clone comparison table. Three kinds of number, never mixed in one
 * column and each labelled with its basis:
 *  - measured (semibold ink, first): the engine's mean of this clone's runs with its t-interval;
 *  - derived: the process-adjusted effect against the reference clone (empirical
 *    Bayes on out-of-fold residuals), approximate interval, data weight, drawn as
 *    a diamond on a shared zero line;
 *  - predicted (regular, accent): the model at one reference process with this
 *    clone, with the coverage and method of its band.
 * A withheld value shows the engine's reason. No ranking: rows keep the engine's label order.
 */
const BAR_W = 132;

export function CloneComparisonTable({ data, source, width: fixedWidth, bare = false }: { data: CloneComparison; source: Source; width?: number; bare?: boolean }) {
  const glyphs = useMemo(() => cloneGlyphs(data.rows.map((r) => r.label)), [data.rows]);
  const description = describeCloneComparison(data);
  const unit = data.unit ? ` (${data.unit})` : "";
  const measuredCov = coverageText(data.rows.find((r) => r.measured?.coverage != null)?.measured?.coverage ?? null);
  const effectCov = coverageText(data.rows.find((r) => r.adjusted?.coverage != null)?.adjusted?.coverage ?? null);
  const at = data.referenceAt ? Object.entries(data.referenceAt).filter(([, v]) => v != null) : [];
  return (
    <ChartFrame
      bare={bare}
      title={`Clone comparison, ${data.target}`}
      subtitle="Measured first. The adjusted effect is the clone's difference at the same process conditions; the prediction is the model at one shared reference recipe. An association, not a ranking of clones."
      width={fixedWidth}
      height={56 + 44 * data.rows.length}
      description={description}
      data={comparisonTable(data)}
      footer={
        <>
          {data.policyNote ? <span className="mb-1 block text-fg">{data.policyNote}</span> : null}
          {at.length ? (
            <span className="mb-1 block">
              Reference recipe for the prediction column: {at.map(([k, v]) => `${k} ${typeof v === "number" ? formatValue(v, { fallbackSigFigs: 4 }).value : v}`).join(", ")}.
            </span>
          ) : null}
          {data.loco ? (
            <span className="mb-1 block">
              Leave-one-clone-out rank agreement:{" "}
              {data.loco.spearman != null ? `${formatValue(data.loco.spearman, { quantity: "corr" }).value} over ${formatValue(data.loco.n_clones ?? null, { quantity: "count" }).text} clones (reported, never a gate)` : `not reported: ${data.loco.reason ?? "no reason given"}`}.
            </span>
          ) : null}
          From: {source.label} · strain_summary.levels[] (outcomes: measured; adjusted_effect: derived; gp_at_reference: predicted){source.engineVersion ? ` · engine ${source.engineVersion}` : ""}
        </>
      }
    >
      {() => (
        <Table containerClassName="rounded-lg border border-border">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-surface">Clone</TableHead>
              <TableHead numeric className="bg-surface">
                Runs (recipes)
              </TableHead>
              <TableHead numeric className="bg-surface">
                Measured mean{unit}
                {measuredCov ? <span className="block text-caption font-normal">{measuredCov} interval</span> : null}
              </TableHead>
              <TableHead numeric className="bg-surface">
                Best run
              </TableHead>
              <TableHead className="bg-surface">
                Adjusted effect vs {data.reference ?? "reference"}
                <span className="block text-caption font-normal">{effectCov ? `${effectCov} interval, approximate` : "approximate interval"}</span>
              </TableHead>
              <TableHead numeric className="bg-surface">
                Predicted at reference
                <span className="block text-caption font-normal">model, not measured</span>
              </TableHead>
              <TableHead className="bg-surface">Covariates</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={r.label} className="align-top">
                <TableCell className="whitespace-normal">
                  <div className="flex flex-col items-start gap-1">
                    <CloneChip glyph={glyphs.get(r.label)!} filled />
                    {r.isReference || r.isFixed ? <span className="text-caption text-fg-muted">{[r.isReference ? "reference" : null, r.isFixed ? "fixed in proposals" : null].filter(Boolean).join(" · ")}</span> : null}
                    {r.flags.filter((f) => f !== "mostly_pooled").length ? (
                      <span className="text-caption text-warn" title={r.flags.join(", ")}>
                        {r.flags.filter((f) => f !== "mostly_pooled").map(flagText).join("; ")}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell numeric>
                  {formatValue(r.nRuns, { quantity: "count" }).text}
                  {r.nRecipes != null ? <span className="text-fg-muted"> ({formatValue(r.nRecipes, { quantity: "count" }).text})</span> : null}
                </TableCell>
                <TableCell numeric>
                  <MeasuredCell row={r} />
                </TableCell>
                <TableCell numeric className="text-caption">
                  {r.measured?.best != null ? (
                    <>
                      <span className="text-body font-semibold text-fg">{formatValue(r.measured.best).value}</span>
                      {r.measured.best_run_id ? <span className="block font-mono text-fg-muted">{r.measured.best_run_id}</span> : null}
                    </>
                  ) : (
                    <span className="text-fg-muted">n/a</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <EffectCell row={r} domain={data.effectDomain} reference={data.reference} />
                </TableCell>
                <TableCell numeric className="whitespace-normal">
                  <PredictedCell row={r} />
                </TableCell>
                <TableCell className="text-caption text-fg-muted">
                  {r.covariates.length ? r.covariates.map((c) => (
                    <span key={c.name} className="block">
                      {c.name} {c.text}
                    </span>
                  )) : "none"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ChartFrame>
  );
}

function MeasuredCell({ row: r }: { row: CloneRow }) {
  const m = r.measured;
  if (!m || m.n_runs === 0) return <span className="text-fg-muted">n/a</span>;
  if (m.mean == null) return <span className="text-caption text-fg-muted">{m.ci_reason ?? "not reported"}</span>;
  const interval = m.ci95 ? { lo: m.ci95[0], hi: m.ci95[1], coverage: null, method: "bootstrap-ci" as const } : null;
  const f = formatValue(m.mean, { interval, basis: "measured" });
  return (
    <span className="inline-flex flex-col items-end">
      <span className="font-semibold text-fg">{f.value}</span>
      <span className="text-caption text-fg-muted">{f.interval ?? (m.n_runs < CLONE_MIN_RUNS ? `no interval: n = ${m.n_runs} < ${CLONE_MIN_RUNS}` : (m.ci_reason ?? "no interval"))}</span>
    </span>
  );
}

function EffectCell({ row: r, domain, reference }: { row: CloneRow; domain: [number, number] | null; reference: string | null }) {
  const a = r.adjusted;
  if (r.isReference || a?.is_reference) return <span className="text-caption text-fg-muted">reference (0 by definition)</span>;
  if (!a || a.estimate == null || !a.ci95) {
    return (
      <span className="text-caption text-fg-muted">
        Not estimated: {a?.refusal?.reason ?? "the engine reported no adjusted effect"}
        {a?.refusal?.what_would_fix_it ? <span className="block">Fix: {a.refusal.what_would_fix_it}</span> : null}
      </span>
    );
  }
  const text = effectText(a);
  const x = (v: number) => (domain ? 6 + ((v - domain[0]) / (domain[1] - domain[0])) * (BAR_W - 12) : BAR_W / 2);
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-col gap-0.5">
        {domain ? (
          <svg width={BAR_W} height={16} className="shrink-0" role="img" aria-label={`${r.label}: ${text} relative to ${reference ?? "the reference"}`}>
            <line x1={x(0)} x2={x(0)} y1={1} y2={15} stroke="var(--chart-reference)" strokeWidth={1.25} strokeDasharray="1 3" strokeLinecap="round" />
            <IntervalBar orientation="horizontal" at={8} from={x(a.ci95[0])} to={x(a.ci95[1])} color="var(--chart-reference)" cap={6} />
            <DerivedDiamond x={x(a.estimate)} y={8} s={4.5} />
          </svg>
        ) : null}
        <span className="text-body whitespace-nowrap tabular-nums text-fg">{text}</span>
      </span>
      <span className="text-caption text-fg-muted">
        data weight {a.shrinkage_w != null ? formatValue(a.shrinkage_w, { quantity: "score" }).value : "n/a"}
        {a.mostly_pooled ? " · mostly pooled" : ""}
      </span>
    </span>
  );
}

function PredictedCell({ row: r }: { row: CloneRow }) {
  const p = r.predicted;
  if (!p || p.pred == null) {
    return <span className="text-caption text-fg-muted">Refused: {p?.refusal?.reason ?? "no prediction from the engine"}</span>;
  }
  const cov = coverageText(p.coverage);
  const interval = p.lo != null && p.hi != null ? { lo: p.lo, hi: p.hi, coverage: p.coverage ?? null, method: "conformal" as const } : null;
  const f = formatValue(p.pred, { interval, basis: "predicted" });
  const model = p.method === "gp_posterior";
  return (
    <span className="inline-flex flex-col items-end">
      <span className="text-accent">{f.value}</span>
      <span className="text-caption whitespace-nowrap text-fg-muted">{f.interval ?? "no band"}</span>
      {f.interval && cov ? <span className={cn("text-caption text-fg-muted", !model && "whitespace-nowrap")}>{`${cov} ${model ? "model band (not held-out calibrated)" : "held-out band"}`}</span> : null}
    </span>
  );
}

function comparisonTable(c: CloneComparison): DataTable {
  return {
    caption: "Per clone: measured, derived (adjusted) and predicted values as the engine reported them",
    columns: ["Clone", "Runs", "Recipes", "Measured mean", "Interval", "Adjusted effect", "Data weight", "Predicted at reference", "Predicted band", "Flags"],
    rows: c.rows.map((r) => [
      r.label,
      r.nRuns,
      r.nRecipes ?? "n/a",
      r.measured?.mean != null ? formatValue(r.measured.mean).value : "n/a",
      r.measured?.ci95 ? `[${formatValue(r.measured.ci95[0]).value}, ${formatValue(r.measured.ci95[1]).value}]` : (r.measured?.ci_reason ?? "n/a"),
      r.isReference ? "reference" : (effectText(r.adjusted) ?? `not estimated: ${r.adjusted?.refusal?.reason ?? "n/a"}`),
      r.adjusted?.shrinkage_w != null ? formatValue(r.adjusted.shrinkage_w, { quantity: "score" }).value : "n/a",
      r.predicted?.pred != null ? formatValue(r.predicted.pred).value : `refused: ${r.predicted?.refusal?.reason ?? "n/a"}`,
      r.predicted?.lo != null && r.predicted?.hi != null ? `[${formatValue(r.predicted.lo).value}, ${formatValue(r.predicted.hi).value}] ${coverageText(r.predicted.coverage) ?? ""} ${r.predicted.method ?? ""}`.trim() : "n/a",
      r.flags.join(", ") || "none",
    ]),
  };
}
