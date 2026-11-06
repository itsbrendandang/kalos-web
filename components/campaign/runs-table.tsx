"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, ModeBadge } from "@/components/ui/badge";
import { SortableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TablePagination } from "@/components/ui/table";
import type { CampaignRun } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { likelyRange } from "@/lib/run-stage";
import { clampPage, nextSort, RUN_PAGE_SIZE, sortRuns, type RunSort, type RunSortKey } from "@/components/campaign/stage-logic";

/**
 * This round's runs with the same identity as on Plan: the P1..Pn label (lib/recipe-identity.ts), the
 * mode, then every input as its own column in the same order, the prediction, the measured value and the
 * status. Sortable, paged at 10. `band` is the analysis' likely range with its coverage; the model's own
 * std is never shown here.
 */
export function RunsTable({
  runs,
  columns,
  labels,
  band,
}: {
  runs: CampaignRun[];
  /** The recipe columns, in order (recipeColumns). */
  columns: readonly string[];
  /** The P1..Pn label of each run by id (runLabels). */
  labels: ReadonlyMap<string, string>;
  band: { halfWidth: number; coverage?: number } | null;
}) {
  const [sort, setSort] = useState<RunSort>(null);
  const [page, setPage] = useState(0);

  const sorted = sortRuns(runs, sort);
  const current = clampPage(page, sorted.length);
  const rows = sorted.slice(current * RUN_PAGE_SIZE, (current + 1) * RUN_PAGE_SIZE);
  const direction = (key: RunSortKey) => (sort?.key === key ? sort.direction : "none");
  const head = (key: RunSortKey, label: string, numeric = false) => (
    <SortableHead direction={direction(key)} numeric={numeric} onSort={() => setSort(nextSort(sort, key))}>
      {label}
    </SortableHead>
  );

  return (
    <div data-scroll-x className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {head("id", "Recipe")}
            {columns.map((c) => (
              <TableHead key={c} numeric className="font-mono text-code whitespace-nowrap">
                {c}
              </TableHead>
            ))}
            {head("pred", band ? `Predicted (${likelyRange(band.halfWidth)})` : "Predicted", true)}
            {head("result", "Measured", true)}
            {head("status", "Status")}
            <TableHead className="print:hidden">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} id={`run-${r.id}`} className="scroll-mt-12">
              <TableCell>
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <span className="font-mono text-code text-fg">{labels.get(r.id) ?? r.id}</span>
                  <ModeBadge mode={r.mode} />
                </span>
              </TableCell>
              {columns.map((c) => (
                <TableCell key={c} numeric className="tabular-nums whitespace-nowrap">
                  {c in r.recipe ? formatNumber(r.recipe[c]) : <span className="text-fg-muted">n/a</span>}
                </TableCell>
              ))}
              <TableCell numeric className="whitespace-nowrap">
                {formatNumber(r.pred)}
              </TableCell>
              <TableCell numeric>{r.result == null ? <span className="text-fg-muted">not yet</span> : formatNumber(r.result)}</TableCell>
              <TableCell>
                <Badge tone={r.awaiting ? "warn" : "good"}>{r.awaiting ? "Waiting for a result" : "Measured"}</Badge>
              </TableCell>
              <TableCell className="print:hidden">
                <Link href={`/campaign/record#record-${r.id}`} className="text-label text-accent hover:underline">
                  {r.awaiting ? "Record result" : "Change result"}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination page={current} pageSize={RUN_PAGE_SIZE} total={sorted.length} onPageChange={setPage} />
    </div>
  );
}
