"use client";

import { scaleBand, scaleLinear } from "@visx/scale";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import { HGrid, YAxis, tickFormatter } from "@/components/viz/axes";
import { HitTarget, IntervalBar, MeasuredDot, PendingDot, PredictedDot, RefLine } from "@/components/viz/marks";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { formatValue, type IntervalSpec } from "@/lib/num";
import type { Source } from "@/lib/source";
import { MAX_FOCUSABLE_MARKS } from "@/lib/viz-thresholds";
import {
  bandName,
  describeProgress,
  hitRateText,
  markInterval,
  progressExtent,
  progressTable,
  type ProgressColumn,
  type ProgressData,
  type ProgressRun,
} from "@/lib/viz-data/progress-chart";

/*
 * C1 ProgressChart (VIZ_SPEC 5): is the campaign improving, and did the
 * model's predictions hold up? The measured best so far is a solid ink step
 * line with filled dots (a round with no measured best is a gap). Each
 * round's started runs sit to the left of the round: hollow predicted ring
 * with its band (when the run came from the current analysis), joined to the
 * filled measured result, or a dashed "awaiting" ring. Past a dotted divider,
 * the next batch is predicted only and labelled "proposed, not run". The
 * incumbent is a dotted rule. Measured marks are always drawn last (on top).
 */

const HEIGHT = 300;
const M = { top: 20, right: 16, bottom: 44, left: 56 };

export function ProgressChart({
  data,
  source,
  title = "Progress by round",
  subtitle,
  width,
  bare,
  className,
  footerExtra,
}: {
  data: ProgressData;
  source: Source;
  title?: string;
  subtitle?: string;
  width?: number;
  bare?: boolean;
  className?: string;
  footerExtra?: string;
}) {
  const u = data.unit;
  const hasRuns = data.runs.length > 0;
  const hasNext = data.next != null;
  const insufficient = data.measuredRounds < 2 && !hasRuns && !hasNext;
  const hit = hitRateText(data);
  const description = describeProgress(data);
  const table = progressTable(data);
  const legend = (
    <>
      <LegendItem mark="measured">Measured{u ? ` (${u})` : ""}</LegendItem>
      {hasRuns || hasNext ? (
        <LegendItem mark="predicted">{data.halfWidth != null ? `Predicted (${bandName(data.coverage)})` : "Predicted (no interval reported)"}</LegendItem>
      ) : null}
      {data.runs.some((r) => r.result == null) ? <LegendItem mark="pending">Awaiting result</LegendItem> : null}
      {data.incumbent ? <LegendItem mark="reference">{capitalize(data.incumbent.label)}</LegendItem> : null}
    </>
  );
  const footer = [
    hit,
    data.runs.some((r) => r.band === "earlier-analysis") ? "Runs started from an earlier analysis show no band: the engine does not store each run's band, and today's band does not describe them." : null,
    `From: ${source.label} · n = ${formatValue(lastNBase(data.columns), { quantity: "count" }).text} measured rows · held-out conformal band${source.engineVersion ? ` · engine ${source.engineVersion}` : ""}`,
    footerExtra ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle ?? (data.measuredRounds < 2 ? "The trend appears after your first recorded round." : `Measured best so far${u ? ` (${u})` : ""}, with each round's predictions against what was measured.`)}
      state={insufficient ? { kind: "insufficient", text: "Only the uploaded sheet so far. The trend appears after your first recorded round." } : { kind: "ready" }}
      stale={data.stale}
      legend={legend}
      data={table}
      footer={footer}
      height={HEIGHT}
      width={width}
      description={description}
      bare={bare}
      className={className}
    >
      {(w) => <Plot data={data} width={w} description={description} source={source} />}
    </ChartFrame>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lastNBase = (cols: ProgressColumn[]) => [...cols].reverse().find((c) => c.kind === "history" && c.nBase != null)?.nBase ?? null;

function Plot({ data, width, description, source }: { data: ProgressData; width: number; description: string; source: Source }) {
  const { tip, markProps, close } = useChartTip();
  const u = data.unit;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = HEIGHT - M.top - M.bottom;
  const ext = progressExtent(data) ?? [0, 1];
  const pad = (ext[1] - ext[0]) * 0.08 || Math.abs(ext[0]) * 0.1 || 1;
  const y = scaleLinear<number>({ domain: [ext[0] - pad, ext[1] + pad], range: [M.top + innerH, M.top], nice: true });
  const ticks = y.ticks(5);
  const fmtTick = tickFormatter(ticks);
  const x = scaleBand<string>({ domain: data.columns.map((c) => c.key), range: [M.left, M.left + innerW], paddingInner: 0.12, paddingOuter: 0.06 });
  const bw = x.bandwidth();
  const center = (key: string) => (x(key) ?? 0) + bw / 2;
  const yy = (v: number) => y(v) ?? 0;
  const focusable = data.runs.length * 2 + (data.next?.preds.length ?? 0) + data.columns.length <= MAX_FOCUSABLE_MARKS;

  // Runs occupy the left part of their column; the round's best-so-far point sits at its center.
  const slots = (key: string, n: number, full: boolean) => {
    const left = (x(key) ?? 0) + bw * 0.08;
    const right = full ? (x(key) ?? 0) + bw * 0.92 : center(key) - Math.min(14, bw * 0.12);
    const step = n > 0 ? (right - left) / n : 0;
    return (i: number) => left + step * (i + 0.5);
  };

  // The step line: measured best holds until a later round beats it. A null best breaks the line.
  const hist = data.columns.filter((c) => c.kind === "history" || c.kind === "runs");
  const path: string[] = [];
  hist.forEach((c, i) => {
    if (c.best == null) return;
    const prev = hist[i - 1];
    if (i > 0 && prev?.best != null) path.push(`H ${center(c.key)} V ${yy(c.best)}`);
    else path.push(`M ${center(c.key)} ${yy(c.best)}`);
  });
  const nextCol = data.next ? data.columns.find((c) => c.key === data.next!.column) : null;
  const dividerX = nextCol ? (x(nextCol.key) ?? 0) - (x.step() - bw) / 2 : null;
  const sourceText = `${source.label}${source.engineVersion ? ` · engine ${source.engineVersion}` : ""}`;

  const runTip = (r: ProgressRun, interval: IntervalSpec | null) => (
    <div className="flex flex-col gap-1">
      <p className="text-label">Run {r.id.slice(0, 7)}</p>
      <TipRow label="Measured">{r.result != null ? formatValue(r.result, { unit: u, basis: "measured" }).text : "Awaiting result"}</TipRow>
      <TipRow label="Predicted">{formatValue(r.pred, { unit: u, interval, basis: "predicted" }).text}</TipRow>
      <TipRow label="Band">
        {interval ? bandName(data.coverage) : r.band === "earlier-analysis" ? "n/a: started from an earlier analysis" : "n/a: no interval reported"}
      </TipRow>
      {r.inside != null ? <TipRow label="Result">{r.inside ? "inside its band" : "outside its band"}</TipRow> : null}
      <TipSource>campaign.pending[id={r.id.slice(0, 7)}] · {sourceText}</TipSource>
    </div>
  );

  return (
    <div className="relative">
      <svg width={width} height={HEIGHT} role="img" aria-label={description} className="overflow-visible">
        <HGrid scale={yy} ticks={ticks} x1={M.left} x2={M.left + innerW} />
        <YAxis scale={y} left={M.left} ticks={ticks} format={fmtTick} />
        {/* Column labels */}
        {data.columns.map((c) => (
          <g key={c.key} aria-hidden>
            <text x={center(c.key)} y={HEIGHT - M.bottom + 18} textAnchor="middle" className="fill-fg-muted text-caption">
              {c.label}
            </text>
            <text x={center(c.key)} y={HEIGHT - M.bottom + 33} textAnchor="middle" className="fill-fg-muted text-caption tabular-nums">
              {c.kind === "next" ? "proposed, not run" : c.kind === "history" && c.nBase != null ? `n = ${formatValue(c.nBase, { quantity: "count" }).text}` : c.kind === "unassigned" ? "no round stamped" : "not folded in yet"}
            </text>
          </g>
        ))}

        {/* Incumbent: dotted reference rule with its engine label. */}
        {data.incumbent ? (
          <RefLine x1={M.left} x2={dividerX != null ? dividerX - 8 : M.left + innerW} y1={yy(data.incumbent.value)} y2={yy(data.incumbent.value)} label={`${data.incumbent.label} ${formatValue(data.incumbent.value, { unit: u }).text}`} />
        ) : null}

        {/* Next batch: past a dotted divider, predicted only. */}
        {data.next && nextCol && dividerX != null ? (
          <g>
            <RefLine x1={dividerX} x2={dividerX} y1={M.top} y2={M.top + innerH} label={data.next.fromPreviousAnalysis ? "from previous analysis" : "next batch"} />
            <g opacity={data.next.fromPreviousAnalysis ? 0.55 : 1}>
            {data.next.preds.map((p, i) => {
              const px = slots(nextCol.key, data.next!.preds.length, true)(i);
              const interval = markInterval(p.lo, p.hi, data.coverage);
              const tipContent = (
                <div className="flex flex-col gap-1">
                  <p className="text-label">Proposal {i + 1}, proposed, not run</p>
                  <TipRow label="Predicted">{formatValue(p.pred, { unit: u, interval, basis: "predicted" }).text}</TipRow>
                  <TipRow label="Band">{interval ? bandName(data.coverage) : "n/a: no interval reported"}</TipRow>
                  <TipSource>proposals[{i}] · {sourceText}</TipSource>
                </div>
              );
              return (
                <g key={i}>
                  {interval ? <IntervalBar orientation="vertical" at={px} from={yy(interval.lo)} to={yy(interval.hi)} /> : null}
                  <PredictedDot x={px} y={yy(p.pred)} />
                  <HitTarget x={px} y={yy(p.pred)} {...markProps(px, yy(p.pred), tipContent, `Proposal ${i + 1}: ${formatValue(p.pred, { unit: u, interval, basis: "predicted" }).aria}`, focusable)} />
                </g>
              );
            })}
            </g>
          </g>
        ) : null}

        {/* Started runs: predicted (with band when it applies) beside measured, joined by a thin connector. */}
        {data.columns.map((c) => {
          const rs = data.runs.filter((r) => r.column === c.key);
          if (!rs.length) return null;
          if (c.collapsed) return <Collapsed key={c.key} runs={rs} x={slots(c.key, 1, false)(0)} y={yy} />;
          const at = slots(c.key, rs.length, false);
          const off = Math.min(5, Math.max(2.5, ((center(c.key) - (x(c.key) ?? 0)) / Math.max(1, rs.length)) * 0.22));
          return (
            <g key={c.key}>
              {rs.map((r, i) => {
                const cx = at(i);
                const interval = markInterval(r.lo, r.hi, data.coverage);
                return (
                  <g key={r.id}>
                    {interval ? <IntervalBar orientation="vertical" at={cx - off} from={yy(interval.lo)} to={yy(interval.hi)} cap={5} /> : null}
                    {r.result != null ? <line x1={cx - off} x2={cx + off} y1={yy(r.pred)} y2={yy(r.result)} stroke="var(--chart-reference)" strokeWidth={1} aria-hidden /> : null}
                    <PredictedDot x={cx - off} y={yy(r.pred)} r={3.5} />
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Measured on top: the best-so-far step line and its dots, then run results. */}
        <path d={path.join(" ")} fill="none" stroke="var(--chart-measured)" strokeWidth={2} strokeLinejoin="round" aria-hidden />
        {hist.map((c) =>
          c.best == null ? (
            c.kind === "history" ? (
              <text key={c.key} x={center(c.key)} y={M.top + innerH - 6} textAnchor="middle" className="fill-fg-muted text-caption" aria-hidden>
                n/a
              </text>
            ) : null
          ) : (
            <g key={c.key}>
              <circle cx={center(c.key)} cy={yy(c.best)} r={6.5} fill="var(--surface)" aria-hidden />
              <MeasuredDot x={center(c.key)} y={yy(c.best)} r={5} />
              <HitTarget
                x={center(c.key)}
                y={yy(c.best)}
                {...markProps(
                  center(c.key),
                  yy(c.best),
                  <div className="flex flex-col gap-1">
                    <p className="text-label">{c.label === "Upload" ? "Uploaded sheet" : c.label}</p>
                    <TipRow label="Best so far, measured">{formatValue(c.best, { unit: u, basis: "measured" }).text}</TipRow>
                    {c.nBase != null ? <TipRow label="Rows in the model">{formatValue(c.nBase, { quantity: "count" }).text}</TipRow> : null}
                    <TipSource>campaign.history[round={c.round}].best</TipSource>
                  </div>,
                  `${c.label}: best so far ${formatValue(c.best, { unit: u, basis: "measured" }).aria}`,
                  focusable,
                )}
              />
            </g>
          ),
        )}
        {data.columns.map((c) => {
          const rs = data.runs.filter((r) => r.column === c.key);
          if (!rs.length || c.collapsed) return null;
          const at = slots(c.key, rs.length, false);
          const off = Math.min(5, Math.max(2.5, ((center(c.key) - (x(c.key) ?? 0)) / Math.max(1, rs.length)) * 0.22));
          return (
            <g key={c.key}>
              {rs.map((r, i) => {
                const cx = at(i);
                const interval = markInterval(r.lo, r.hi, data.coverage);
                const vy = yy(r.result ?? r.pred);
                return (
                  <g key={r.id}>
                    {r.result != null ? <MeasuredDot x={cx + off} y={yy(r.result)} r={3.5} /> : <PendingDot x={cx + off} y={yy(r.pred)} r={3.5} />}
                    <HitTarget
                      x={cx}
                      y={vy}
                      {...markProps(
                        cx,
                        vy,
                        runTip(r, interval),
                        `Run ${r.id.slice(0, 7)}: ${r.result != null ? formatValue(r.result, { unit: u, basis: "measured" }).aria : "awaiting result"}, ${formatValue(r.pred, { unit: u, interval, basis: "predicted" }).aria}`,
                        focusable,
                      )}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} onClose={close} width={width} />
    </div>
  );
}

/** More than MAX_RUNS_PER_ROUND runs: min-max rules (exact) for predicted and measured; every run stays in the Data table. */
function Collapsed({ runs, x, y }: { runs: ProgressRun[]; x: number; y: (v: number) => number }) {
  const preds = runs.map((r) => r.pred);
  const results = runs.map((r) => r.result).filter((v): v is number => v != null);
  return (
    <g aria-hidden>
      <line x1={x - 5} x2={x - 5} y1={y(Math.min(...preds))} y2={y(Math.max(...preds))} stroke="var(--chart-predicted)" strokeWidth={1.5} strokeDasharray="4 3" />
      {results.length ? <line x1={x + 5} x2={x + 5} y1={y(Math.min(...results))} y2={y(Math.max(...results))} stroke="var(--chart-measured)" strokeWidth={3} /> : null}
    </g>
  );
}
