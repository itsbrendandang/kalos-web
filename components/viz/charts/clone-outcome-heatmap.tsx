"use client";

import { useCallback, useMemo } from "react";
import { CloneMark } from "@/components/viz/clone-chip";
import { VizDefs, hatchFill } from "@/components/viz/defs";
import { ChartFrame } from "@/components/viz/frame";
import { FocusRing, LegendHatchDefs, StepLegend, useGridFocus, type Cell } from "@/components/viz/heatmap";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { coverageText, formatValue } from "@/lib/num";
import type { Source } from "@/lib/source";
import { cloneGlyphs, cloneOutcomeTable, CLONE_MIN_RUNS, describeCloneOutcome, type CloneOutcomeGrid, type OutcomeCell } from "@/lib/viz-data/clones";
import { ordInk, rampVar } from "@/lib/viz-data/heat";

/*
 * SV-G1 (replaces H4 for a declared or detected clone column): clones x
 * outcomes, MEASURED. Each cell prints the engine's mean, its interval (with the
 * coverage the engine reported) and n. Colour is the mean in 5 stepped classes
 * on one shared ramp with per-column class edges (printed in the legend), so a
 * column compares clones, never outcomes with each other. A cell with fewer
 * than 3 runs carries no colour: the hatch, its n and the engine's reason.
 */

const CHAR_W = 6.6;
const ROW_H = 52;
const HEAD_H = 44;
const MIN_COL = 150;
const MAX_COL = 210;

export function CloneOutcomeHeatmap({ grid, source, width: fixedWidth, bare = false }: { grid: CloneOutcomeGrid; source: Source; width?: number; bare?: boolean }) {
  const description = describeCloneOutcome(grid);
  const cov = coverageText(grid.coverage);
  return (
    <ChartFrame
      bare={bare}
      title="Clones by outcome, measured"
      subtitle={`Each cell: the engine's measured mean for that clone (column ${grid.column})${cov ? `, its ${cov} interval` : " and interval"} and the number of runs (n). Colour compares clones within one column only, on classes that span the column's intervals, so differences smaller than the intervals share a shade. Cells with fewer than ${CLONE_MIN_RUNS} runs carry no colour.`}
      height={HEAD_H + ROW_H * grid.levels.length}
      width={fixedWidth}
      description={description}
      data={cloneOutcomeTable(grid)}
      legend={
        <span className="flex flex-col gap-1">
          <LegendHatchDefs id={`${HATCH}-legend`} />
          {grid.columns.map((c) => (
            <StepLegend
              key={c.key}
              ramp="ord"
              title={
                <span className="font-mono text-fg">
                  {c.key}
                  {c.unit ? ` (${c.unit})` : ""}:
                </span>
              }
              steps={edgeSteps(c.edges, c.decimals)}
            />
          ))}
          <StepLegend ramp="ord" title="" steps={[]} missing={`fewer than ${CLONE_MIN_RUNS} runs or not computed (reason in the cell)`} hatchId={`${HATCH}-legend`} />
        </span>
      }
      footer={
        <>
          {grid.caveat ? <span className="mb-1 block text-fg">{grid.caveat}</span> : null}
          From: {source.label} · strain_summary.levels[].outcomes · measured, no model{source.engineVersion ? ` · engine ${source.engineVersion}` : ""}
          {grid.source === "detected" ? ` · ${grid.column} was detected by its name, not declared: confirm it in the campaign setup` : ""}
        </>
      }
    >
      {(width) => <OutcomeGrid grid={grid} source={source} width={width} description={description} />}
    </ChartFrame>
  );
}

const HATCH = "clone-outcome";

/** Printed class edges of one column (equal-width over the column's means), duplicates dropped for a flat column. */
function edgeSteps(edges: number[], decimals: number) {
  if (edges.length < 2) return [];
  const steps = edges.slice(0, -1).map((lo, i) => ({ k: i + 1, label: `${fmtEdge(lo, decimals)}–${fmtEdge(edges[i + 1], decimals)}` }));
  return steps.filter((s, i) => steps.findIndex((x) => x.label === s.label) === i);
}

function OutcomeGrid({ grid, source, width, description }: { grid: CloneOutcomeGrid; source: Source; width: number; description: string }) {
  const { tip, close, show, pin, hide } = useChartTip();
  const glyphs = useMemo(() => cloneGlyphs(grid.levels.map((l) => l.label)), [grid.levels]);
  const gutter = Math.min(200, Math.ceil(Math.max(...grid.levels.map((l) => l.label.length + 8)) * CHAR_W) + 28);
  const col = Math.max(MIN_COL, Math.min(MAX_COL, Math.floor((width - gutter) / Math.max(1, grid.columns.length))));
  const svgW = gutter + col * grid.columns.length;
  const svgH = HEAD_H + ROW_H * grid.levels.length;
  const rowLengths = useMemo(() => grid.levels.map(() => grid.columns.length), [grid]);
  const tipFor = useCallback(
    (c: Cell, pinned: boolean) => {
      const cell = grid.cells[c.row]?.[c.col];
      if (!cell) return;
      (pinned ? pin : show)(gutter + (c.col + 1) * col, HEAD_H + c.row * ROW_H, <CellTip grid={grid} cell={cell} row={c.row} col={c.col} source={source} />);
    },
    [grid, gutter, col, source, pin, show],
  );
  const focus = useGridFocus(rowLengths, tipFor, close);
  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} className="block" role="img" aria-label={description}>
          <VizDefs id={HATCH} />
          {grid.columns.map((c, j) => (
            <g key={c.key} aria-hidden>
              <text x={gutter + j * col + 8} y={18} fontSize={12} className={c.isTarget ? "fill-fg font-medium" : "fill-fg-muted"}>
                {clip(c.key, col)}
              </text>
              <text x={gutter + j * col + 8} y={34} fontSize={12} className="fill-fg-muted">
                {[c.unit, c.direction === "higher_is_better" ? "higher is better" : c.direction === "lower_is_better" ? "lower is better" : null].filter(Boolean).join(" · ")}
              </text>
            </g>
          ))}
          <g role="grid" aria-label="Clone by outcome cells. Arrow keys move between cells; Enter pins the details." {...focus.containerProps}>
            {grid.levels.map((l, i) => {
              const g = glyphs.get(l.label)!;
              const y = HEAD_H + i * ROW_H;
              return (
                <g key={l.label} role="row">
                  <g aria-hidden>
                    <g transform={`translate(4, ${y + ROW_H / 2 - 9})`}>
                      <CloneMark glyph={g} filled />
                    </g>
                    <text x={20} y={y + ROW_H / 2 - 4} fontSize={12} className="fill-fg font-mono">
                      {l.label}
                    </text>
                    <text x={20} y={y + ROW_H / 2 + 12} fontSize={12} className="fill-fg-muted">
                      {[l.isReference ? "reference" : null, l.isFixed ? "fixed" : null, `${formatValue(l.nRuns, { quantity: "count" }).text} runs`].filter(Boolean).join(" · ")}
                    </text>
                  </g>
                  {grid.cells[i].map((cell, j) => {
                    const x = gutter + j * col;
                    const empty = cell.n === 0;
                    const colored = cell.cls != null;
                    const ink = colored ? ordInk(cell.cls!) : "var(--fg)";
                    return (
                      <g
                        key={cell.outcome}
                        role="gridcell"
                        aria-label={cellLabel(cell, grid)}
                        onMouseEnter={() => tipFor({ row: i, col: j }, false)}
                        onMouseLeave={hide}
                        onClick={() => {
                          focus.setActive({ row: i, col: j });
                          tipFor({ row: i, col: j }, true);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <rect
                          x={x + 1}
                          y={y + 1}
                          width={col - 2}
                          height={ROW_H - 2}
                          rx={3}
                          fill={empty ? "var(--surface)" : colored ? rampVar("ord", cell.cls!) : hatchFill(HATCH)}
                          stroke={empty ? "var(--chart-grid)" : colored ? "var(--chart-grid)" : "var(--chart-refused)"}
                          strokeWidth={0.75}
                          strokeDasharray={empty ? "2 2" : undefined}
                        />
                        <text x={x + 8} y={y + 21} fontSize={12} style={{ fill: ink }} className={colored ? "tabular-nums font-medium" : "tabular-nums"} aria-hidden>
                          {empty ? "0" : clip(cell.text, col)}
                        </text>
                        <text x={x + 8} y={y + 38} fontSize={12} style={{ fill: colored ? ink : "var(--fg-muted)" }} className="tabular-nums" aria-hidden>
                          {`n = ${formatValue(cell.n, { quantity: "count" }).text}${!colored && !empty && cell.n < CLONE_MIN_RUNS ? ` (n<${CLONE_MIN_RUNS})` : ""}`}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {focus.focused && focus.active ? <FocusRing x={gutter + focus.active.col * col} y={HEAD_H + focus.active.row * ROW_H} w={col} h={ROW_H} /> : null}
          </g>
        </svg>
      </div>
      <ChartTooltip tip={tip} onClose={close} width={width} />
    </div>
  );
}

const fmtEdge = (v: number, decimals: number) => formatValue(v, { decimals }).value;

/** Truncate a label to the cell (deterministic glyph metrics), full text in the tooltip and Data table. */
function clip(text: string, width: number): string {
  const max = Math.floor((width - 14) / CHAR_W);
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

function cellLabel(c: OutcomeCell, g: CloneOutcomeGrid): string {
  const cov = coverageText(c.coverage);
  const n = `n = ${c.n}`;
  if (c.n === 0) return `${c.level}, ${c.outcome}: no runs recorded this outcome`;
  if (c.reason) return `${c.level}, ${c.outcome}: ${c.text === "n/a" ? "" : `mean ${c.text}, `}${n}; ${c.reason}`;
  return `${c.level}, ${c.outcome}: measured mean ${c.text}${cov ? ` (${cov} interval)` : ""}, ${n}${g.columns.find((x) => x.key === c.outcome)?.unit ? ` ${g.columns.find((x) => x.key === c.outcome)?.unit}` : ""}`;
}

function CellTip({ grid, cell, row, col, source }: { grid: CloneOutcomeGrid; cell: OutcomeCell; row: number; col: number; source: Source }) {
  const c = grid.columns[col];
  const cov = coverageText(cell.coverage);
  const unit = c.unit ? ` ${c.unit}` : "";
  return (
    <div className="flex flex-col gap-1">
      <p className="pr-5 text-label text-fg">
        <span className="font-mono">{cell.level}</span> · <span className="font-mono">{cell.outcome}</span>
      </p>
      <TipRow label="Measured mean">{cell.mean != null ? `${formatValue(cell.mean, { decimals: c.decimals }).value}${unit}` : "n/a"}</TipRow>
      <TipRow label={cov ? `${cov} interval (t)` : "Interval"}>{cell.ci ? `[${formatValue(cell.ci[0], { decimals: c.decimals }).value}, ${formatValue(cell.ci[1], { decimals: c.decimals }).value}]` : "n/a"}</TipRow>
      <TipRow label="Runs (n)">{formatValue(cell.n, { quantity: "count" }).text}</TipRow>
      {cell.sd != null ? <TipRow label="SD between runs">{formatValue(cell.sd, { fallbackSigFigs: 2 }).value}</TipRow> : null}
      {cell.best != null ? (
        <TipRow label="Best run">
          {formatValue(cell.best, { decimals: c.decimals }).value}
          {cell.bestRunId ? ` (${cell.bestRunId})` : ""}
        </TipRow>
      ) : null}
      {cell.byScale ? <p className="text-fg-muted">Summarized per scale: {cell.byScale.join(", ")}.</p> : null}
      {cell.reason ? <p className="text-fg-muted">No colour: {cell.reason}.</p> : null}
      <TipSource>
        strain_summary.levels[{row}].outcomes.{cell.outcome} · {source.label}
        {source.engineVersion ? ` · engine ${source.engineVersion}` : ""}
      </TipSource>
    </div>
  );
}
