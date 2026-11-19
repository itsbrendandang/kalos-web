"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { PredictedValue } from "@/components/campaign/plan/marks";
import { BAND_MISSING, runBand, type BandAnalysis } from "@/components/campaign/learn";
import { clampPage, formatRecipeValue, inlineRecipeKeys, nextSort, RUN_PAGE_SIZE, sortRuns, type RunSort, type RunSortKey } from "@/components/campaign/stage-logic";
import { formatTimestamp } from "@/components/kit/source-line";
import { ModeBadge } from "@/components/ui/badge";
import { SortableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TablePagination } from "@/components/ui/table";
import type { CampaignRun } from "@/lib/api";
import { displayRound } from "@/lib/campaign-stage";
import { formatBand, formatNumber } from "@/lib/format";
import { shortId } from "@/lib/workbench";
import { cn } from "@/lib/utils";

/**
 * Runs in the lab: each awaiting run's recipe and its predicted value with the
 * conformal band of the analysis that proposed it. Read-only; results are
 * entered in the Record section. Sortable, paged at 10, the full recipe one
 * click on a row. The model's own std is never shown here.
 */
export function RunsTable({
  runs,
  drivers,
  analysis,
  unit,
}: {
  runs: CampaignRun[];
  drivers: readonly string[];
  /** The current analysis (for the band), or null when there is none. */
  analysis: BandAnalysis | null;
  unit: string;
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

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {head("id", "Run")}
            <TableHead>Recipe</TableHead>
            {head("pred", `Predicted${unit ? ` (${unit})` : ""}`, true)}
            <TableHead>Started</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const expanded = open.has(r.id);
            const band = runBand(r, analysis);
            return (
              <Fragment key={r.id}>
                <TableRow id={`run-${r.id}`} className="scroll-mt-12">
                  <TableCell className="font-mono text-code" title={r.id}>
                    {shortId(r.id)}
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
                          {k} <span className="text-fg tabular-nums">{formatRecipeValue(r.recipe[k])}</span>
                        </span>
                      ))}
                    </button>
                  </TableCell>
                  <TableCell numeric>
                    <PredictedValue value={formatNumber(r.pred)} hideLabel />
                    <span className="ml-2 text-caption text-fg-muted" title={band.why ? BAND_MISSING[band.why] : undefined}>
                      {band.halfWidth != null ? formatBand(band.halfWidth, band.coverage) : "band n/a"}
                    </span>
                  </TableCell>
                  <TableCell className="text-caption text-fg-muted tabular-nums">
                    {r.round != null ? `Round ${displayRound(r.round)}, ` : ""}
                    {formatTimestamp(r.created_at)}
                  </TableCell>
                </TableRow>
                {expanded ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="h-auto whitespace-normal bg-subtle">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        <ModeBadge mode={r.mode} />
                        {Object.entries(r.recipe).map(([k, v]) => (
                          <span key={k} className="text-fg-muted">
                            {k} <span className="text-fg tabular-nums">{formatRecipeValue(v)}</span>
                          </span>
                        ))}
                      </div>
                      {band.why ? <p className="mt-2 text-caption text-fg-muted">{BAND_MISSING[band.why]}</p> : null}
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
