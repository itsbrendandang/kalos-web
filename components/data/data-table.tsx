"use client";

// The rows of a run sheet, as read in the browser: every column with its role under the name, sortable,
// filterable, paged at 25, the best run pinned at the top. The table says what is in the sheet and nothing
// more: "Best" is the largest target value, replicate captions count rows that share every input, and the
// origin badge repeats the sheet's own `data_type` word or the campaign round a row came from.

import { useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TablePagination } from "@/components/ui/table";
import { dataNumber } from "@/components/campaign/data/svg";
import { cellText, filterRows, groupSizes, nextSort, sortRows, type SortState, type TableColumn, type TableRow as DataRow } from "@/components/data/rows";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const DEFAULT_PAGE_SIZE = 25;
const ALL_LEVELS = "";

export type DataTableProps = {
  columns: TableColumn[];
  rows: DataRow[];
  /** The target column's name; sorted descending by default. */
  target: string;
  pageSize?: number;
};

/** The levels a category column offers in its filter, most common first. */
function levelsOf(rows: readonly DataRow[], column: number): string[] {
  const tally = new Map<string, number>();
  for (const r of rows) {
    const v = cellText(r.cells[column]);
    if (v !== "") tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  return [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
}

function originLabel(origin: string | null): string {
  return origin ?? "Sheet";
}

export function DataTable({ columns, rows, target, pageSize = DEFAULT_PAGE_SIZE }: DataTableProps) {
  const targetColumn = columns.findIndex((c) => c.name === target && c.role === "target");
  const [sort, setSort] = useState<SortState>(targetColumn >= 0 ? { column: targetColumn, direction: "descending" } : null);
  const [query, setQuery] = useState("");
  const [levels, setLevels] = useState<Record<number, string>>({});
  const [page, setPage] = useState(0);
  const filterId = useId();

  // The sheet's own data_type column is shown as the origin badge, not as a raw column.
  const shown = columns.map((c, i) => ({ ...c, i })).filter((c) => c.role !== "origin");
  const categories = shown.filter((c) => c.kind === "category");
  const hasOrigin = rows.some((r) => r.origin != null);
  const sizes = useMemo(() => groupSizes(rows), [rows]);

  const filtered = useMemo(() => filterRows(rows, { query, levels }), [rows, query, levels]);
  const sorted = useMemo(() => sortRows(filtered, sort, targetColumn), [filtered, sort, targetColumn]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const slice = sorted.slice(current * pageSize, (current + 1) * pageSize);
  // The best run is pinned above the page unless it already leads it (the default target sort), so it is never shown twice in a row.
  const best = filtered.find((r) => r.best) ?? null;
  const pinned = best && slice[0] !== best ? best : null;

  const direction = (i: number) => (sort?.column === i ? sort.direction : "none");
  const changeLevel = (column: number, value: string) => {
    setLevels((l) => ({ ...l, [column]: value }));
    setPage(0);
  };

  const renderRow = (r: DataRow, key: string, pinnedCopy: boolean) => (
    <TableRow key={key} className={cn(pinnedCopy && "bg-subtle hover:bg-subtle")}>
      <TableCell numeric className="text-fg-muted">
        <span className="flex items-center justify-end gap-2">
          {r.best ? <Badge tone="good">Best</Badge> : null}
          {r.group != null && sizes.get(r.group) ? <span className="text-caption text-fg-muted">repeated x{sizes.get(r.group)}</span> : null}
          <span>{formatNumber(r.index + 1, "count")}</span>
        </span>
      </TableCell>
      {shown.map((c) => {
        const v = r.cells[c.i];
        const numeric = c.kind === "numeric";
        return (
          <TableCell key={c.name} numeric={numeric} className={cn(v == null && "text-fg-muted", c.i === targetColumn && "font-medium text-fg")}>
            {v == null ? "blank" : numeric && typeof v === "number" ? dataNumber(v) : String(v)}
          </TableCell>
        );
      })}
      {hasOrigin ? (
        <TableCell>
          <Badge tone="neutral" variant={r.origin ? "soft" : "outline"}>
            {originLabel(r.origin)}
          </Badge>
        </TableCell>
      ) : null}
    </TableRow>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={filterId} className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5 text-label text-fg">
          Filter rows
          <Input
            id={filterId}
            type="search"
            value={query}
            placeholder="Any value in any column"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        {categories.map((c) => (
          <label key={c.name} className="flex min-w-0 flex-col gap-1.5 text-label text-fg">
            <span className="font-mono text-code">{c.name}</span>
            <Select value={levels[c.i] ?? ALL_LEVELS} onValueChange={(v) => changeLevel(c.i, typeof v === "string" ? v : ALL_LEVELS)}>
              <SelectTrigger className="w-full sm:w-48" aria-label={`Level of ${c.name}`}>
                <SelectValue placeholder="All levels">{(v: string) => (v === ALL_LEVELS ? "All levels" : v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LEVELS}>All levels</SelectItem>
                {levelsOf(rows, c.i).map((lv) => (
                  <SelectItem key={lv} value={lv}>
                    {lv}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ))}
      </div>
      <p className="text-caption tabular-nums text-fg-muted" aria-live="polite">
        {formatNumber(filtered.length, "count")} of {formatNumber(rows.length, "count")} rows
      </p>
      <Table containerClassName="max-h-[600px] rounded-xl border border-border" className="bg-surface">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead numeric className="bg-surface">
              Row
            </TableHead>
            {/* The sort arrow sits beside the name: the primitive's numeric layout would float it left of the two-line header. */}
            {shown.map((c) => (
              <SortableHead key={c.name} direction={direction(c.i)} onSort={() => setSort(nextSort(sort, c.i, targetColumn))} className={cn("h-auto bg-surface py-2 align-top", c.kind === "numeric" && "text-right")}>
                <span className={cn("flex flex-col gap-1", c.kind === "numeric" ? "items-end" : "items-start")}>
                  <span className="font-mono text-code text-fg">{c.name}</span>
                  <Badge tone={c.role === "target" ? "accent" : "neutral"} variant={c.role === "input" || c.role === "target" ? "soft" : "outline"}>
                    {c.roleWords}
                  </Badge>
                </span>
              </SortableHead>
            ))}
            {hasOrigin ? <TableHead className="bg-surface">From</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pinned ? renderRow(pinned, "pinned-best", true) : null}
          {slice.map((r) => renderRow(r, `row-${r.index}`, false))}
          {sorted.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={shown.length + 1 + (hasOrigin ? 1 : 0)} className="text-fg-muted">
                {rows.length === 0 ? "This sheet has no run rows." : "No rows match the filter."}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <TablePagination page={current} pageSize={pageSize} total={sorted.length} onPageChange={setPage} />
    </div>
  );
}
