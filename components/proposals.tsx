import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, num } from "@/lib/utils";

type Row = { vals: number[]; mode: "explore" | "exploit"; reason: string };

/** Explore/exploit label. Mode is never conveyed by color alone - the text
 *  label itself is the primary signal; the fill is a secondary reinforcement. */
function ModeBadge({ mode }: { mode: "explore" | "exploit" }) {
  return (
    <Badge
      variant={mode === "exploit" ? "default" : "secondary"}
      className={cn(
        "rounded-full text-[10px] font-semibold uppercase",
        mode === "exploit" ? "bg-accent text-[color:var(--primary-foreground)]" : "bg-explore-soft text-explore-deep",
      )}
    >
      {mode}
    </Badge>
  );
}

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
    <Table className="tabular min-w-[620px] border-separate border-spacing-y-1 font-mono text-xs">
      <TableHeader>
        <TableRow className="border-b-0 hover:bg-transparent">
          <TableHead className="h-auto px-2 py-1.5 text-left text-[10px] font-semibold text-muted uppercase"></TableHead>
          {cols.map((c) => (
            <TableHead key={c} className="h-auto px-2 py-1.5 text-right text-[10px] font-semibold text-muted uppercase">
              {c}
            </TableHead>
          ))}
          <TableHead className="h-auto px-2 py-1.5 text-right text-[10px] font-semibold text-muted uppercase">{predHead}</TableHead>
          <TableHead className="h-auto px-2 py-1.5 text-left text-[10px] font-semibold text-muted uppercase">why</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i} className="group border-b-0 hover:bg-transparent">
            <TableCell className="rounded-l-xl border-y border-l border-border/70 bg-card px-2 py-2 text-left text-muted group-hover:bg-blue-soft">
              #{i + 1}
            </TableCell>
            {r.vals.map((v, j) => (
              <TableCell key={j} className="border-y border-border/70 bg-card px-2 py-2 text-right group-hover:bg-blue-soft">
                {num(v, 2)}
              </TableCell>
            ))}
            <TableCell className="border-y border-border/70 bg-card px-2 py-2 text-right font-semibold text-fg group-hover:bg-blue-soft">
              {predFn(r)}
            </TableCell>
            <TableCell className="rounded-r-xl border-y border-r border-border/70 bg-card px-2 py-2 text-left whitespace-normal group-hover:bg-blue-soft">
              <span className="inline-flex items-center gap-1.5">
                <ModeBadge mode={r.mode} />
                <span className="font-sans text-muted">{r.reason}</span>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
