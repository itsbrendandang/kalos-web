import { ModeBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";

type Row = { vals: number[]; mode: "explore" | "exploit"; reason: string };

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
    <Table className="min-w-[620px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>
            <span className="sr-only">Rank</span>
          </TableHead>
          {cols.map((c) => (
            <TableHead key={c} numeric>
              {c}
            </TableHead>
          ))}
          <TableHead numeric>{predHead}</TableHead>
          <TableHead>Why</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="tabular-nums text-fg-muted">#{i + 1}</TableCell>
            {r.vals.map((v, j) => (
              <TableCell key={j} numeric>
                {formatNumber(v)}
              </TableCell>
            ))}
            <TableCell numeric className="font-medium text-fg">
              {predFn(r)}
            </TableCell>
            <TableCell className="whitespace-normal">
              <span className="inline-flex items-center gap-2">
                <ModeBadge mode={r.mode} />
                <span className="text-fg-muted">{r.reason}</span>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
