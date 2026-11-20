"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { BAND_SOURCE_LABEL, bandMissingText, enginePrediction, runBand, type BandAnalysis } from "@/components/campaign/learn";
import { clampPage, formatRecipeValue, inlineRecipeKeys, nextSort, RUN_PAGE_SIZE, sortRuns, type RunSort, type RunSortKey } from "@/components/campaign/stage-logic";
import { formatTimestamp } from "@/components/kit/source-line";
import { ModeBadge } from "@/components/ui/badge";
import { SortableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TablePagination } from "@/components/ui/table";
import { Num, SourceButton } from "@/components/viz/num";
import type { CampaignRun } from "@/lib/api";
import { displayRound } from "@/lib/campaign-stage";
import { columnDecimals, coverageText, formatValue, type IntervalSpec } from "@/lib/num";
import { sourceFromRun } from "@/lib/source";
import { shortId } from "@/lib/workbench";
import { RunClone } from "@/components/campaign/run-clone";
import type { CloneKey } from "@/lib/viz-data/clones";
import { cn } from "@/lib/utils";

/**
 * Runs in the lab: each awaiting run's recipe and the engine's prediction with
 * the band it recorded when the run started (a separate "[lo, hi]" column
 * labelled with the engine's coverage; legacy runs show the current
 * analysis' band, marked as such). A run whose recipe was not one of the
 * engine's proposals has no engine prediction: the engine's reason is shown,
 * and the stored number is labelled as the user's, never as the engine's. Read-only; results are
 * entered in the Record section. Sortable, paged at 10, the full recipe one
 * click on a row. Setpoints print at the precision their search range
 * supports. The model's own std is never shown here.
 */
export function RunsTable({
  runs,
  drivers,
  analysis,
  featureRanges,
  target,
  unit,
  clone = null,
}: {
  runs: CampaignRun[];
  drivers: readonly string[];
  /** The current analysis (for the band), or null when there is none. */
  analysis: BandAnalysis | null;
  /** The analysis' `feature_ranges` (setpoint precision); absent on older engines. */
  featureRanges?: Record<string, [number, number]> | null;
  target: string;
  unit: string | null;
  /** The clone column and its chips (SV-G5), or null without one. */
  clone?: CloneKey | null;
}) {
  const [sort, setSort] = useState<RunSort>(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const sorted = sortRuns(runs, sort);
  const current = clampPage(page, sorted.length);
  const rows = sorted.slice(current * RUN_PAGE_SIZE, (current + 1) * RUN_PAGE_SIZE);
  const direction = (key: RunSortKey) => (sort?.key === key ? sort.direction : "none");
  const head = (key: RunSortKey, label: string, numeric = false) => (
    <SortableHead direction={direction(key)} numeric={numeric} onSort={() => setSort(nextSort(sort, key))}>
      {label}
    </SortableHead>
  );
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const bands = new Map(runs.map((r) => [r.id, runBand(r, analysis)]));
  const preds = new Map(runs.map((r) => [r.id, enginePrediction(r)]));
  // One decimal count for the whole column, so the decimal points line up (VIZ_SPEC 2.2 step 7).
  const decimals = columnDecimals(runs.filter((r) => preds.get(r.id) != null).map((r) => ({ value: preds.get(r.id) as number, u: bands.get(r.id)?.halfWidth ?? null })));
  const covs = [...new Set([...bands.values()].filter((b) => b.halfWidth != null).map((b) => b.coverage))];
  const cov = coverageText(covs.length === 1 ? covs[0] : null);
  const range = (k: string) => featureRanges?.[k] ?? null;

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {head("id", "Run")}
            <TableHead>Recipe</TableHead>
            {head("pred", `Predicted${unit ? ` (${unit})` : ""}`, true)}
            <TableHead numeric>{cov ? `${cov} band` : "Band"}</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>
              <span className="sr-only">Source</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const expanded = open.has(r.id);
            const band = bands.get(r.id) ?? runBand(r, analysis);
            const pred = preds.get(r.id) ?? null;
            const interval: IntervalSpec | null = band.halfWidth != null ? { lo: band.lo, hi: band.hi, coverage: band.coverage, method: "conformal" } : null;
            const bandText = interval && pred != null ? formatValue(pred, { interval, decimals }).interval : null;
            const missing = bandMissingText(band);
            return (
              <Fragment key={r.id}>
                <TableRow id={`run-${r.id}`} className="scroll-mt-12">
                  <TableCell className="font-mono text-code" title={r.id}>
                    {shortId(r.id)}
                    <RunClone run={r} clone={clone} />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`Full recipe for run ${shortId(r.id)}`}
                      onClick={() => toggle(r.id)}
                      className="-mx-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-subtle"
                    >
                      <ChevronRight className={cn("size-4 shrink-0 text-fg-muted transition-transform", expanded && "rotate-90")} aria-hidden />
                      {inlineRecipeKeys(r.recipe, drivers).map((k) => (
                        <span key={k} className="mr-2 text-fg-muted">
                          {k} <span className="text-fg tabular-nums">{formatRecipeValue(r.recipe[k], range(k))}</span>
                        </span>
                      ))}
                    </button>
                  </TableCell>
                  <TableCell numeric>
                    {pred != null ? (
                      <Num value={pred} basis="predicted" options={{ decimals }} />
                    ) : (
                      <span className="text-caption text-fg-muted" title={missing ?? undefined}>
                        No engine prediction
                      </span>
                    )}
                  </TableCell>
                  <TableCell numeric className="text-caption text-fg-muted tabular-nums" title={missing ?? (band.source ? BAND_SOURCE_LABEL[band.source] : undefined)}>
                    {bandText ?? (pred == null ? "n/a" : "band n/a")}
                    {bandText && band.source === "current-analysis" ? <span className="block">current analysis</span> : null}
                  </TableCell>
                  <TableCell className="text-caption text-fg-muted tabular-nums">
                    {r.round != null ? `Round ${formatValue(displayRound(r.round), { quantity: "count" }).text}, ` : ""}
                    {formatTimestamp(r.created_at)}
                  </TableCell>
                  <TableCell className="w-8 px-1">
                    <SourceButton source={sourceFromRun({ target }, r, "predicted")} full={String(r.pred)} />
                  </TableCell>
                </TableRow>
                {expanded ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-auto whitespace-normal bg-subtle">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        <ModeBadge mode={r.mode} />
                        {Object.entries(r.recipe).map(([k, v]) => (
                          <span key={k} className="text-fg-muted">
                            {k} <span className="text-fg tabular-nums">{formatRecipeValue(v, range(k))}</span>
                          </span>
                        ))}
                      </div>
                      {missing ? <p className="mt-2 text-caption text-fg-muted">{missing}</p> : null}
                      {pred == null && Number.isFinite(r.pred) ? (
                        <p className="mt-1 text-caption text-fg-muted">
                          Your prediction, not the engine&apos;s: <span className="text-fg tabular-nums">{formatValue(r.pred).text}</span>
                        </p>
                      ) : null}
                      {band.source ? <p className="mt-2 text-caption text-fg-muted">Band: {BAND_SOURCE_LABEL[band.source]}.</p> : null}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      {sorted.length > RUN_PAGE_SIZE ? <TablePagination page={current} pageSize={RUN_PAGE_SIZE} total={sorted.length} onPageChange={setPage} /> : null}
    </div>
  );
}
