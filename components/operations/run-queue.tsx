import { Tag } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { num } from "@/lib/utils";

export type QueueRow = {
  id: string;
  vessel?: string;
  recipe: { label: string; value: string }[];
  pred: { value: string; mode: "explore" | "exploit"; why: string };
};

/**
 * The "next batch to run" queue. Callers normalize either the real portal
 * proposals (getLatest()) or the mock queued PipelineRuns into `QueueRow`s,
 * so this component doesn't need to know which source it's rendering.
 * Read-only: starting a run lives in /decide, which sends the full recipe.
 */
export function RunQueue({ rows }: { rows: QueueRow[] }) {
  if (!rows.length) {
    return <p className="py-10 text-center text-[12px] text-muted">nothing queued</p>;
  }
  // Proposals aren't assigned to a vessel yet, so the column would be all "-".
  // Only show it when at least one row actually carries a vessel (e.g. mock
  // queued runs), otherwise it's dead placeholder noise.
  const showVessel = rows.some((r) => Boolean(r.vessel));
  return (
    <Table className="tabular min-w-[640px] font-mono text-xs">
      <TableCaption className="sr-only">Proposed next experiments, with predicted outcome and rationale</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {showVessel ? (
            <TableHead scope="col" className="text-[10px] text-muted uppercase">
              Vessel
            </TableHead>
          ) : null}
          <TableHead scope="col" className="text-[10px] text-muted uppercase">
            Recipe
          </TableHead>
          <TableHead scope="col" className="text-right text-[10px] text-muted uppercase">
            Predicted
          </TableHead>
          <TableHead scope="col" className="text-[10px] text-muted uppercase">
            Why
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            {showVessel ? <TableCell className="text-fg">{r.vessel ?? "-"}</TableCell> : null}
            <TableCell className="whitespace-normal text-muted">
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {r.recipe.map((c) => (
                  <span key={c.label}>
                    {c.label} <span className="font-semibold text-fg">{c.value}</span>
                  </span>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-right font-semibold text-fg">{r.pred.value}</TableCell>
            <TableCell className="whitespace-normal">
              <span className="inline-flex items-center gap-1.5">
                <Tag mode={r.pred.mode} />
                <span className="font-sans text-muted">{r.pred.why}</span>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Formats a predicted value ± sigma the same way the Results proposals
 *  table does (see components/proposals.tsx), for parity across both pages. */
export function fmtPredicted(value: number, sigma: number): string {
  return sigma > 0 ? `${num(value, 2)} ± ${num(sigma, 2)}` : num(value, 2);
}
