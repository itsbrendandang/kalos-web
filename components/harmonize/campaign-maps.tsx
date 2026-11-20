"use client";

import { useMemo, useState } from "react";
import { Section } from "@/components/kit/section";
import { Button } from "@/components/ui/button";
import { useRowsExport } from "@/components/report/report-data";
import { CloneOutcomeHeatmap } from "@/components/viz/charts/clone-outcome-heatmap";
import { CoverageMatrixChart } from "@/components/viz/charts/coverage-matrix";
import { DataQualityHeatmap } from "@/components/viz/charts/data-quality-heatmap";
import { ChartFrame } from "@/components/viz/frame";
import type { PopulatedResult } from "@/lib/api";
import { formatValue } from "@/lib/num";
import { sourceFromAnalysis } from "@/lib/source";
import { toCloneOutcomeGrid } from "@/lib/viz-data/clones";
import {
  coverageInputs,
  DEFAULT_COVERAGE_INPUTS,
  exportRows,
  idColumnOf,
  MAX_COVERAGE_INPUTS,
  MIN_COVERAGE_ROWS,
  toCoverageMatrix,
} from "@/lib/viz-data/coverage-matrix";
import { toDataQuality } from "@/lib/viz-data/data-quality";
import { cn } from "@/lib/utils";

/*
 * Harmonize's heatmaps: what is in the sheet's cells (H5), how the clones
 * compare measured (SV-G1, in place of H4 for a clone column), and where the
 * runs sit in the search box (H2). Each one only from engine fields; the
 * coverage matrix reads the raw rows on request, because the engine records
 * every row export in the campaign's audit log.
 */

const count = (n: number | null | undefined) => formatValue(n, { quantity: "count" }).text;

export function DataQualityPanel({ analysis }: { analysis: PopulatedResult }) {
  const data = useMemo(() => toDataQuality(analysis), [analysis]);
  if (!data) return null;
  return <DataQualityHeatmap data={data} source={sourceFromAnalysis(analysis, "provenance, data_drops, validation", "derived")} />;
}

export function CloneOutcomeSection({ analysis }: { analysis: PopulatedResult }) {
  const grid = useMemo(() => toCloneOutcomeGrid(analysis.strain_summary), [analysis.strain_summary]);
  const s = analysis.strain_summary;
  if (!grid) {
    if (!s) return null;
    return (
      <Section id="clones" title="Runs by clone" description="Per-clone results appear here once the campaign has a clone or strain column.">
        <p className="text-body text-fg-muted">{s.available === false ? `No clone column: ${s.reason}.` : "The engine returned no clones."}</p>
      </Section>
    );
  }
  return (
    <Section id="clones" title="Runs by clone" description={`What each clone measured (clone column ${grid.column}), outcome by outcome. Measured only: the process-adjusted comparison is on Predict.`}>
      <CloneOutcomeHeatmap grid={grid} source={sourceFromAnalysis(analysis, "strain_summary.levels[].outcomes", "measured")} />
    </Section>
  );
}

export function CoverageSection({ analysis, campaignId }: { analysis: PopulatedResult; campaignId: string }) {
  const rows = useRowsExport(campaignId);
  const [inputs, setInputs] = useState(DEFAULT_COVERAGE_INPUTS);
  const [filter, setFilter] = useState<"all" | "rounds">("all");
  const candidates = useMemo(() => coverageInputs(analysis), [analysis]);
  const all = useMemo(() => (rows.status === "loaded" ? exportRows(rows.data, idColumnOf(analysis)) : []), [rows, analysis]);
  const matrix = useMemo(() => (rows.status === "loaded" ? toCoverageMatrix(analysis, all, { inputs, filter }) : null), [rows.status, analysis, all, inputs, filter]);
  const nRounds = all.filter((r) => r.origin === "round").length;
  const source = sourceFromAnalysis(analysis, "export/rows, feature_ranges", "measured");
  const title = "Where your runs are";

  const actions =
    rows.status === "loaded" ? (
      <div className="flex flex-wrap items-center gap-2">
        {candidates.length > DEFAULT_COVERAGE_INPUTS ? (
          <Button variant="outline" size="sm" onClick={() => setInputs((n) => (n > DEFAULT_COVERAGE_INPUTS ? DEFAULT_COVERAGE_INPUTS : MAX_COVERAGE_INPUTS))}>
            {inputs > DEFAULT_COVERAGE_INPUTS ? `Top ${DEFAULT_COVERAGE_INPUTS} inputs` : `All ${Math.min(candidates.length, MAX_COVERAGE_INPUTS)} inputs`}
          </Button>
        ) : null}
        {nRounds > 0 ? (
          <div role="radiogroup" aria-label="Which runs" className="inline-flex rounded-lg border border-border p-0.5">
            {(["all", "rounds"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={cn("rounded-md px-2 py-1 text-caption", filter === f ? "bg-subtle text-fg" : "text-fg-muted hover:text-fg")}
              >
                {f === "all" ? "All runs" : `Added by Kalos rounds (${count(nRounds)})`}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    ) : null;

  let body;
  if (candidates.length < 2) {
    body = (
      <ChartFrame title={title} state={{ kind: "insufficient", text: `A coverage matrix needs at least 2 numeric inputs with a search box; this analysis has ${count(candidates.length)}.` }}>
        {() => null}
      </ChartFrame>
    );
  } else if (rows.status === "idle") {
    body = (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-panel">
        <p className="text-body text-fg">
          Counts your runs in 8 equal bins across each input&apos;s search box, for the top {count(Math.min(DEFAULT_COVERAGE_INPUTS, candidates.length))} inputs, so the empty combinations show.
        </p>
        <p className="text-caption text-fg-muted">This reads your rows from the engine, which records the read in the campaign&apos;s audit log as an export.</p>
        <Button variant="outline" size="sm" onClick={rows.reload}>
          Load the runs
        </Button>
      </div>
    );
  } else if (rows.status === "loading") {
    body = (
      <ChartFrame title={title} state={{ kind: "loading" }} height={420}>
        {() => null}
      </ChartFrame>
    );
  } else if (rows.status === "unavailable") {
    const refused = rows.code === "anonymized_export_unavailable";
    body = (
      <ChartFrame
        title={title}
        state={
          refused
            ? { kind: "refused", reasons: [rows.reason], fix: ["Export the rows without anonymization, or view this chart in a campaign that was not anonymized."] }
            : rows.code === "export_too_large"
              ? { kind: "insufficient", text: "Too many cells to chart here; download the rows from the Report instead." }
              : { kind: "error", onRetry: rows.reload }
        }
      >
        {() => null}
      </ChartFrame>
    );
  } else if (matrix && matrix.nPlaced < MIN_COVERAGE_ROWS) {
    body = (
      <ChartFrame title={title} state={{ kind: "insufficient", text: `A coverage matrix needs ${count(MIN_COVERAGE_ROWS)} runs with every shown input inside the search box; ${count(matrix.nPlaced)} qualify.` }}>
        {() => null}
      </ChartFrame>
    );
  } else if (matrix) {
    body = <CoverageMatrixChart data={matrix} source={source} actions={actions} />;
  }

  return (
    <Section id="coverage" title="Coverage of the design space" description="Which combinations of inputs your runs cover, and where the proposed batch goes. Counts of runs, no model.">
      {body}
    </Section>
  );
}
