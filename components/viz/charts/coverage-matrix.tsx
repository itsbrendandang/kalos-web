"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import { FocusRing, StepLegend, useGridFocus, type Cell } from "@/components/viz/heatmap";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { formatSetting, formatValue } from "@/lib/num";
import type { Source } from "@/lib/source";
import { binText, COVERAGE_BINS, coverageTable, describeCoverage, type CoverageInput, type CoverageMatrix as Matrix, type PairCounts } from "@/lib/viz-data/coverage-matrix";
import { countClasses, countClassOf, countClassText, ordInk, rampVar } from "@/lib/viz-data/heat";

/*
 * H2 CoverageMatrix: where the runs are, for every pair of the top inputs. A
 * lower-triangle matrix of 8 x 8 run counts over the engine's search box (the
 * count is printed in every cell, 0 included), with the per-input count
 * histogram on the diagonal and the proposals as hollow accent rings at their
 * exact setpoints. Counts only: no smoothing, density or interpolation.
 */
const MIN_CELL = 24;
const MAX_CELL = 36;
const GAP = 8;
const BOTTOM = 40;
const CHAR_W = 6.6;
const count = (n: number) => formatValue(n, { quantity: "count" }).text;

type TipApi = { show: (x: number, y: number, c: ReactNode) => void; pin: (x: number, y: number, c: ReactNode) => void; hide: () => void; close: () => void };

export function CoverageMatrixChart({
  data,
  source,
  actions,
  width: fixedWidth,
  bare = false,
}: {
  data: Matrix;
  source: Source;
  actions?: ReactNode;
  width?: number;
  bare?: boolean;
}) {
  const description = describeCoverage(data);
  const classes = countClasses(data.maxCount);
  const k = data.inputs.length;
  const notes = [
    ...Object.entries(data.outside).map(([n, c]) => `${n}: ${count(c)} outside the search box`),
    ...Object.entries(data.notNumeric).map(([n, c]) => `${n}: ${count(c)} not a number`),
  ];
  return (
    <ChartFrame
      bare={bare}
      title="Where your runs are"
      subtitle={`Runs per bin for each pair of inputs: ${COVERAGE_BINS} equal bins across each input's search box. Empty cells (0) are combinations nobody has run; rings are this batch's proposals.`}
      actions={actions}
      height={k * (28 * COVERAGE_BINS + GAP) + BOTTOM}
      width={fixedWidth}
      description={description}
      data={coverageTable(data)}
      legend={
        <>
          <StepLegend ramp="ord" title="Runs in the cell:" steps={classes.map((c, i) => ({ k: countClassOf(c.lo, classes) || i + 1, label: countClassText(c) }))} empty="0" />
          {data.proposals.length ? <LegendItem mark="predicted">{`a proposal of this batch (${data.proposals[0].key}–${data.proposals[data.proposals.length - 1].key}), at its setpoints: not a result`}</LegendItem> : null}
        </>
      }
      footer={
        <>
          {notes.length ? <span className="mb-1 block">Not placed: {notes.join(" · ")}.</span> : null}
          From: {source.label} · export/rows (rows) and feature_ranges (bins) · {count(data.nPlaced)} of {count(data.nRows)} runs placed · inputs in the engine&apos;s driver order
          {source.engineVersion ? ` · engine ${source.engineVersion}` : ""}
        </>
      }
    >
      {(width) => <MatrixSvg data={data} width={width} source={source} description={description} classes={classes} />}
    </ChartFrame>
  );
}

function MatrixSvg({ data, width, source, description, classes }: { data: Matrix; width: number; source: Source; description: string; classes: { lo: number; hi: number }[] }) {
  const { tip, close, show, pin, hide } = useChartTip();
  const k = data.inputs.length;
  // Row labels are mono (about 7.4px a glyph at 12px), so the gutter fits the longest input name.
  const LEFT = Math.min(170, Math.ceil(Math.max(6, ...data.inputs.map((i) => i.name.length)) * 7.4) + 14);
  // Fit the frame when it can (the last histogram's top label needs a few px), else scroll inside it.
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor((width - LEFT - GAP * k - 8) / Math.max(1, k * COVERAGE_BINS))));
  const P = cell * COVERAGE_BINS;
  const svgW = LEFT + k * (P + GAP);
  const svgH = k * (P + GAP) + BOTTOM;
  const api: TipApi = { show, pin, hide, close };
  const ox = (col: number) => LEFT + col * (P + GAP);
  const oy = (row: number) => row * (P + GAP);
  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} className="block" role="img" aria-label={description}>
          {data.inputs.map((inp, i) => (
            <g key={`label-${inp.name}`} aria-hidden>
              <text x={LEFT - 8} y={oy(i) + P / 2} dy="0.33em" textAnchor="end" fontSize={12} className="fill-fg font-mono">
                {inp.name}
              </text>
              <text x={ox(i) + P / 2} y={oy(k - 1) + P + 30} textAnchor="middle" fontSize={12} className="fill-fg font-mono">
                {clip(inp.name, P)}
              </text>
              <EdgeTicks inp={inp} x={ox(i)} y={oy(k - 1) + P} cell={cell} />
            </g>
          ))}
          {data.diagonal.map((counts, i) => (
            <Histogram key={`h-${i}`} counts={counts} inp={data.inputs[i]} x={ox(i)} y={oy(i)} cell={cell} />
          ))}
          {data.pairs.map((p) => (
            <PairPanel key={`${p.x}-${p.y}`} pair={p} data={data} x={ox(p.x)} y={oy(p.y)} cell={cell} classes={classes} api={api} source={source} />
          ))}
        </svg>
      </div>
      <ChartTooltip tip={tip} onClose={close} width={width} />
    </div>
  );
}

/** Every second bin edge under a bottom-row panel (the full edges are in each tooltip and the Data table). */
function EdgeTicks({ inp, x, y, cell }: { inp: CoverageInput; x: number; y: number; cell: number }) {
  return (
    <g aria-hidden>
      {inp.edges.map((e, b) =>
        b % 2 === 0 ? (
          <g key={b}>
            <line x1={x + b * cell} x2={x + b * cell} y1={y + 1} y2={y + 5} stroke="var(--chart-grid)" />
            <text x={x + b * cell} y={y + 16} textAnchor={b === 0 ? "start" : b === COVERAGE_BINS ? "end" : "middle"} fontSize={12} className="fill-fg-muted tabular-nums">
              {formatSetting(e, inp.range).text}
            </text>
          </g>
        ) : null,
      )}
    </g>
  );
}

function Histogram({ counts, inp, x, y, cell }: { counts: number[]; inp: CoverageInput; x: number; y: number; cell: number }) {
  const P = cell * COVERAGE_BINS;
  const max = Math.max(1, ...counts);
  const top = 18;
  return (
    <g aria-label={`${inp.name}: runs per bin ${counts.join(", ")}`} role="img">
      <rect x={x} y={y} width={P} height={P} fill="var(--subtle)" rx={3} />
      {counts.map((c, b) => {
        const h = ((P - top - 4) * c) / max;
        return (
          <g key={b}>
            {c > 0 ? <rect x={x + b * cell + 3} y={y + P - h} width={cell - 6} height={h} fill="var(--chart-ord-3)" stroke="var(--chart-ord-5)" strokeWidth={0.75} /> : null}
            <text x={x + b * cell + cell / 2} y={y + P - h - 4} textAnchor="middle" fontSize={12} className={c > 0 ? "fill-fg tabular-nums" : "fill-fg-muted tabular-nums"}>
              {c}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function PairPanel({
  pair,
  data,
  x,
  y,
  cell,
  classes,
  api,
  source,
}: {
  pair: PairCounts;
  data: Matrix;
  x: number;
  y: number;
  cell: number;
  classes: { lo: number; hi: number }[];
  api: TipApi;
  source: Source;
}) {
  const X = data.inputs[pair.x];
  const Y = data.inputs[pair.y];
  const P = cell * COVERAGE_BINS;
  // Row 0 of the grid is the TOP bin (highest y), so the panel reads like a scatter plot.
  const rowLengths = useMemo(() => Array.from({ length: COVERAGE_BINS }, () => COVERAGE_BINS), []);
  const at = useCallback((c: Cell) => ({ bx: c.col, by: COVERAGE_BINS - 1 - c.row }), []);
  const tipFor = useCallback(
    (c: Cell, pinned: boolean) => {
      const { bx, by } = at(c);
      (pinned ? api.pin : api.show)(x + (c.col + 1) * cell, y + c.row * cell, <PairTip X={X} Y={Y} bx={bx} by={by} n={pair.counts[by][bx]} ids={pair.ids[by][bx]} source={source} filter={data.filter} />);
    },
    [api, at, x, y, cell, X, Y, pair, source, data.filter],
  );
  const focus = useGridFocus(rowLengths, tipFor, api.close);
  const sx = (v: number) => x + ((v - X.range[0]) / (X.range[1] - X.range[0])) * P;
  const sy = (v: number) => y + P - ((v - Y.range[0]) / (Y.range[1] - Y.range[0])) * P;
  return (
    <g role="grid" aria-label={`${X.name} by ${Y.name}: runs per bin. Arrow keys move between cells; Enter pins the details.`} {...focus.containerProps}>
      {Array.from({ length: COVERAGE_BINS }, (_, row) => (
        <g key={row} role="row">
          {Array.from({ length: COVERAGE_BINS }, (__, col) => {
            const by = COVERAGE_BINS - 1 - row;
            const n = pair.counts[by][col];
            const k = countClassOf(n, classes);
            const cx = x + col * cell;
            const cy = y + row * cell;
            return (
              <g
                key={col}
                role="gridcell"
                aria-label={`${X.name} ${binText(X, col)}, ${Y.name} ${binText(Y, by)}: ${n} run${n === 1 ? "" : "s"}`}
                onMouseEnter={() => tipFor({ row, col }, false)}
                onMouseLeave={api.hide}
                onClick={() => {
                  focus.setActive({ row, col });
                  tipFor({ row, col }, true);
                }}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={cx + 0.5}
                  y={cy + 0.5}
                  width={cell - 1}
                  height={cell - 1}
                  rx={2}
                  fill={n === 0 ? "var(--surface)" : rampVar("ord", k)}
                  stroke="var(--chart-grid)"
                  strokeWidth={0.75}
                  strokeDasharray={n === 0 ? "1.5 1.5" : undefined}
                />
                <text x={cx + cell / 2} y={cy + cell / 2} dy="0.33em" textAnchor="middle" fontSize={12} style={{ fill: n === 0 ? "var(--fg-muted)" : ordInk(k) }} className="tabular-nums" aria-hidden>
                  {n}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      {data.proposals.map((p) => {
        const vx = p.values[X.name];
        const vy = p.values[Y.name];
        if (vx == null || vy == null) return null;
        const px = sx(vx);
        const py = sy(vy);
        return (
          <g key={p.key} aria-hidden>
            <circle cx={px} cy={py} r={5} fill="none" stroke="var(--surface)" strokeWidth={3.5} />
            <circle cx={px} cy={py} r={5} fill="none" stroke="var(--chart-predicted)" strokeWidth={1.5} />
          </g>
        );
      })}
      {focus.focused && focus.active ? <FocusRing x={x + focus.active.col * cell} y={y + focus.active.row * cell} w={cell} h={cell} /> : null}
    </g>
  );
}

function PairTip({ X, Y, bx, by, n, ids, source, filter }: { X: CoverageInput; Y: CoverageInput; bx: number; by: number; n: number; ids: string[]; source: Source; filter: "all" | "rounds" }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="pr-5 text-label text-fg">
        <span className="font-mono">{X.name}</span> × <span className="font-mono">{Y.name}</span>
      </p>
      <TipRow label={X.name}>{binText(X, bx)}</TipRow>
      <TipRow label={Y.name}>{binText(Y, by)}</TipRow>
      <TipRow label={filter === "rounds" ? "Runs added by Kalos rounds" : "Runs (n)"}>{count(n)}</TipRow>
      {ids.length ? (
        <p className="text-fg-muted">
          {ids.slice(0, 8).join(", ")}
          {ids.length > 8 ? ` and ${count(ids.length - 8)} more` : ""}
        </p>
      ) : n === 0 ? (
        <p className="text-fg-muted">No run has been made in this combination.</p>
      ) : null}
      <TipSource>export/rows · bins over feature_ranges · {source.label}</TipSource>
    </div>
  );
}

function clip(text: string, width: number): string {
  const max = Math.floor(width / CHAR_W);
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}
