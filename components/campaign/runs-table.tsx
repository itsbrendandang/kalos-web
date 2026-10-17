"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, ModeBadge } from "@/components/ui/badge";
import { SortableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TablePagination } from "@/components/ui/table";
import type { CampaignRun } from "@/lib/api";
import { formatBand, formatNumber } from "@/lib/format";
import { shortId } from "@/lib/workbench";
import { cn } from "@/lib/utils";
import { clampPage, inlineRecipeKeys, nextSort, RUN_PAGE_SIZE, sortRuns, type RunSort, type RunSortKey } from "@/components/campaign/stage-logic";

/**
 * This round's runs: sortable, paged at 10, the full recipe one click on a
 * row. `band` is the analysis' conformal half-width with its coverage; the
 * model's own std is never shown here.
 */
export function RunsTable({
  runs,
  drivers,
  band,
}: {
  runs: CampaignRun[];
  drivers: readonly string[];
  band: { halfWidth: number; coverage?: number } | null;
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
            {head("pred", "Predicted", true)}
            {head("result", "Measured", true)}
            {head("status", "Status")}
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const expanded = open.has(r.id);
            return (
              <Fragment key={r.id}>
                <TableRow id={`run-${r.id}`} className="scroll-mt-12">
                  <TableCell className="font-mono text-code">{shortId(r.id)}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      aria-expanded={expanded}
                                      onClick={() => toggle(r.id)}
                      className="-mx-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-subtle"
                    >
                      <ChevronRight className={cn("size-4 shrink-0 text-fg-muted transition-transform", expanded && "rotate-90")} aria-hidden />
                      {inlineRecipeKeys(r.recipe, drivers).map((k) => (
                        <span key={k} className="mr-2 text-fg-muted">
                          {k} <span className="text-fg tabular-nums">{formatNumber(r.recipe[k])}</span>
                        </span>
                      ))}
                      <span className="sr-only">full recipe for run {shortId(r.id)}</span>
                    </button>
                  </TableCell>
                  <TableCell numeric>
                    {formatNumber(r.pred)}
                    {band ? <span className="ml-2 text-caption text-fg-muted">{formatBand(band.halfWidth, band.coverage)}</span> : null}
                  </TableCell>
                  <TableCell numeric>{formatNumber(r.result)}</TableCell>
                  <TableCell>
                    <Badge tone={r.awaiting ? "warn" : "good"}>{r.awaiting ? "Awaiting" : "Measured"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/campaign/record#record-${r.id}`} className="text-label text-accent hover:underline">
                      {r.awaiting ? "Record result" : "Correct result"}
                    </Link>
                  </TableCell>
                </TableRow>
                {expanded ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-auto whitespace-normal bg-subtle">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        <ModeBadge mode={r.mode} />
                        {Object.entries(r.recipe).map(([k, v]) => (
                          <span key={k} className="text-fg-muted">
                            {k} <span className="text-fg tabular-nums">{formatNumber(v)}</span>
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      <TablePagination page={current} pageSize={RUN_PAGE_SIZE} total={sorted.length} onPageChange={setPage} />
    </div>
  );
}
