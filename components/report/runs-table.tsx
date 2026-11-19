import { formatTimestamp } from "@/components/kit/source-line";
import { ModeBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LegendItem } from "@/components/viz/frame";
import { BasisGlyph, NumState } from "@/components/viz/num";
import { displayRound } from "@/lib/campaign-stage";
import { columnDecimals, formatSetting, formatValue } from "@/lib/num";
import type { PackageRun, Setpoint } from "@/lib/report-package";
import { cn } from "@/lib/utils";

/**
 * Every started run. Measured is the first column, semibold ink with a filled
 * dot; predicted comes after it, regular weight with a hollow ring, beside the
 * model's 1-sigma SD (not a held-out interval: the engine does not store each
 * run's band). The unit sits in the column header, never in the cells, and
 * each numeric column shares one decimal count so the points align.
 */
export function RunsTable({ runs, unit, ranges }: { runs: PackageRun[]; unit?: string | null; ranges?: Record<string, [number, number]> | null }) {
  const recipeKeys = [...new Set(runs.flatMap((r) => Object.keys(r.recipe)))];
  const measured = runs.map((r) => r.measured?.value).filter((v): v is number => v != null);
  const preds = runs.map((r) => r.predicted.value).filter((v): v is number => v != null);
  const sds = runs.map((r) => r.predicted.sd).filter((v): v is number => v != null);
  const mDec = columnDecimals(measured.map((value) => ({ value, u: null })));
  const pDec = columnDecimals(preds.map((value) => ({ value, u: null })));
  const sDec = columnDecimals(sds.map((value) => ({ value, u: null })));
  const u = unit ? ` (${unit})` : "";
  const setpoint = (k: string, v: Setpoint | undefined) => {
    if (typeof v === "string") return v;
    if (v == null) return formatValue(null).text;
    const range = ranges?.[k] ?? null;
    return formatSetting(v, range).text;
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">
        <LegendItem mark="measured">measured in the lab</LegendItem>
        <LegendItem mark="predicted">predicted by the model</LegendItem>
      </p>
      <Table containerClassName="max-h-[480px] rounded-xl border border-border print:max-h-none print:overflow-visible" className="print:text-caption">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="bg-surface" numeric>
              <span className="inline-flex items-center gap-1.5">
                <BasisGlyph basis="measured" /> Measured{u}
              </span>
            </TableHead>
            <TableHead className="bg-surface" numeric>
              <span className="inline-flex items-center gap-1.5">
                <BasisGlyph basis="predicted" /> Predicted{u}
              </span>
            </TableHead>
            <TableHead className="bg-surface" numeric>
              Model SD{u}
            </TableHead>
            <TableHead className="bg-surface">Run</TableHead>
            <TableHead className="bg-surface" numeric>
              Round
            </TableHead>
            <TableHead className="bg-surface" numeric>
              Version
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
              <TableCell numeric title={r.measured?.recorded_at != null ? `Recorded ${formatTimestamp(r.measured.recorded_at)}` : undefined}>
                {r.measured?.value != null ? (
                  <span className="font-semibold text-fg">{formatValue(r.measured.value, { decimals: mDec, basis: "measured" }).value}</span>
                ) : r.status === "awaiting" ? (
                  <NumState state={{ kind: "pending" }} />
                ) : (
                  <NumState state={{ kind: "na" }} />
                )}
              </TableCell>
              <TableCell numeric className="font-normal text-fg">
                {formatValue(r.predicted.value, { decimals: pDec, basis: "predicted" }).value}
              </TableCell>
              <TableCell numeric className="text-fg-muted">
                {formatValue(r.predicted.sd, { decimals: sDec }).value}
              </TableCell>
              <TableCell className="font-mono text-code text-fg-muted" title={r.id}>
                {r.id.slice(0, 8)}
              </TableCell>
              <TableCell numeric>{r.round != null ? formatValue(displayRound(r.round), { quantity: "count" }).text : "n/a"}</TableCell>
              <TableCell numeric className="text-fg-muted">
                {r.measured?.version != null ? `v${formatValue(r.measured.version, { quantity: "count" }).text}` : "n/a"}
              </TableCell>
              <TableCell>{r.mode === "exploit" || r.mode === "explore" ? <ModeBadge mode={r.mode} /> : <span className="text-fg-muted">n/a</span>}</TableCell>
              {recipeKeys.map((k) => (
                <TableCell key={k} numeric={typeof r.recipe[k] !== "string"} className={cn("print:whitespace-normal", r.recipe[k] == null && "text-fg-muted")}>
                  {setpoint(k, r.recipe[k])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
