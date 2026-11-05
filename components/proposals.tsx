import { ModeBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";

type Row = { vals: number[]; mode: "explore" | "exploit"; reason: string };

/**
 * The proposed batch as a table: one row per recipe, the factor settings, the
 * predicted result and the reason it was proposed. Column names are the
 * factor names, so they stay in code type; everything else is plain text.
 */
export function Proposals<T extends Row>({
  cols,
  rows,
  predHead,
  predFn,
}: {
  cols: string[];
  rows: T[];
  predHead: string;
  predFn: (r: T) => string;
}) {
  return (
    <Table className="min-w-[620px] border-separate border-spacing-y-1 text-body tabular-nums">
      <TableHeader>
        <TableRow className="border-b-0 hover:bg-transparent">
          <TableHead className="h-auto px-2 py-1.5 text-left text-caption font-medium text-fg">Recipe</TableHead>
          {cols.map((c) => (
            <TableHead key={c} className="h-auto px-2 py-1.5 text-right font-mono text-caption font-medium text-fg">
              {c}
            </TableHead>
          ))}
          <TableHead className="h-auto px-2 py-1.5 text-right text-caption font-medium text-fg">{predHead}</TableHead>
          <TableHead className="h-auto px-2 py-1.5 text-left text-caption font-medium text-fg">Why</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i} className="group border-b-0 hover:bg-transparent">
            <TableCell className="rounded-l-xl border-y border-l border-border bg-surface px-2 py-2 text-left text-fg group-hover:bg-subtle">
              {i + 1}
            </TableCell>
            {r.vals.map((v, j) => (
              <TableCell key={j} className="border-y border-border bg-surface px-2 py-2 text-right text-fg group-hover:bg-subtle">
                {formatNumber(v)}
              </TableCell>
            ))}
            <TableCell className="border-y border-border bg-surface px-2 py-2 text-right font-medium text-fg group-hover:bg-subtle">
              {predFn(r)}
            </TableCell>
            <TableCell className="rounded-r-xl border-y border-r border-border bg-surface px-2 py-2 text-left whitespace-normal group-hover:bg-subtle">
              <span className="inline-flex items-center gap-1.5">
                <ModeBadge mode={r.mode} />
                <span className="text-fg">{r.reason}</span>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
