"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { CloneMark } from "@/components/viz/clone-chip";
import { VizDefs, hatchFill } from "@/components/viz/defs";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import { FocusRing, StepLegend, useGridFocus, type Cell } from "@/components/viz/heatmap";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { coverageText, formatSetting, formatValue } from "@/lib/num";
import type { Source } from "@/lib/source";
import { cloneGlyphs } from "@/lib/viz-data/clones";
import { rampVar } from "@/lib/viz-data/heat";
import { describeMultiples, meanClass, MORE_PAIRS_NOTE, multiplesTable, sdClass, type ModelMultiples as Model, type StripPanel, type SurfacePanel } from "@/lib/viz-data/model-multiples";

/*
 * H3 ModelMultiples: what the model predicts and how unsure it is, as small
 * multiples that share their colour classes. Top: the engine's one surface
 * pair, mean (violet ramp) beside σ (grey ramp), measured runs projected into
 * the grid as printed counts, proposals as hollow accent rings, the reference
 * recipe as a diamond. Below: every one-input slice as two strips (mean, σ),
 * one row for the reference recipe and one per clone when the engine sliced by
 * clone. Every value is an engine grid point; nothing is interpolated.
 */
const ID = "model-multiples";
const CHAR_W = 6.6;
const fmt = (v: number) => formatValue(v, { fallbackSigFigs: 3 }).value;

type TipApi = { show: (x: number, y: number, c: ReactNode) => void; pin: (x: number, y: number, c: ReactNode) => void; hide: () => void; close: () => void };

export function ModelMultiplesChart({
  data,
  target,
  unit,
  proposals,
  source,
  width: fixedWidth,
  bare = false,
}: {
  data: Model;
  target: string;
  unit: string | null;
  /** Proposal setpoints keyed P1..Pn (recipe values, not results). */
  proposals: { key: string; recipe: Record<string, number | string> }[];
  source: Source;
  width?: number;
  bare?: boolean;
}) {
  const description = describeMultiples(data, target);
  const cov = coverageText(data.coverage);
  const edgeSteps = (edges: number[]) => edges.slice(0, -1).map((lo, i) => ({ k: i + 1, label: `${fmt(lo)}–${fmt(edges[i + 1])}` }));
  return (
    <ChartFrame
      bare={bare}
      title={`Model mean and uncertainty, ${target}`}
      subtitle="Predicted by the model, not measured. Other inputs are held at the reference recipe. One set of colour classes for every panel, so the same shade is the same predicted value."
      height={360}
      width={fixedWidth}
      description={description}
      data={multiplesTable(data)}
      legend={
        <span className="flex flex-col gap-1">
          <StepLegend ramp="seq" title={`Predicted mean${unit ? ` (${unit})` : ""}:`} steps={edgeSteps(data.meanEdges)} />
          {data.sdEdges.length ? <StepLegend ramp="unc" title={`σ, model posterior SD${unit ? ` (${unit})` : ""}:`} steps={edgeSteps(data.sdEdges)} /> : null}
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Numbers in the surface cells (dots on a narrow screen): measured runs (n) in that cell, projected (their other inputs differ); a cell without one has none. Every cell&apos;s n is in its tooltip.</span>
            <LegendItem mark="derived">reference recipe</LegendItem>
            {proposals.length ? <LegendItem mark="predicted">proposal setpoint</LegendItem> : null}
          </span>
        </span>
      }
      footer={
        <>
          σ and the slice bands are the model&apos;s own{cov ? ` (${cov} model band)` : ""}, not held-out calibrated. {data.surface ? MORE_PAIRS_NOTE : (data.surfaceReason ? `No surface: ${data.surfaceReason}.` : "")}
          <span className="block">
            From: {source.label} · response_surface.{"{z, std}"}, slices[], slices_by_level · basis predicted{source.engineVersion ? ` · engine ${source.engineVersion}` : ""}
          </span>
        </>
      }
    >
      {(width) => <Body data={data} width={width} target={target} unit={unit} proposals={proposals} source={source} description={description} />}
    </ChartFrame>
  );
}

function Body({ data, width, target, unit, proposals, source, description }: { data: Model; width: number; target: string; unit: string | null; proposals: { key: string; recipe: Record<string, number | string> }[]; source: Source; description: string }) {
  const { tip, close, show, pin, hide } = useChartTip();
  const api: TipApi = { show, pin, hide, close };
  return (
    <div className="relative flex flex-col gap-6">
      {data.surface ? <SurfacePair s={data.surface} data={data} width={width} api={api} target={target} unit={unit} proposals={proposals} source={source} /> : null}
      {data.rows.length ? <Strips data={data} width={width} api={api} unit={unit} source={source} description={description} /> : null}
      <ChartTooltip tip={tip} onClose={close} width={width} />
    </div>
  );
}

/* ----------------------------------------------------------------- surface pair */

function SurfacePair({ s, data, width, api, target, unit, proposals, source }: { s: SurfacePanel; data: Model; width: number; api: TipApi; target: string; unit: string | null; proposals: { key: string; recipe: Record<string, number | string> }[]; source: Source }) {
  const two = width >= 600 && s.sd != null;
  const left = 56;
  const panelW = Math.min(420, Math.floor((two ? (width - 24) / 2 : width) - left));
  const n = s.xVals.length;
  const m = s.yVals.length;
  const cell = Math.max(8, Math.floor(panelW / n));
  return (
    <div className={two ? "flex gap-6 overflow-x-auto" : "flex flex-col gap-4 overflow-x-auto"}>
      <SurfaceGrid s={s} kind="mean" cell={cell} left={left} rowsN={m} colsN={n} data={data} api={api} target={target} unit={unit} proposals={proposals} source={source} />
      {s.sd ? (
        <SurfaceGrid s={s} kind="sd" cell={cell} left={left} rowsN={m} colsN={n} data={data} api={api} target={target} unit={unit} proposals={proposals} source={source} />
      ) : (
        <p className="self-center text-caption text-fg-muted">σ map not in this analysis: the engine sent no response_surface.std.</p>
      )}
    </div>
  );
}

function SurfaceGrid({
  s,
  kind,
  cell,
  left,
  rowsN,
  colsN,
  data,
  api,
  target,
  unit,
  proposals,
  source,
}: {
  s: SurfacePanel;
  kind: "mean" | "sd";
  cell: number;
  left: number;
  rowsN: number;
  colsN: number;
  data: Model;
  api: TipApi;
  target: string;
  unit: string | null;
  proposals: { key: string; recipe: Record<string, number | string> }[];
  source: Source;
}) {
  const W = cell * colsN;
  const H = cell * rowsN;
  const top = 20;
  const svgW = left + W + 8;
  const svgH = top + H + 40;
  // Grid row 0 is the highest y value (drawn at the top).
  const rowLengths = useMemo(() => Array.from({ length: rowsN }, () => colsN), [rowsN, colsN]);
  const yi = useCallback((row: number) => rowsN - 1 - row, [rowsN]);
  const tipFor = useCallback(
    (c: Cell, pinned: boolean) => {
      const i = yi(c.row);
      const j = c.col;
      (pinned ? api.pin : api.show)(
        left + (j + 1) * cell,
        top + c.row * cell,
        <div className="flex flex-col gap-1">
          <p className="pr-5 text-label text-fg">Model prediction at one grid point</p>
          <TipRow label={s.xName}>{fmt(s.xVals[j])}</TipRow>
          <TipRow label={s.yName}>{fmt(s.yVals[i])}</TipRow>
          <TipRow label={`Predicted ${target}`}>{`${fmt(s.mean[i][j])}${unit ? ` ${unit}` : ""}`}</TipRow>
          <TipRow label="σ (model)">{s.sd ? fmt(s.sd[i][j]) : "n/a"}</TipRow>
          <TipRow label="Measured runs in this cell (n)">{formatValue(s.runs[i][j], { quantity: "count" }).text}</TipRow>
          <p className="text-fg-muted">Projected: those runs differ from the reference recipe in their other inputs.</p>
          <TipSource>
            response_surface.{kind === "mean" ? "z" : "std"}[{i}][{j}] · {source.label}
          </TipSource>
        </div>,
      );
    },
    [api, yi, left, cell, s, target, unit, kind, source],
  );
  const focus = useGridFocus(rowLengths, tipFor, api.close);
  const sx = (v: number) => left + ((v - s.xVals[0]) / (s.xVals[colsN - 1] - s.xVals[0])) * (W - cell) + cell / 2;
  const sy = (v: number) => top + H - (((v - s.yVals[0]) / (s.yVals[rowsN - 1] - s.yVals[0])) * (H - cell) + cell / 2);
  const fx = s.fixed?.[s.xName];
  const fy = s.fixed?.[s.yName];
  const title = kind === "mean" ? `Predicted ${target}` : "σ (model uncertainty)";
  return (
    <svg width={svgW} height={svgH} className="block shrink-0" role="img" aria-label={`${title} over ${s.xName} and ${s.yName}, ${colsN} by ${rowsN} grid points`}>
      <text x={left} y={13} fontSize={12} className="fill-fg font-medium">
        {title}
      </text>
      <g role="grid" aria-label={`${title}: arrow keys move between grid points; Enter pins the details.`} {...focus.containerProps}>
        {Array.from({ length: rowsN }, (_, row) => {
          const i = yi(row);
          return (
            <g key={row} role="row">
              {Array.from({ length: colsN }, (__, j) => {
                const v = kind === "mean" ? s.mean[i][j] : (s.sd?.[i][j] ?? null);
                const k = kind === "mean" ? meanClass(data, v) : sdClass(data, v);
                const nRuns = s.runs[i][j];
                return (
                  <g
                    key={j}
                    role="gridcell"
                    aria-label={`${s.xName} ${fmt(s.xVals[j])}, ${s.yName} ${fmt(s.yVals[i])}: ${kind === "mean" ? "predicted" : "σ"} ${v != null ? fmt(v) : "n/a"}, ${nRuns} measured run${nRuns === 1 ? "" : "s"}`}
                    onMouseEnter={() => tipFor({ row, col: j }, false)}
                    onMouseLeave={api.hide}
                    onClick={() => {
                      focus.setActive({ row, col: j });
                      tipFor({ row, col: j }, true);
                    }}
                  >
                    <rect x={left + j * cell} y={top + row * cell} width={cell} height={cell} fill={k != null ? rampVar(kind === "mean" ? "seq" : "unc", k) : "var(--subtle)"} />
                    {nRuns > 0 ? (
                      cell >= 14 ? (
                        <text x={left + j * cell + cell / 2} y={top + row * cell + cell / 2} dy="0.33em" textAnchor="middle" fontSize={Math.min(12, cell - 2)} className="fill-fg font-medium tabular-nums" paintOrder="stroke" stroke="var(--surface)" strokeWidth={2.5} aria-hidden>
                          {nRuns}
                        </text>
                      ) : (
                        <circle cx={left + j * cell + cell / 2} cy={top + row * cell + cell / 2} r={2} fill="var(--chart-measured)" stroke="var(--surface)" strokeWidth={1} aria-hidden />
                      )
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
        {focus.focused && focus.active ? <FocusRing x={left + focus.active.col * cell} y={top + focus.active.row * cell} w={cell} h={cell} /> : null}
      </g>
      <rect x={left} y={top} width={W} height={H} fill="none" stroke="var(--border-strong)" aria-hidden />
      {typeof fx === "number" && typeof fy === "number" ? (
        <path d={`M${sx(fx)} ${sy(fy) - 6} L${sx(fx) + 6} ${sy(fy)} L${sx(fx)} ${sy(fy) + 6} L${sx(fx) - 6} ${sy(fy)} Z`} fill="var(--chart-reference)" stroke="var(--surface)" strokeWidth={1.5} aria-hidden />
      ) : null}
      {proposals.map((p) => {
        const px = p.recipe[s.xName];
        const py = p.recipe[s.yName];
        if (typeof px !== "number" || typeof py !== "number") return null;
        return (
          <g key={p.key} aria-hidden>
            <circle cx={sx(px)} cy={sy(py)} r={5} fill="none" stroke="var(--surface)" strokeWidth={3.5} />
            <circle cx={sx(px)} cy={sy(py)} r={5} fill="none" stroke="var(--chart-predicted)" strokeWidth={1.5} />
            <text x={sx(px) + 7} y={sy(py) - 5} fontSize={12} className="fill-accent font-medium" paintOrder="stroke" stroke="var(--surface)" strokeWidth={3}>
              {p.key.slice(1)}
            </text>
          </g>
        );
      })}
      <g aria-hidden className="fill-fg-muted tabular-nums" fontSize={12}>
        <text x={left} y={top + H + 14}>{fmt(s.xVals[0])}</text>
        <text x={left + W} y={top + H + 14} textAnchor="end">
          {fmt(s.xVals[colsN - 1])}
        </text>
        <text x={left + W / 2} y={top + H + 30} textAnchor="middle" className="fill-fg font-mono">
          {s.xName}
        </text>
        <text x={left - 4} y={top + H} textAnchor="end">
          {fmt(s.yVals[0])}
        </text>
        <text x={left - 4} y={top + 10} textAnchor="end">
          {fmt(s.yVals[rowsN - 1])}
        </text>
        <text transform={`translate(${12}, ${top + H / 2}) rotate(-90)`} textAnchor="middle" className="fill-fg font-mono">
          {s.yName}
        </text>
      </g>
    </svg>
  );
}

/* ----------------------------------------------------------------------- strips */

const STRIP_MEAN = 16;
const STRIP_SD = 10;
const ROW_GAP = 14;

function Strips({ data, width, api, unit, source, description }: { data: Model; width: number; api: TipApi; unit: string | null; source: Source; description: string }) {
  const glyphs = useMemo(() => cloneGlyphs(data.rows.filter((r) => r.clone).map((r) => r.clone as string)), [data.rows]);
  const gutter = Math.min(220, Math.ceil(Math.max(14, ...data.rows.map((r) => r.label.length + 6)) * CHAR_W) + 24);
  const k = data.features.length;
  const panelW = Math.max(124, Math.floor((width - gutter - 12 * k) / Math.max(1, k)));
  const rowH = STRIP_MEAN + STRIP_SD + 2 + ROW_GAP;
  const head = 34;
  const svgW = gutter + k * (panelW + 12);
  const svgH = head + data.rows.length * rowH + 20;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-fg">One input at a time{data.rows.some((r) => r.clone) ? ", per clone" : ""}: mean (top strip) and σ (bottom strip)</p>
      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} className="block" role="img" aria-label={description}>
          <VizDefs id={ID} />
          {data.features.map((f, j) => {
            const any = data.rows.map((r) => r.panels[j]).find(Boolean);
            const x0 = gutter + j * (panelW + 12);
            return (
              <g key={f} aria-hidden>
                <text x={x0} y={14} fontSize={12} className="fill-fg font-mono">
                  {clip(f, panelW)}
                </text>
                {any?.range ? (
                  <text x={x0} y={28} fontSize={12} className="fill-fg-muted tabular-nums">
                    {`${formatSetting(any.range[0], any.range).text} to ${formatSetting(any.range[1], any.range).text}`}
                  </text>
                ) : null}
              </g>
            );
          })}
          {data.rows.map((r, i) => {
            const y = head + i * rowH;
            const g = r.clone ? glyphs.get(r.clone) : null;
            return (
              <g key={r.key}>
                <g aria-hidden>
                  {g ? (
                    <g transform={`translate(0, ${y + 3})`}>
                      <CloneMark glyph={g} filled />
                    </g>
                  ) : null}
                  <text x={g ? 16 : 0} y={y + 12} fontSize={12} className={r.clone ? "fill-fg font-mono" : "fill-fg"}>
                    {clip(r.label, gutter - 20)}
                  </text>
                  <text x={g ? 16 : 0} y={y + 26} fontSize={12} className="fill-fg-muted tabular-nums">
                    {r.n != null ? `n = ${formatValue(r.n, { quantity: "count" }).text} runs` : "n = n/a"}
                  </text>
                </g>
                {r.skipped ? (
                  <g aria-label={`${r.label}: ${r.skipped}`} role="img">
                    <rect x={gutter} y={y} width={k * (panelW + 12) - 12} height={STRIP_MEAN + STRIP_SD + 2} rx={3} fill={hatchFill(ID)} stroke="var(--chart-refused)" />
                    <text x={gutter + 8} y={y + 18} fontSize={12} className="fill-fg">
                      {r.skipped}
                    </text>
                  </g>
                ) : (
                  r.panels.map((p, j) => (p ? <StripPanelG key={j} p={p} row={r.label} x={gutter + j * (panelW + 12)} y={y} w={panelW} data={data} api={api} unit={unit} source={source} /> : null))
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function StripPanelG({ p, row, x, y, w, data, api, unit, source }: { p: StripPanel; row: string; x: number; y: number; w: number; data: Model; api: TipApi; unit: string | null; source: Source }) {
  const n = p.x.length;
  const cw = w / n;
  const rowLengths = useMemo(() => [n, p.sd.length ? n : 0], [n, p.sd.length]);
  const cov = coverageText(p.coverage);
  const tipFor = useCallback(
    (c: Cell, pinned: boolean) => {
      const i = c.col;
      (pinned ? api.pin : api.show)(
        x + (i + 1) * cw,
        y,
        <div className="flex flex-col gap-1">
          <p className="pr-5 text-label text-fg">
            {row} · <span className="font-mono">{p.feature}</span>
          </p>
          <TipRow label={`${p.feature} (grid point ${i + 1} of ${n})`}>{fmt(p.x[i])}</TipRow>
          <TipRow label="Predicted mean">{`${fmt(p.mean[i])}${unit ? ` ${unit}` : ""}`}</TipRow>
          <TipRow label="σ (model)">{p.sd[i] != null ? fmt(p.sd[i]) : "n/a"}</TipRow>
          <TipRow label={cov ? `${cov} model band` : "Model band"}>{p.lo[i] != null && p.hi[i] != null ? `[${fmt(p.lo[i])}, ${fmt(p.hi[i])}]` : "n/a"}</TipRow>
          <p className="text-fg-muted">Model band, not held-out calibrated. Other inputs held at the reference recipe.</p>
          <TipSource>
            {row.startsWith("Best") ? "slices" : "slices_by_level"}[{p.feature}].mean[{i}] · {source.label}
          </TipSource>
        </div>,
      );
    },
    [api, x, cw, y, row, p, n, unit, cov, source],
  );
  const focus = useGridFocus(rowLengths, tipFor, api.close);
  const refI = p.reference != null ? p.x.reduce((b, v, i) => (Math.abs(v - (p.reference as number)) < Math.abs(p.x[b] - (p.reference as number)) ? i : b), 0) : null;
  return (
    <g role="grid" aria-label={`${row}, ${p.feature}: predicted mean and σ along ${n} grid points. Arrow keys move; Enter pins.`} {...focus.containerProps}>
      <g role="row">
        {p.mean.map((v, i) => (
          <rect
            key={i}
            role="gridcell"
            aria-label={`${p.feature} ${fmt(p.x[i])}: predicted ${fmt(v)}`}
            x={x + i * cw}
            y={y}
            width={cw + 0.5}
            height={STRIP_MEAN}
            fill={rampVar("seq", meanClass(data, v) ?? 1)}
            onMouseEnter={() => tipFor({ row: 0, col: i }, false)}
            onMouseLeave={api.hide}
            onClick={() => tipFor({ row: 0, col: i }, true)}
          />
        ))}
      </g>
      {p.sd.length ? (
        <g role="row">
          {p.sd.map((v, i) => (
            <rect
              key={i}
              role="gridcell"
              aria-label={`${p.feature} ${fmt(p.x[i])}: σ ${fmt(v)}`}
              x={x + i * cw}
              y={y + STRIP_MEAN + 2}
              width={cw + 0.5}
              height={STRIP_SD}
              fill={rampVar("unc", sdClass(data, v) ?? 1)}
              onMouseEnter={() => tipFor({ row: 1, col: i }, false)}
              onMouseLeave={api.hide}
              onClick={() => tipFor({ row: 1, col: i }, true)}
            />
          ))}
        </g>
      ) : null}
      <rect x={x} y={y} width={w} height={STRIP_MEAN + STRIP_SD + 2} fill="none" stroke="var(--border-strong)" strokeWidth={0.75} aria-hidden />
      {refI != null ? <path d={`M${x + (refI + 0.5) * cw} ${y + 2} L${x + (refI + 0.5) * cw + 4} ${y + 8} L${x + (refI + 0.5) * cw} ${y + 14} L${x + (refI + 0.5) * cw - 4} ${y + 8} Z`} fill="var(--chart-reference)" stroke="var(--surface)" strokeWidth={1.25} aria-hidden /> : null}
      {focus.focused && focus.active ? <FocusRing x={x + focus.active.col * cw - 1} y={focus.active.row === 0 ? y - 1 : y + STRIP_MEAN + 1} w={Math.max(cw + 2, 6)} h={(focus.active.row === 0 ? STRIP_MEAN : STRIP_SD) + 2} /> : null}
    </g>
  );
}

function clip(text: string, width: number): string {
  const max = Math.floor(width / CHAR_W);
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}
