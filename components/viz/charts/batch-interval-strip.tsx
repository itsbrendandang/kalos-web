"use client";

import type { ReactNode } from "react";
import { scaleLinear } from "@visx/scale";
import { TriangleAlert } from "lucide-react";
import { XAxis, tickFormatter } from "@/components/viz/axes";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import { IntervalBar, MeasuredDot, PredictedDot } from "@/components/viz/marks";
import { Num, NumState } from "@/components/viz/num";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { formatValue } from "@/lib/num";
import type { Source } from "@/lib/source";
import { cn } from "@/lib/utils";
import { coverageText } from "@/lib/num";
import {
  MODEL_BASED,
  bandLegend,
  bandName,
  bandStateText,
  batchStripTable,
  chanceLabel,
  chanceText,
  describeBatchStrip,
  distanceText,
  eiText,
  feasibilityText,
  gainFormatted,
  hasBandMode,
  improvementIncumbent,
  levelRefusal,
  measuredFormatted,
  predFormatted,
  quantilesText,
  sigmaText,
  type BatchStripModel,
  type BatchStripRow,
} from "@/lib/viz-data/batch-interval-strip";
import { MAX_FOCUSABLE_MARKS } from "@/lib/viz-thresholds";

/*
 * C2 BatchIntervalStrip (VIZ_SPEC 5): the proposed batch as a forest. Each row
 * is one proposal in the engine's order: a hollow predicted ring with the
 * engine's held-out band at the chosen coverage as an interval bar (none where
 * the engine refused that level), against the dotted incumbent rule. Aligned
 * columns give the predicted gain in the goal direction (band shifted by the
 * same amount), the model-based chance to beat the incumbent, p_feasible only
 * when the engine gated on it, and the measured result of a started run of the
 * same recipe (filled ink, on top). EI, quantiles, the GP band and the
 * distance to the nearest measured run are in each row's tooltip and the Data
 * table. Mode is a word, never a color. Hovering or focusing a row highlights
 * the same proposal in the setpoint matrix (`onHighlight`).
 */

const ROW = 40;
const TOP = 22;
const AXIS = 34;
const HEAD = 36;
const LABEL_W = 96;
const GAIN_W = 184;
const FEAS_W = 84;
const CHANCE_W = 112;
const MEAS_W = 168;

export function BatchIntervalStrip({
  model,
  highlight = null,
  onHighlight,
  sourceFor,
  footer,
  stale,
  warning,
  emptyText,
  width,
}: {
  model: BatchStripModel;
  highlight?: string | null;
  onHighlight?: (key: string | null) => void;
  sourceFor?: (row: BatchStripRow) => Source;
  footer?: ReactNode;
  stale?: { nNew: number; text?: ReactNode } | null;
  /** A banner above the strip (e.g. the model is not yet reliable); the strip stays. */
  warning?: ReactNode;
  emptyText?: ReactNode;
  width?: number;
}) {
  const n = model.rows.length;
  const refused = levelRefusal(model);
  const band = hasBandMode(model) && !refused;
  const inc = model.incumbent;
  const anyAwaiting = model.rows.some((r) => r.run?.awaiting && r.run.result == null);
  const table = batchStripTable(model);
  const legend = (
    <>
      <LegendItem mark="predicted">
        Predicted{band ? ` (${bandLegend(model)})` : refused ? ` (no band: the engine refused the ${coverageText(refused.coverage)} level)` : " (no interval reported)"}
      </LegendItem>
      {model.hasRuns ? <LegendItem mark="measured">Measured result of the started run</LegendItem> : null}
      {anyAwaiting ? <LegendItem mark="pending">Started, awaiting result</LegendItem> : null}
      {inc ? <LegendItem mark="reference">{inc.label}</LegendItem> : null}
    </>
  );
  return (
    <ChartFrame
      title="What each proposal is predicted to give"
      subtitle={`Predicted ${model.target}${model.unit ? ` (${model.unit})` : ""} in the engine's order${band ? `, with the ${bandName(model)} as a bar` : ""}${inc ? `, against the ${inc.label} (dotted)` : ""}${model.goal === "minimize" ? "; the goal is to minimize, so lower is better" : ""}. Mode is the engine's word for why it proposed each.`}
      state={n === 0 ? { kind: "empty", text: emptyText ?? "The engine proposed no recipes for this analysis." } : { kind: "ready" }}
      stale={stale}
      legend={legend}
      data={table}
      footer={footer}
      description={describeBatchStrip(model)}
      height={HEAD + TOP + Math.max(n, 1) * ROW + AXIS}
      width={width}
    >
      {(w) => <Strip w={w} model={model} highlight={highlight} onHighlight={onHighlight} sourceFor={sourceFor} warning={warning} />}
    </ChartFrame>
  );
}

function Strip({
  w,
  model,
  highlight,
  onHighlight,
  sourceFor,
  warning,
}: {
  w: number;
  model: BatchStripModel;
  highlight: string | null;
  onHighlight?: (key: string | null) => void;
  sourceFor?: (row: BatchStripRow) => Source;
  warning?: ReactNode;
}) {
  const { tip, markProps, close } = useChartTip();
  const compact = w < 600;
  const showFeas = model.gating === "gated";
  const showChance = model.hasImprovement && w >= 760;
  const sideW = compact ? 0 : GAIN_W + (showChance ? CHANCE_W : 0) + (showFeas ? FEAS_W : 0) + (model.hasRuns ? MEAS_W : 0);
  const labelW = w < 440 ? 84 : LABEL_W;
  const plotW = Math.max(80, w - labelW - sideW);
  const rows = model.rows;
  const plotH = TOP + rows.length * ROW + AXIS;
  const domain = model.domain ?? [0, 1];
  const x = scaleLinear<number>({ domain, range: [10, plotW - 10] });
  const ticks = x.ticks(Math.max(2, Math.min(6, Math.floor(plotW / 90))));
  const fmt = tickFormatter(ticks);
  const inc = model.incumbent;
  const incF = inc ? formatValue(inc.value, { basis: "measured", unit: model.unit }) : null;
  const rowY = (i: number) => TOP + i * ROW + ROW / 2;
  const focusable = rows.length <= MAX_FOCUSABLE_MARKS;
  const cols = compact
    ? `${labelW}px ${plotW}px`
    : `${labelW}px ${plotW}px ${GAIN_W}px${showChance ? ` ${CHANCE_W}px` : ""}${showFeas ? ` ${FEAS_W}px` : ""}${model.hasRuns ? ` ${MEAS_W}px` : ""}`;
  const chance = chanceLabel(rows.find((r) => r.pImprove)?.pImprove ?? null, model.goal);
  const chanceInc = improvementIncumbent(rows.find((r) => r.pImprove)?.pImprove ?? null, null);
  const enter = (key: string | null) => onHighlight?.(key);

  return (
    <div className="flex flex-col gap-3">
      {warning ? (
        <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-caption text-fg">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
          <span>{warning}</span>
        </p>
      ) : null}
      <div className="relative" onMouseLeave={() => enter(null)}>
        <div className="grid text-caption text-fg-muted" style={{ gridTemplateColumns: cols, height: HEAD }} aria-hidden>
          <span className="self-end pb-1">Proposal</span>
          <span className="self-end pb-1 pl-2">
            Predicted{model.unit ? ` (${model.unit})` : ""}
          </span>
          {!compact ? (
            <>
              <span className="flex flex-col justify-end pb-1 pl-3 leading-4">
                <span>
                  Predicted gain{model.unit ? ` (${model.unit})` : ""}
                  {model.goal === "minimize" ? ", best − predicted" : ""}
                </span>
                <span className="truncate">{inc && incF ? `vs ${inc.label} ${incF.value}` : "no incumbent to compare"}</span>
              </span>
              {showChance ? (
                <span className="flex flex-col justify-end pb-1 pl-3 leading-4" title={`${MODEL_BASED}. Compared with the ${chanceInc ?? "incumbent"}.`}>
                  <span>{chance} it</span>
                  <span className="truncate">model-based</span>
                </span>
              ) : null}
              {showFeas ? <span className="self-end pb-1 pl-3">P(feasible)</span> : null}
              {model.hasRuns ? <span className="self-end pb-1 pl-3">Measured{model.unit ? ` (${model.unit})` : ""}</span> : null}
            </>
          ) : null}
        </div>
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          {/* Labels */}
          <div className="flex flex-col" style={{ paddingTop: TOP }}>
            {rows.map((r) => (
              <div
                key={r.key}
                className={cn("flex items-center gap-1.5 rounded-l-md pl-1", highlight === r.key && "bg-subtle")}
                style={{ height: ROW }}
                onMouseEnter={() => enter(r.key)}
              >
                <span className="text-label text-fg">{r.key}</span>
                <span className="text-caption text-fg-muted">{r.mode}</span>
                {r.edge.length ? (
                  <span className="inline-flex items-center text-warn" title={`At a range edge: ${r.edge.join(", ")}`}>
                    <TriangleAlert className="size-3.5" aria-hidden />
                    <span className="sr-only">at a range edge: {r.edge.join(", ")}</span>
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Plot */}
          {/* role="group", not "img": an img's children are presentational, and the row marks must stay reachable. */}
          <svg width={plotW} height={plotH} role="group" aria-label={describeBatchStrip(model)} className="overflow-visible">
            {rows.map((r, i) => (highlight === r.key ? <rect key={r.key} x={0} y={TOP + i * ROW} width={plotW} height={ROW} fill="var(--subtle)" /> : null))}
            {ticks.map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1={TOP - 4} y2={TOP + rows.length * ROW} stroke="var(--chart-grid)" strokeWidth={1} aria-hidden />
            ))}
            {inc ? (
              <g aria-hidden>
                <line x1={x(inc.value)} x2={x(inc.value)} y1={TOP - 6} y2={TOP + rows.length * ROW} stroke="var(--chart-reference)" strokeWidth={1.25} strokeDasharray="1 3" strokeLinecap="round" />
                <text
                  x={x(inc.value) > plotW / 2 ? x(inc.value) - 4 : x(inc.value) + 4}
                  y={TOP - 9}
                  textAnchor={x(inc.value) > plotW / 2 ? "end" : "start"}
                  className="fill-fg-muted text-caption tabular-nums"
                  fontSize={12}
                >
                  {inc.label} {incF?.text}
                </text>
              </g>
            ) : null}
            {rows.map((r, i) => {
              const y = rowY(i);
              const dim = highlight != null && highlight !== r.key;
              const measured = r.run?.result ?? null;
              return (
                <g key={r.key} opacity={dim ? 0.45 : 1}>
                  {r.lo != null && r.hi != null ? <IntervalBar orientation="horizontal" at={y} from={x(r.lo)} to={x(r.hi)} /> : null}
                  <PredictedDot x={x(r.pred)} y={y} r={4.5} aria-hidden />
                  {measured != null ? <MeasuredDot x={x(measured)} y={y} r={5} aria-hidden /> : null}
                </g>
              );
            })}
            {rows.map((r, i) => {
              const y = rowY(i);
              const content = <RowTip r={r} model={model} source={sourceFor?.(r)} />;
              const p = predFormatted(r, model);
              const mp = markProps(labelW + x(r.pred), HEAD + y, content, `${r.key} ${r.mode}: ${p.aria}`, focusable);
              return (
                <rect
                  key={r.key}
                  x={0}
                  y={TOP + i * ROW}
                  width={plotW}
                  height={ROW}
                  fill="transparent"
                  {...mp}
                  onMouseEnter={() => {
                    mp.onMouseEnter();
                    enter(r.key);
                  }}
                  onFocus={() => {
                    mp.onFocus();
                    enter(r.key);
                  }}
                  onBlur={() => {
                    mp.onBlur();
                    enter(null);
                  }}
                  className="focus-visible:stroke-[var(--ring)] focus-visible:stroke-2"
                />
              );
            })}
            <XAxis scale={x} top={TOP + rows.length * ROW + 2} ticks={ticks} format={fmt} />
          </svg>

          {/* Gain, feasibility, measured */}
          {!compact ? (
            <>
              <div className="flex flex-col" style={{ paddingTop: TOP }}>
                {rows.map((r) => (
                  <Cell key={r.key} on={highlight === r.key} onEnter={() => enter(r.key)}>
                    <GainCell r={r} model={model} />
                  </Cell>
                ))}
              </div>
              {showChance ? (
                <div className="flex flex-col" style={{ paddingTop: TOP }}>
                  {rows.map((r) => (
                    <Cell key={r.key} on={highlight === r.key} onEnter={() => enter(r.key)}>
                      <span className="tabular-nums text-fg">{chanceText(r)}</span>
                    </Cell>
                  ))}
                </div>
              ) : null}
              {showFeas ? (
              <div className="flex flex-col" style={{ paddingTop: TOP }}>
                {rows.map((r) => (
                  <Cell key={r.key} on={highlight === r.key} onEnter={() => enter(r.key)}>
                    {r.feasibility.state === "value" ? (
                      <span className="tabular-nums text-fg">{feasibilityText(r.feasibility)}</span>
                    ) : (
                      <span className="text-fg-muted" title={[r.feasibility.reason, r.feasibility.detail].filter(Boolean).join(". ")}>
                        n/a<span className="sr-only"> ({r.feasibility.reason})</span>
                      </span>
                    )}
                  </Cell>
                ))}
              </div>
              ) : null}
              {model.hasRuns ? (
                <div className="flex flex-col" style={{ paddingTop: TOP }}>
                  {rows.map((r) => (
                    <Cell key={r.key} on={highlight === r.key} onEnter={() => enter(r.key)} last>
                      <MeasuredCell r={r} model={model} />
                    </Cell>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <ChartTooltip tip={tip} onClose={close} width={w} />
      </div>
      {!compact && !showFeas && rows.length ? (
        <p className="text-caption text-fg-muted">
          P(feasible): n/a for every proposal, {model.gating === "ungated" ? "the batch was not feasibility-gated" : "the engine did not report feasibility gating"}
          {model.gatingReason ? ` (engine: ${model.gatingReason})` : ""}.
        </p>
      ) : null}
    </div>
  );
}

function Cell({ children, on, onEnter, last = false }: { children: ReactNode; on: boolean; onEnter: () => void; last?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center pl-3 text-body", on && "bg-subtle", last && "rounded-r-md")} style={{ height: ROW }} onMouseEnter={onEnter}>
      {children}
    </div>
  );
}

function GainCell({ r, model }: { r: BatchStripRow; model: BatchStripModel }) {
  const g = gainFormatted(r, model);
  if (!g) return <span className="text-fg-muted">n/a</span>;
  return (
    <span className="flex min-w-0 flex-col leading-4">
      <span className="whitespace-nowrap tabular-nums">
        <span className="text-fg">{g.value}</span>
        <span className="text-caption text-fg-muted"> {g.interval ?? "interval n/a"}</span>
      </span>
      {g.interval ? null : (
        <span className="truncate text-caption text-fg-muted" title={sigmaText(r, model.unit)}>
          {sigmaText(r, model.unit)}
        </span>
      )}
    </span>
  );
}

function MeasuredCell({ r, model }: { r: BatchStripRow; model: BatchStripModel }) {
  if (!r.run) return <span className="text-caption text-fg-muted">not started</span>;
  if (r.run.result == null) return <NumState state={{ kind: "pending" }} className="text-caption" />;
  return (
    <span className="flex items-baseline gap-2 whitespace-nowrap">
      <Num value={r.run.result} basis="measured" size="table" />
      {r.band ? (
        <span className={cn("inline-flex items-center gap-1 text-caption", r.band === "outside" ? "text-warn" : "text-fg-muted")}>
          {r.band === "outside" ? <TriangleAlert className="size-3.5 self-center" aria-hidden /> : null}
          {r.band} band
        </span>
      ) : null}
      <span className="sr-only">{model.unit ?? ""}</span>
    </span>
  );
}

function RowTip({ r, model, source }: { r: BatchStripRow; model: BatchStripModel; source?: Source }) {
  const p = predFormatted(r, model);
  const g = gainFormatted(r, model);
  const m = measuredFormatted(r, model.unit);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-label text-fg">
        {r.key} <span className="font-normal text-fg-muted">{r.mode}</span>
      </p>
      {m ? <TipRow label="Measured">{m.text}{r.band ? `, ${r.band} band` : ""}</TipRow> : r.run ? <TipRow label="Measured">Awaiting result</TipRow> : null}
      <TipRow label="Predicted">
        {p.value}
        {p.unit ? `\u00A0${p.unit}` : ""}
      </TipRow>
      <TipRow label={p.interval ? bandName(model) : "Interval"}>{p.interval ?? (bandStateText(r) ?? "no interval reported")}</TipRow>
      {r.interval.kind === "refused" && r.interval.fix ? <p className="text-fg-muted">What would fix it: {r.interval.fix}</p> : null}
      <TipRow label="Model σ">{formatValue(r.sigma, { unit: model.unit }).text}</TipRow>
      {g && model.incumbent ? (
        <TipRow label={`Gain vs ${model.incumbent.label}${model.goal === "minimize" ? " (best − predicted)" : ""}`}>
          {g.value} {g.interval ?? "(interval n/a)"}
        </TipRow>
      ) : null}
      {model.gating === "gated" ? <TipRow label="P(feasible)">{r.feasibility.state === "value" ? feasibilityText(r.feasibility) : `n/a: ${r.feasibility.reason}`}</TipRow> : null}
      {r.pImprove || r.ei || r.quantiles ? (
        <div className="mt-1 flex flex-col gap-1 border-t border-border pt-1">
          <p className="text-fg-muted">Model-based (GP posterior), not held-out calibrated{r.pImprove ? `, vs the ${improvementIncumbent(r.pImprove, model.unit)}` : ""}:</p>
          {r.pImprove ? <TipRow label={chanceLabel(r.pImprove, model.goal)}>{chanceText(r)}</TipRow> : null}
          {r.ei ? <TipRow label="Expected improvement">{eiText(r, model.unit)}</TipRow> : null}
          {r.quantiles ? <TipRow label="Quantiles">{quantilesText(r.quantiles, model.unit) ?? "n/a"}</TipRow> : null}
        </div>
      ) : null}
      {r.nnDistance != null ? (
        <TipRow label="Nearest measured run">
          {(() => {
            const dt = distanceText(r.nnDistance, model.nnMedian);
            return dt.ratio ? `${dt.value} (${dt.ratio})` : dt.value;
          })()}
        </TipRow>
      ) : null}
      {r.edge.length ? <TipRow label="At range edge">{r.edge.join(", ")}</TipRow> : null}
      {source ? (
        <TipSource>
          {source.field} · {source.label}
          {source.engineVersion ? ` · engine ${source.engineVersion}` : ""}
        </TipSource>
      ) : null}
    </div>
  );
}
