"use client";

import { ChartFrame } from "@/components/viz/frame";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { formatCorr, formatValue } from "@/lib/num";
import type { Source } from "@/lib/source";
import { MAX_FOCUSABLE_MARKS } from "@/lib/viz-thresholds";
import { cellN, cellOpacity, corrText, correlationTable, describeCorrelation, type CorrelationProps } from "@/lib/viz-data/correlation-heatmap";

/*
 * Spearman rank correlation among the inputs and the target (VIZ_SPEC 5,
 * "Retained, restyled"). Diverging fill: --chart-div-neg for a negative rho,
 * --chart-div-pos for a positive one, deeper for a stronger one. The sign is
 * also printed (U+2212 minus) in every cell, so the chart reads in greyscale.
 * A pair the engine sent no value for is a muted "n/a" cell, never 0. The
 * diagonal (a column against itself) is printed but left unshaded, so it
 * never reads as the strongest finding. Every computed cell prints its n under
 * rho. The matrix is per run (row): see lib/viz-data/correlation-heatmap.ts for
 * why that is the engine's real unit whatever its `unit` field says.
 */

const FONT = 12;
/** Approximate caption-size glyph width (Geist 12px) used to size the label gutters deterministically. */
const CHAR_W = 6.6;
const MIN_CELL = 46;
const MAX_CELL = 54;

const METHOD = "Spearman rank correlation, per run (one row per run in the fit)";

export function CorrelationHeatmap({ data, source, width: fixedWidth, bare = true }: { data: CorrelationProps; source: Source; width?: number; bare?: boolean }) {
  const { tip, markProps, close } = useChartTip();
  const k = data.labels.length;
  const gutter = Math.min(220, Math.ceil(Math.max(...data.labels.map((l) => l.length)) * CHAR_W) + 10);
  const description = describeCorrelation(data);
  const n = data.n != null ? formatValue(data.n, { quantity: "count" }).text : "n/a";
  const focusable = k * k <= MAX_FOCUSABLE_MARKS;
  const t = data.targetIndex;

  return (
    <ChartFrame
      bare={bare}
      title="Rank correlation"
      subtitle="How each pair of inputs, and each input with the target, rise and fall together across your runs, one row per run. Each cell prints rho and the runs (n) behind it. Descriptive only: a correlation is not a cause."
      height={gutter + MIN_CELL * k}
      width={fixedWidth}
      description={description}
      data={correlationTable(data)}
      legend={<DivergingLegend />}
      footer={`From: ${source.label} · n = ${n} runs · ${METHOD}${data.engineUnit && data.engineUnit !== "row" && data.engineUnit !== "run" ? ` (the engine's block says unit "${data.engineUnit}", but it computes over the fitted rows)` : ""}${source.engineVersion ? ` · engine ${source.engineVersion}` : ""}`}
    >
      {(width) => {
        const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor((width - gutter) / Math.max(k, 1))));
        const svgW = gutter + cell * k;
        const svgH = gutter + cell * k;
        return (
          <div className="relative">
            <div className="overflow-x-auto">
              <svg width={svgW} height={svgH} role="img" aria-label={description} className="block">
                {/* Column labels, rotated so long names are shown in full. */}
                {data.labels.map((l, j) => (
                  <text
                    key={`c-${l}`}
                    transform={`translate(${gutter + j * cell + cell / 2 + 4}, ${gutter - 6}) rotate(-90)`}
                    fontSize={FONT}
                    className={j === t ? "fill-fg font-medium" : "fill-fg-muted"}
                  >
                    {l}
                  </text>
                ))}
                {data.labels.map((l, i) => (
                  <text key={`r-${l}`} x={gutter - 6} y={gutter + i * cell + cell / 2} dy="0.33em" textAnchor="end" fontSize={FONT} className={i === t ? "fill-fg font-medium" : "fill-fg-muted"}>
                    {l}
                  </text>
                ))}
                {data.matrix.map((row, i) =>
                  row.map((rho, j) => {
                    const x = gutter + j * cell;
                    const y = gutter + i * cell;
                    const diag = i === j;
                    const pair = `${data.labels[i]} and ${data.labels[j]}`;
                    const nCell = cellN(data, i, j);
                    const label = `${pair}: ${rho == null ? "n/a, no value from the engine" : formatCorr(rho).aria}${nCell != null ? `, n = ${nCell} runs` : ""}`;
                    const content = (
                      <div className="flex flex-col gap-1">
                        <p className="pr-5 text-label text-fg">{diag ? data.labels[i] : pair}</p>
                        <TipRow label="Spearman ρ">{rho == null ? <span className="text-fg-muted">n/a</span> : corrText(rho)}</TipRow>
                        {diag ? <p className="text-fg-muted">A column always ranks identically with itself.</p> : null}
                        {rho == null ? <p className="text-fg-muted">The engine sent no value for this pair (fewer than 3 usable rows, or undefined).</p> : null}
                        <TipRow label="Runs (n)">{diag ? "n/a" : rho == null ? "fewer than 3 usable" : n}</TipRow>
                        {!diag && rho != null ? <p className="text-fg-muted">Every run in the fit has all inputs, so each pair uses all of them.</p> : null}
                        <TipSource>
                          correlation.matrix[{i}][{j}] · {source.label}
                          {source.engineVersion ? ` · engine ${source.engineVersion}` : ""}
                        </TipSource>
                      </div>
                    );
                    return (
                      <g key={`${i}-${j}`} {...markProps(x + cell, y, content, label, focusable)}>
                        <rect x={x + 1} y={y + 1} width={cell - 2} height={cell - 2} rx={3} fill={rho == null || diag ? "var(--subtle)" : "var(--surface)"} stroke="var(--chart-grid)" strokeWidth={0.75} />
                        {rho != null && !diag ? (
                          <rect x={x + 1} y={y + 1} width={cell - 2} height={cell - 2} rx={3} fill={rho < 0 ? "var(--chart-div-neg)" : "var(--chart-div-pos)"} fillOpacity={cellOpacity(rho)} />
                        ) : null}
                        <text
                          x={x + cell / 2}
                          y={nCell != null ? y + cell / 2 - 6 : y + cell / 2}
                          dy="0.33em"
                          textAnchor="middle"
                          fontSize={FONT}
                          className={rho == null || diag ? "fill-fg-muted tabular-nums" : "fill-fg tabular-nums font-medium"}
                          aria-hidden
                        >
                          {corrText(rho)}
                        </text>
                        {nCell != null ? (
                          <text x={x + cell / 2} y={y + cell / 2 + 10} dy="0.33em" textAnchor="middle" fontSize={FONT} className="fill-fg tabular-nums" aria-hidden>
                            {`n ${formatValue(nCell, { quantity: "count" }).text}`}
                          </text>
                        ) : null}
                      </g>
                    );
                  }),
                )}
                {t != null ? (
                  <g aria-hidden stroke="var(--chart-measured)" strokeWidth={1.25} fill="none">
                    <rect x={gutter + 0.5} y={gutter + t * cell + 0.5} width={cell * k - 1} height={cell - 1} rx={4} />
                    <rect x={gutter + t * cell + 0.5} y={gutter + 0.5} width={cell - 1} height={cell * k - 1} rx={4} />
                  </g>
                ) : null}
              </svg>
            </div>
            <ChartTooltip tip={tip} onClose={close} width={width} />
          </div>
        );
      }}
    </ChartFrame>
  );
}

/** The diverging key: −1 .. 0 .. +1 with the words for each end, values formatted like the cells. */
function DivergingLegend() {
  const steps = [-1, -0.5, 0, 0.5, 1];
  return (
    <span className="inline-flex flex-wrap items-center gap-2 tabular-nums">
      <span>{corrText(-1)} one rises as the other falls</span>
      <svg viewBox="0 0 80 10" className="h-2.5 w-20 shrink-0" aria-hidden>
        {steps.map((v, i) => (
          <g key={v}>
            <rect x={i * 16} y={0} width={16} height={10} fill="var(--surface)" stroke="var(--chart-grid)" strokeWidth={0.5} />
            <rect x={i * 16} y={0} width={16} height={10} fill={v < 0 ? "var(--chart-div-neg)" : "var(--chart-div-pos)"} fillOpacity={cellOpacity(v)} />
          </g>
        ))}
      </svg>
      <span>{corrText(1)} rise together</span>
      <span>· outlined: the target</span>
    </span>
  );
}
