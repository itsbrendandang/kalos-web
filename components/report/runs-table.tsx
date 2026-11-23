import { isCallerPrediction } from "@/components/campaign/learn";
import { formatTimestamp } from "@/components/kit/source-line";
import { ModeBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LegendItem } from "@/components/viz/frame";
import { BasisGlyph, NumState } from "@/components/viz/num";
import { displayRound } from "@/lib/campaign-stage";
import { columnDecimals, coverageText, formatInterval, formatSetting, formatValue } from "@/lib/num";
import { startBand, type PackageRun, type Setpoint } from "@/lib/report-package";
import { cn } from "@/lib/utils";

/** The band recorded at start, in words, for the In band cell's tooltip. */
function startBandTitle(r: PackageRun): string | undefined {
  const b = startBand(r);
  if (b) return `Band recorded at start: ${formatInterval({ ...b, method: "conformal" })} (${coverageText(b.coverage) ?? "coverage n/a"})`;
  const p = r.prediction_at_start;
  if (p && p.available === false) return p.reason;
  return undefined;
}

/** The predicted value's tooltip: where it came from, with the engine's reason when it did not record its own. */
function predictedTitle(r: PackageRun): string {
  if (!isCallerPrediction(r)) {
    return r.prediction_at_start
      ? "The engine's prediction, recorded when the run started."
      : "The prediction stored with the run, which predates the engine recording its source.";
  }
  const p = r.prediction_at_start;
  const why = p && p.available === false ? p.reason?.trim().replace(/\.$/, "") : "";
  return `Supplied when the run was started, not the engine's recorded prediction.${why ? ` Engine: ${why}.` : ""}`;
}

/**
 * Every started run. Measured is the first column, semibold ink with a filled
 * dot; predicted comes after it, regular weight, beside its 1-sigma SD and who
 * supplied both: only the engine's predictions carry the model's hollow ring.
 * A value the engine did not record as its own (`isCallerPrediction`, as on
 * Validate) is labelled as supplied at start, never as the model's.
 * Runs started on an engine that records the prediction at start also show the engine's residual and whether the result fell inside
 * the band recorded then (both computed by the engine). The unit sits in the column header, never in the cells, and
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
  const residuals = runs.map((r) => r.residual).filter((v): v is number => v != null);
  const rDec = columnDecimals(residuals.map((value) => ({ value, u: null })));
  const withStart = runs.some((r) => r.prediction_at_start != null);
  const anyEngine = runs.some((r) => !isCallerPrediction(r));
  const anySupplied = runs.some(isCallerPrediction);
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
        {anyEngine ? <LegendItem mark="predicted">predicted by the engine&apos;s model</LegendItem> : null}
        {anySupplied ? <span>Supplied at start: sent with the run when it started, not the engine&apos;s recorded prediction</span> : null}
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
              Predicted{u}
            </TableHead>
            <TableHead
              className="bg-surface"
              numeric
              title="1-sigma SD that came with the predicted value: the model's for engine predictions, otherwise the one supplied at start"
            >
              SD{u}
            </TableHead>
            <TableHead className="bg-surface">Predicted by</TableHead>
            {withStart ? (
              <>
                <TableHead className="bg-surface" numeric title="Measured minus the prediction the engine recorded when the run started">
                  Residual{u}
                </TableHead>
                <TableHead className="bg-surface" title="Whether the measured value fell inside the band the engine recorded when the run started">
                  In band at start
                </TableHead>
              </>
            ) : null}
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
          {runs.map((r) => {
            const supplied = isCallerPrediction(r);
            const predTitle = predictedTitle(r);
            return (
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
                <TableCell numeric className="font-normal text-fg" title={predTitle}>
                  {!supplied ? (
                    <span className="inline-flex items-center gap-1.5">
                      <BasisGlyph basis="predicted" />
                      {formatValue(r.predicted.value, { decimals: pDec, basis: "predicted" }).value}
                    </span>
                  ) : (
                    formatValue(r.predicted.value, { decimals: pDec }).value
                  )}
                </TableCell>
                <TableCell numeric className="text-fg-muted">
                  {formatValue(r.predicted.sd, { decimals: sDec }).value}
                </TableCell>
                <TableCell className={supplied ? "text-fg-muted" : "text-fg"} title={predTitle}>
                  {supplied ? "Supplied at start" : "Engine model"}
                </TableCell>
                {withStart ? (
                  <>
                    <TableCell numeric className="text-fg">
                      {formatValue(r.residual, { decimals: rDec, sign: true }).value}
                    </TableCell>
                    <TableCell className={r.inside_band == null ? "text-fg-muted" : "text-fg"} title={startBandTitle(r)}>
                      {r.inside_band == null ? "n/a" : r.inside_band ? "Inside" : "Outside"}
                    </TableCell>
                  </>
                ) : null}
                <TableCell className="font-mono text-code text-fg-muted" title={r.id}>
                  {r.id.slice(0, 8)}
                </TableCell>
                <TableCell numeric>{r.round != null ? formatValue(displayRound(r.round), { quantity: "count" }).text : "n/a"}</TableCell>
                <TableCell numeric className="text-fg-muted">
                  {r.measured?.version != null ? `v${formatValue(r.measured.version, { quantity: "count" }).text}` : "n/a"}
                </TableCell>
                <TableCell>{r.mode === "exploit" || r.mode === "explore" ? <ModeBadge mode={r.mode} /> : <span className="text-fg-muted">n/a</span>}</TableCell>
                {recipeKeys.map((k) => (
                  <TableCell
                    key={k}
                    numeric={typeof r.recipe[k] !== "string"}
                    className={cn("print:whitespace-normal", r.recipe[k] == null && "text-fg-muted")}
                  >
                    {setpoint(k, r.recipe[k])}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
