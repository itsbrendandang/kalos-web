"use client";

import { useState, type ReactNode } from "react";
import { scaleLinear } from "@visx/scale";
import { XAxis, tickFormatter } from "@/components/viz/axes";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import { HitTarget, IntervalBar, MeasuredDot, OutsideGlyph, PendingDot, PredictedDot } from "@/components/viz/marks";
import { SourceButton } from "@/components/viz/num";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { Button } from "@/components/ui/button";
import { coverageText, formatValue } from "@/lib/num";
import { sourceFromRun, type Source } from "@/lib/source";
import { MAX_DUMBBELL_RUNS, MAX_FOCUSABLE_MARKS } from "@/lib/viz-thresholds";
import {
  bandCheck,
  bandMissingReason,
  bandSourceLabel,
  describeDumbbells,
  dumbbellDomain,
  dumbbellTable,
  fmtInterval,
  fmtMeasured,
  fmtPred,
  fmtResidual,
  hitRateText,
  paginateGroups,
  unscoredText,
  type DumbbellData,
  type DumbbellRun,
} from "@/lib/viz-data/validation-dumbbells";
import { shortId } from "@/lib/workbench";

/*
 * C10 ValidationDumbbells (VIZ_SPEC 5): one row per started run, grouped by
 * round, newest first. The predicted interval (the band the engine recorded
 * when the run started) is an accent bar with a hollow dot; the measured
 * result is a filled ink dot drawn last and larger (r=5 vs 4) so it outranks
 * the prediction; a thin muted connector joins them. The right-hand columns
 * give the engine's signed residual (measured − predicted) and the
 * inside/outside chip. Awaiting runs show the interval and a pending glyph.
 * A run without an engine prediction (its recipe was not proposed) shows the
 * measured dot only; a legacy run's current-analysis band is marked "*".
 */

const HEAD = 22;
const GROUP = 28;
const ROW = 30;
const AXIS = 52;

type Layout = { left: number; res: number; chip: number; x0: number; x1: number; wide: boolean };

function layout(width: number, band: boolean): Layout {
  const wide = width >= 560;
  const left = wide ? 150 : 64;
  // Narrow screens keep the plot readable: a shorter residual column and an icon-only band check (the word is in the tooltip and Data table).
  const res = wide ? 104 : 56;
  const chip = band ? (wide ? 92 : 22) : 0;
  return { left, res, chip, x0: left + 14, x1: Math.max(left + 60, width - res - chip - 18), wide };
}

export function ValidationDumbbells({
  data: d,
  target,
  unit,
  source,
  stale,
  width,
  title = "Predicted against measured",
  isStatic = false,
}: {
  data: DumbbellData;
  target: string;
  unit: string | null;
  /** The analysis the bands come from (footer and band provenance). */
  source: Source | null;
  stale?: { nNew: number; text?: ReactNode } | null;
  width?: number;
  title?: ReactNode;
  /** Report / print: no tooltips, no paging. */
  isStatic?: boolean;
}) {
  const [page, setPage] = useState(0);
  const { tip, markProps, close } = useChartTip();
  const pages = !isStatic && d.runs.length > MAX_DUMBBELL_RUNS ? paginateGroups(d.groups, MAX_DUMBBELL_RUNS) : [d.groups];
  const current = Math.min(page, pages.length - 1);
  const groups = pages[current] ?? [];
  const shown = groups.flatMap((g) => g.runs);
  const domain = dumbbellDomain(d.runs);
  const cov = coverageText(d.coverage);
  const height = HEAD + groups.reduce((h, g) => h + GROUP + g.runs.length * ROW, 0) + AXIS;
  const focusable = !isStatic && shown.length <= MAX_FOCUSABLE_MARKS;
  const description = describeDumbbells(d, { target, unit });

  const subtitle =
    d.runs.length > 0 && d.measured === 0
      ? `Results appear here as you record them.${d.bandNote ? ` ${d.bandNote}` : ""}`
      : d.bandAvailable
        ? `Each prediction carries its ${cov ? `${cov} ` : ""}held-out band. ${d.bandNote}`
        : "No run has a prediction band, so only the predictions are shown.";
  const unscored = d.hit ? unscoredText(d.hit) : null;

  const footer = (
    <>
      {d.hit && d.measured > 0 ? (
        <span className="block text-fg">
          Hit rate: {hitRateText(d.hit, d.coverage)}
          {d.hit.total > 0 ? ". Counts only runs with a band recorded when they started." : ""}
          {unscored ? ` ${unscored}` : ""}
          {d.meanAbsResidual != null ? (
            <span className="text-fg-muted"> · mean |measured − predicted| {formatValue(d.meanAbsResidual, { unit, decimals: d.decimals.residual }).text}</span>
          ) : null}
        </span>
      ) : d.meanAbsResidual != null ? (
        <span className="block text-fg">mean |measured − predicted| {formatValue(d.meanAbsResidual, { unit, decimals: d.decimals.residual }).text}</span>
      ) : null}
      {d.legacy > 0 ? <span className="block">* Band from the current analysis: the run was started before the engine recorded each run&apos;s band.</span> : null}
      {d.callerPredicted > 0 ? (
        <span className="block">
          {formatValue(d.callerPredicted, { quantity: "count" }).text} {d.callerPredicted === 1 ? "run has" : "runs have"} no engine prediction: the recipe was not one of its proposals, so only the measured value is drawn.
        </span>
      ) : null}
      <span className="block">
        From: {source?.label ?? "Campaign runs"} · n = {formatValue(d.runs.length, { quantity: "count" }).text} started
        {d.bandAvailable ? ` · held-out conformal band${cov ? ` (${cov})` : ""}, recorded per run at start` : ""}
        {source?.engineVersion ? ` · engine ${source.engineVersion}` : ""}
      </span>
    </>
  );

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      state={d.runs.length === 0 || !domain ? { kind: "empty", text: "No runs started yet. Start a batch from Predict." } : { kind: "ready" }}
      stale={stale}
      width={width}
      height={height}
      description={description}
      data={dumbbellTable(d, { unit })}
      footer={d.runs.length ? footer : null}
      legend={
        <>
          <LegendItem mark="measured">Measured</LegendItem>
          <LegendItem mark="predicted">{d.bandAvailable ? `Predicted (${cov ? `${cov} ` : ""}band recorded at start)` : "Predicted (no interval reported)"}</LegendItem>
          {d.awaiting > 0 ? <LegendItem mark="pending">Awaiting result</LegendItem> : null}
          {d.bandAvailable ? <LegendItem mark="outside">Outside the band</LegendItem> : null}
        </>
      }
    >
      {(w) => {
        if (!domain) return null;
        const L = layout(w, d.bandAvailable || d.callerPredicted > 0);
        const x = scaleLinear<number>({ domain, range: [L.x0, L.x1], nice: true });
        const ticks = x.ticks(L.wide ? 5 : 3);
        const fmt = tickFormatter(ticks);
        const resX = L.x1 + 18 + L.res - 8;
        const chipX = L.x1 + 18 + L.res + 4;
        const rows: ReactNode[] = [];
        let y = HEAD;
        for (const g of groups) {
          rows.push(
            <text key={`g-${g.round}`} x={0} y={y + GROUP - 9} className="fill-fg text-label" fontSize={13} fontWeight={500}>
              {g.round != null ? `Round ${formatValue(g.round, { quantity: "count" }).text}` : "Round not reported"}
              <tspan className="fill-fg-muted" fontWeight={400}>
                {`  ${formatValue(g.runs.length, { quantity: "count" }).text} ${g.runs.length === 1 ? "run" : "runs"}`}
              </tspan>
            </text>,
          );
          y += GROUP;
          for (const r of g.runs) {
            const cy = y + ROW / 2;
            rows.push(<RunRow key={r.id} r={r} d={d} cy={cy} x={(v) => x(v) ?? 0} L={L} unit={unit} resX={resX} chipX={chipX} target={target} focusable={focusable} isStatic={isStatic} markProps={markProps} />);
            y += ROW;
          }
        }
        const plotBottom = y;
        return (
          <div className="relative">
            <svg width={w} height={height} role="group" aria-label={description} className="block overflow-visible">
              <g aria-hidden>
                <text x={0} y={14} className="fill-fg-muted text-caption" fontSize={12}>
                  Run
                </text>
                <text x={resX} y={14} textAnchor="end" className="fill-fg-muted text-caption" fontSize={12}>
                  {L.wide ? "measured − predicted" : "meas. − pred."}
                </text>
                {d.bandAvailable && L.wide ? (
                  <text x={chipX} y={14} className="fill-fg-muted text-caption" fontSize={12}>
                    Band
                  </text>
                ) : null}
                {ticks.map((t) => (
                  <line key={t} x1={x(t)} x2={x(t)} y1={HEAD} y2={plotBottom} stroke="var(--chart-grid)" strokeWidth={1} />
                ))}
              </g>
              {rows}
              <XAxis scale={x} top={plotBottom} ticks={ticks} format={fmt} label={`${target}${unit ? ` (${unit})` : ""}`} />
            </svg>
            {!isStatic ? <ChartTooltip tip={tip} onClose={close} width={w} /> : null}
            {pages.length > 1 ? (
              <div className="mt-2 flex items-center justify-between gap-3 text-caption text-fg-muted">
                <span>
                  Page {formatValue(current + 1, { quantity: "count" }).text} of {formatValue(pages.length, { quantity: "count" }).text}, newest rounds first. The hit rate counts every run.
                </span>
                <span className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                    Newer rounds
                  </Button>
                  <Button variant="outline" size="sm" disabled={current >= pages.length - 1} onClick={() => setPage(current + 1)}>
                    Older rounds
                  </Button>
                </span>
              </div>
            ) : null}
          </div>
        );
      }}
    </ChartFrame>
  );
}

type MarkProps = ReturnType<typeof useChartTip>["markProps"];

function RunRow({
  r,
  d,
  cy,
  x,
  L,
  unit,
  resX,
  chipX,
  target,
  focusable,
  isStatic,
  markProps,
}: {
  r: DumbbellRun;
  d: DumbbellData;
  cy: number;
  x: (v: number) => number;
  L: Layout;
  unit: string | null;
  resX: number;
  chipX: number;
  target: string;
  focusable: boolean;
  isStatic: boolean;
  markProps: MarkProps;
}) {
  const px = r.pred != null ? x(r.pred) : null;
  const mx = r.result != null ? x(r.result) : null;
  const check = bandCheck(r);
  const residual = r.awaiting || r.residual == null ? null : fmtResidual(d, r, unit);
  const predWords = r.pred != null ? `predicted ${fmtPred(d, r, unit).text}${r.interval ? ` ${fmtInterval(d, r)}` : ""}` : "no engine prediction";
  const label = `Run ${shortId(r.id)}: ${predWords}, ${r.awaiting ? "awaiting a result" : `measured ${fmtMeasured(d, r, unit).text}, ${check}`}`;
  const anchor = px ?? mx ?? L.x0;
  const hit = isStatic ? {} : markProps(anchor, cy, <RunTip r={r} d={d} unit={unit} target={target} />, label, focusable);
  return (
    <g>
      <g aria-hidden>
        <text x={0} y={cy + 4} className="fill-fg font-mono text-code" fontSize={12}>
          {shortId(r.id)}
          {r.bandSource === "current-analysis" ? <tspan className="fill-fg-muted">*</tspan> : null}
        </text>
        {L.wide ? (
          <text x={64} y={cy + 4} className="fill-fg-muted text-caption" fontSize={12}>
            {r.pred == null ? "not proposed" : r.mode}
          </text>
        ) : null}
        {r.interval ? <IntervalBar orientation="horizontal" at={cy} from={x(r.interval.lo)} to={x(r.interval.hi)} /> : null}
        {mx != null && px != null ? <line x1={px} x2={mx} y1={cy} y2={cy} stroke="var(--fg-muted)" strokeWidth={1} /> : null}
        {px != null ? <PredictedDot x={px} y={cy} r={4} /> : null}
        {mx != null ? <MeasuredDot x={mx} y={cy} r={5} /> : null}
        {residual ? (
          <text x={resX} y={cy + 4} textAnchor="end" className="fill-fg text-caption tabular-nums" fontSize={12}>
            {residual.text}
          </text>
        ) : !r.awaiting ? (
          <text x={resX} y={cy + 4} textAnchor="end" className="fill-fg-muted text-caption" fontSize={12}>
            n/a
          </text>
        ) : (
          <g>
            <PendingDot x={L.x1 + 26} y={cy} r={4} />
            <text x={L.x1 + 36} y={cy + 4} className="fill-fg-muted text-caption" fontSize={12}>
              {L.wide ? "Awaiting result" : "awaiting"}
            </text>
          </g>
        )}
        {(d.bandAvailable || r.pred == null) && !r.awaiting ? <Chip x={chipX} cy={cy} check={check} width={L.chip - 8} compact={!L.wide} /> : null}
      </g>
      {!isStatic ? <HitTarget x={12} y={cy - 3} width={L.x1 + 18 + L.res + L.chip} height={ROW} {...hit} /> : null}
    </g>
  );
}

function Chip({ x, cy, check, width, compact }: { x: number; cy: number; check: ReturnType<typeof bandCheck>; width: number; compact: boolean }) {
  if (check === "band n/a" || check === "no engine prediction")
    return (
      <text x={x} y={cy + 4} className="fill-fg-muted text-caption" fontSize={12}>
        {compact ? "n/a" : check === "band n/a" ? "band n/a" : "no prediction"}
      </text>
    );
  const outside = check === "outside";
  if (compact)
    return outside ? (
      <OutsideGlyph x={x + 7} y={cy} s={3.5} />
    ) : (
      <path d={`M${x + 2} ${cy} l3 3 l5 -6`} fill="none" stroke="var(--fg-muted)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    );
  return (
    <g>
      <rect x={x} y={cy - 9} width={width} height={18} rx={4} fill={outside ? "var(--warn-soft)" : "var(--subtle)"} stroke="var(--border)" />
      {outside ? (
        <OutsideGlyph x={x + 10} y={cy} s={3} />
      ) : (
        <path d={`M${x + 6} ${cy} l3 3 l5 -6`} fill="none" stroke="var(--fg-muted)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      )}
      <text x={x + 19} y={cy + 4} className="fill-fg text-caption" fontSize={12}>
        {check}
      </text>
    </g>
  );
}

/** Tooltip: measured first, then predicted with its band and coverage, the residual, the band check and the source. */
function RunTip({ r, d, unit, target }: { r: DumbbellRun; d: DumbbellData; unit: string | null; target: string }) {
  const p = r.pred != null ? formatValue(r.pred, { basis: "predicted", unit, interval: r.interval, decimals: d.decimals.pred }) : null;
  const why = bandMissingReason(r);
  const from = bandSourceLabel(r);
  const runSource = sourceFromRun({ target }, r.run, r.awaiting ? "predicted" : "measured");
  return (
    <div className="flex flex-col gap-1 pr-5">
      <p className="text-label text-fg">
        Run <span className="font-mono text-code">{shortId(r.id)}</span>
        <span className="text-fg-muted">
          {" "}
          · {r.mode}
          {r.round != null ? ` · round ${formatValue(r.round, { quantity: "count" }).text}` : ""}
        </span>
      </p>
      <TipRow label="Measured">{r.awaiting ? "Awaiting result" : <span className="font-semibold">{fmtMeasured(d, r, unit).text}</span>}</TipRow>
      {p ? (
        <TipRow label="Predicted">
          {p.value}
          {unit ? `\u00A0${unit}` : ""}
        </TipRow>
      ) : (
        <TipRow label="Predicted">No engine prediction</TipRow>
      )}
      {r.interval && p ? (
        <TipRow label={`${p.coverage ? `${p.coverage} ` : ""}held-out band`}>{p.interval}</TipRow>
      ) : (
        <p className="max-w-72 text-fg-muted">{p ? "(no interval reported) " : ""}{why}</p>
      )}
      {from ? <p className="text-fg-muted">{from}</p> : null}
      {r.callerPred != null ? (
        <TipRow label="Your prediction, not the engine's">{formatValue(r.callerPred, { unit }).text}</TipRow>
      ) : null}
      {!r.awaiting && r.residual != null ? <TipRow label="Measured − predicted">{fmtResidual(d, r, unit).text}</TipRow> : null}
      {r.inside != null ? <TipRow label="Band check">{r.inside ? "inside" : "outside"}</TipRow> : null}
      <TipSource>
        <span className="font-mono text-code">{runSource.field}</span>
        <SourceButton source={runSource} full={String(r.awaiting ? (r.pred ?? "") : r.result)} className="ml-1" />
      </TipSource>
    </div>
  );
}
