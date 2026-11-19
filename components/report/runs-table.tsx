import { MarkLegend, MeasuredMark, MeasuredValue, PredictedMark, PredictedValue } from "@/components/campaign/plan/marks";
import { formatTimestamp } from "@/components/kit/source-line";
import { ModeBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { displayRound } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";
import type { PackageRun, Setpoint } from "@/lib/report-package";

const setpoint = (v: Setpoint | undefined): string => (typeof v === "string" ? v : formatNumber(v ?? null));

/**
 * Every started run. Measured comes first and is drawn as a filled dot;
 * predicted is a hollow ring with its 1-sigma SD. They never share a column.
 */
export function RunsTable({ runs }: { runs: PackageRun[] }) {
  const recipeKeys = [...new Set(runs.flatMap((r) => Object.keys(r.recipe)))];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <MarkLegend />
      <Table containerClassName="max-h-[480px] rounded-xl border border-border print:max-h-none print:overflow-visible" className="print:text-caption">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="bg-surface">Run</TableHead>
            <TableHead className="bg-surface" numeric>
              Round
            </TableHead>
            <TableHead className="bg-surface">Status</TableHead>
            <TableHead className="bg-surface" numeric>
              <span className="inline-flex items-center gap-1.5">
                <MeasuredMark /> Measured
              </span>
            </TableHead>
            <TableHead className="bg-surface" numeric>
              Version
            </TableHead>
            <TableHead className="bg-surface" numeric>
              <span className="inline-flex items-center gap-1.5">
                <PredictedMark /> Predicted
              </span>
            </TableHead>
            <TableHead className="bg-surface" numeric>
              Predicted SD
            </TableHead>
            <TableHead className="bg-surface">Mode</TableHead>
            {recipeKeys.map((k) => (
              <TableHead key={k} className="bg-surface font-mono text-code print:whitespace-normal" numeric>
                {k}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-code text-fg-muted" title={r.id}>
                {r.id.slice(0, 8)}
              </TableCell>
              <TableCell numeric>{r.round != null ? displayRound(r.round) : "n/a"}</TableCell>
              <TableCell>{r.status === "measured" ? "Measured" : <span className="text-fg-muted">Awaiting result</span>}</TableCell>
              <TableCell numeric title={r.measured?.recorded_at != null ? `Recorded ${formatTimestamp(r.measured.recorded_at)}` : undefined}>
                {r.measured ? <MeasuredValue value={formatNumber(r.measured.value)} hideLabel /> : <span className="text-fg-muted">n/a</span>}
              </TableCell>
              <TableCell numeric className="text-fg-muted">
                {r.measured?.version != null ? `v${r.measured.version}` : "n/a"}
              </TableCell>
              <TableCell numeric>
                <PredictedValue value={formatNumber(r.predicted.value)} hideLabel />
              </TableCell>
              <TableCell numeric className="text-fg-muted">
                {formatNumber(r.predicted.sd)}
              </TableCell>
              <TableCell>{r.mode === "exploit" || r.mode === "explore" ? <ModeBadge mode={r.mode} /> : <span className="text-fg-muted">n/a</span>}</TableCell>
              {recipeKeys.map((k) => (
                <TableCell key={k} numeric={typeof r.recipe[k] !== "string"} className="print:whitespace-normal">
                  {setpoint(r.recipe[k])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
