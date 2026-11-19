"use client";

/*
 * C5 SurfacePair (VIZ_SPEC section 5): what the model believes across two
 * inputs (filled contour bands of the engine's predicted mean on the violet
 * ramp) and, only when the engine sent its `std` grid, where it is guessing
 * (the same axes on the grey ramp). Never a synthesized sigma: without `std`
 * the mean panel is full width with a not-scored note.
 *
 * Overlays, identical on both panels: measured runs as small filled ink dots
 * (projected: their other inputs differ), the incumbent as a filled diamond,
 * proposals as hollow accent rings labelled P1..Pn as the batch rows number
 * them. Hover or arrow keys move a crosshair linked across the panels.
 */
import { useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { scaleLinear } from "@visx/scale";
import { CircleDashed } from "lucide-react";
import { XAxis, YAxis, tickFormatter } from "@/components/viz/axes";
import { ChartFrame } from "@/components/viz/frame";
import { PredictedDot } from "@/components/viz/marks";
import { ChartTooltip, TipRow, TipSource, useChartTip, type TipState } from "@/components/viz/tooltip";
import { sourceLines, type Source } from "@/lib/source";
import { MAX_FOCUSABLE_MARKS } from "@/lib/viz-thresholds";
import { sourceFooter } from "@/lib/viz-data/driver-forest";
import {
  FLAT_NOTE,
  NO_SD_NOTE,
  RUNS_CAVEAT,
  SD_NOTE,
  sdKindText,
  bandLabels,
  bandStep,
  bandThresholds,
  contourBands,
  describeSurfacePair,
  fmtAxis,
  fmtMean,
  fmtSd,
  gridExtent,
  gridToValue,
  heldText,
  isFlat,
  nearestIndex,
  surfaceTable,
  type Ring,
  type SurfacePairData,
} from "@/lib/viz-data/surface-pair";

export type SurfacePairProps = SurfacePairData & {
  /** Target display name and its unit (parsed from the header; never invented). */
  target: string;
  unit?: string | null;
  source: Source;
  width?: number;
  stale?: { nNew: number } | null;
  static?: boolean;
  bare?: boolean;
};

const M = { top: 8, right: 12, bottom: 54, left: 60 };
const TWO_UP = 720;

type Cell = { row: number; col: number };

type LabelPos = { x: number; y: number; anchor: "start" | "end" };

/** Greedy label placement for proposal ids: the first spot around the marker that does not collide with a placed label. */
export function placeLabels(points: { key: string; cx: number; cy: number }[], avoid: { cx: number; cy: number }[] = []): LabelPos[] {
  // Markers (proposals, incumbent) are obstacles too, so a label never sits on another ring.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [...points, ...avoid].map((m) => ({ x0: m.cx - 6, x1: m.cx + 6, y0: m.cy - 6, y1: m.cy + 6 }));
  const offsets: [number, number, "start" | "end"][] = [
    [8, -7, "start"],
    [8, 14, "start"],
    [-8, -7, "end"],
    [-8, 14, "end"],
    [8, -21, "start"],
    [-8, -21, "end"],
    [8, 28, "start"],
    [-8, 28, "end"],
  ];
  return points.map((p) => {
    const w = 7 * p.key.length + 4;
    const box = (o: [number, number, "start" | "end"]) => {
      const x = p.cx + o[0];
      const y = p.cy + o[1];
      return { x0: o[2] === "start" ? x : x - w, x1: o[2] === "start" ? x + w : x, y0: y - 11, y1: y + 2 };
    };
    const hit = (b: ReturnType<typeof box>) => placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
    const o = offsets.find((c) => !hit(box(c))) ?? offsets[0];
    placed.push(box(o));
    return { x: p.cx + o[0], y: p.cy + o[1], anchor: o[2] };
  });
}

const px = (v: number) => Math.round(v * 100) / 100;

function ringPath(ring: Ring, fx: (c: number) => number, fy: (c: number) => number): string {
  return ring.map(([cx, cy], i) => `${i ? "L" : "M"}${px(fx(cx))} ${px(fy(cy))}`).join("") + "Z";
}

export function SurfacePair(props: SurfacePairProps) {
  const unit = props.unit ?? null;
  const table = surfaceTable(props, unit);
  const panelsH = props.sd ? 360 : 400;
  return (
    <ChartFrame
      title={`Model-predicted ${props.target}${unit ? ` (${unit})` : ""} across ${props.x.name} and ${props.y.name}`}
      subtitle={heldText(props)}
      stale={props.stale}
      data={table}
      description={describeSurfacePair(props, props.target, unit)}
      footer={sourceFooter(props.source, { value: props.runs.length, word: "measured run" })}
      width={props.width}
      height={panelsH}
      bare={props.bare}
      legend={
        <>
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden>
              <circle cx="5" cy="5" r="3" fill="var(--chart-measured)" stroke="var(--surface)" strokeWidth="0.75" />
            </svg>
            Measured runs ({RUNS_CAVEAT})
          </span>
          {props.incumbent ? (
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
                <path d="M6 1 L11 6 L6 11 L1 6 Z" fill="var(--chart-measured)" stroke="var(--surface)" strokeWidth="1" />
              </svg>
              Incumbent recipe (the held recipe)
            </span>
          ) : null}
          {props.proposals.length ? (
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
                <circle cx="6" cy="6" r="4" fill="var(--surface)" stroke="var(--chart-predicted)" strokeWidth="1.5" />
              </svg>
              Proposed experiment, numbered as in the batch (its other inputs differ, so the surface is not its prediction)
            </span>
          ) : null}
        </>
      }
    >
      {(w) => <Panels {...props} unit={unit} width={w} />}
    </ChartFrame>
  );
}

function Panels(props: SurfacePairProps & { width: number; unit: string | null }) {
  const { width, x, y, mean, sd, unit } = props;
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  const twoUp = sd != null && width >= TWO_UP;
  const gap = 24;
  const pw = twoUp ? Math.floor((width - gap) / 2) : width;
  const ph = sd ? Math.round(Math.min(360, Math.max(240, pw * 0.78))) : Math.round(Math.min(420, Math.max(260, width * 0.42)));
  const [hover, setHover] = useState<Cell | null>(null);
  const [tipPanel, setTipPanel] = useState<"mean" | "sd" | null>(null);

  const xs = useMemo(() => scaleLinear<number>({ domain: [Math.min(...x.values), Math.max(...x.values)], range: [M.left, pw - M.right] }), [x.values, pw]);
  const ys = useMemo(() => scaleLinear<number>({ domain: [Math.min(...y.values), Math.max(...y.values)], range: [ph - M.bottom, M.top] }), [y.values, ph]);

  const readout = (c: Cell) => {
    const s = sd?.[c.row]?.[c.col] ?? null;
    return `predicted ${fmtMean(mean[c.row][c.col], s, unit)}${s != null ? ` · σ ${fmtSd(s, unit)}` : ""} at ${x.name} ${fmtAxis(x, x.values[c.col])}, ${y.name} ${fmtAxis(y, y.values[c.row])}`;
  };
  const time = sourceLines(props.source).find(([k]) => k === "Time")?.[1];

  const cellTip = (c: Cell, panel: "mean" | "sd"): TipState => {
    const s = sd?.[c.row]?.[c.col] ?? null;
    return {
      x: xs(x.values[c.col]),
      y: ys(y.values[c.row]) + 8,
      pinned: false,
      content: (
        <div className="flex flex-col gap-1">
          <TipRow label="Predicted mean">{fmtMean(mean[c.row][c.col], s, unit)}</TipRow>
          {s != null ? <TipRow label={`Model σ (${SD_NOTE})`}>{fmtSd(s, unit)}</TipRow> : <TipRow label="Model σ">Not scored</TipRow>}
          <TipRow label={x.name}>{fmtAxis(x, x.values[c.col])}</TipRow>
          <TipRow label={y.name}>{fmtAxis(y, y.values[c.row])}</TipRow>
          <TipSource>
            response_surface.{panel === "sd" ? "std" : "z"}[{c.row}][{c.col}]{time ? ` · analysis ${time}` : ""}
            {props.source.engineVersion ? ` · engine ${props.source.engineVersion}` : ""}
          </TipSource>
        </div>
      ),
    };
  };

  const shared = { ...props, xs, ys, pw, ph, uid, hover, setHover, readout, cellTip, tipPanel, setTipPanel };

  return (
    <div className="flex flex-col gap-3">
      <div className={twoUp ? "grid grid-cols-2 gap-6" : "flex flex-col gap-6"}>
        <Panel {...shared} kind="mean" grid={mean} />
        {sd ? <Panel {...shared} kind="sd" grid={sd} /> : null}
      </div>
      {!sd ? (
        <p className="flex items-center gap-1.5 text-caption text-fg-muted" role="note">
          <CircleDashed className="size-3.5 shrink-0" aria-hidden />
          <span>
            Model uncertainty map: Not scored. <span className="text-fg">{NO_SD_NOTE}</span>
          </span>
        </p>
      ) : null}
      {props.outside.length ? (
        <p className="text-caption text-fg-muted">
          {props.outside.join(", ")} {props.outside.length === 1 ? "lies" : "lie"} outside the plotted range and {props.outside.length === 1 ? "is" : "are"} not drawn.
        </p>
      ) : null}
      <p className="min-h-4 text-caption text-fg tabular-nums" aria-live="polite">
        {hover ? readout(hover) : "Hover or focus the map and use the arrow keys to read the model at a grid point."}
      </p>
    </div>
  );
}

type PanelProps = SurfacePairProps & {
  unit: string | null;
  kind: "mean" | "sd";
  grid: number[][];
  xs: (v: number) => number;
  ys: (v: number) => number;
  pw: number;
  ph: number;
  uid: string;
  hover: Cell | null;
  setHover: (c: Cell | null) => void;
  readout: (c: Cell) => string;
  cellTip: (c: Cell, panel: "mean" | "sd") => TipState;
  tipPanel: "mean" | "sd" | null;
  setTipPanel: (p: "mean" | "sd" | null) => void;
};

function Panel(p: PanelProps) {
  const { kind, grid, x, y, xs, ys, pw, ph, uid, hover, setHover, unit } = p;
  const { tip, markProps, close } = useChartTip();
  const ramp = kind === "mean" ? "--chart-seq-" : "--chart-unc-";
  const [lo, hi] = useMemo(() => gridExtent(grid), [grid]);
  const thresholds = useMemo(() => bandThresholds(lo, hi), [lo, hi]);
  const bands = useMemo(() => contourBands(grid, thresholds), [grid, thresholds]);
  const nBands = thresholds.length + 1;
  const flat = isFlat(lo, hi);
  const legendFmt = tickFormatter(thresholds.length ? thresholds : [lo, hi]);
  const labels = bandLabels(thresholds, thresholds.length ? legendFmt : (v) => (kind === "mean" ? fmtMean(v, null, null) : fmtSd(v, null)), lo, hi);
  const clip = `${uid}-${kind}-clip`;
  const fx = (c: number) => xs(gridToValue(x.values, c));
  const fy = (c: number) => ys(gridToValue(y.values, c));
  const left = M.left;
  const right = pw - M.right;
  const top = M.top;
  const bottom = ph - M.bottom;
  const xTicks = (xs as unknown as { ticks: (n: number) => number[] }).ticks(pw < 360 ? 3 : 5);
  const yTicks = (ys as unknown as { ticks: (n: number) => number[] }).ticks(5);
  const interactive = !p.static;
  const focusable = interactive && p.proposals.length <= MAX_FOCUSABLE_MARKS;
  const title = kind === "mean" ? `Predicted mean${unit ? ` (${unit})` : ""}` : `Model uncertainty (σ${unit ? `, ${unit}` : ""}), not an interval`;

  const cellFromEvent = (e: MouseEvent<SVGRectElement>): Cell => {
    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const vx = x.values[0] + ((px - xs(x.values[0])) / (xs(x.values[x.values.length - 1]) - xs(x.values[0]))) * (x.values[x.values.length - 1] - x.values[0]);
    const vy = y.values[0] + ((py - ys(y.values[0])) / (ys(y.values[y.values.length - 1]) - ys(y.values[0]))) * (y.values[y.values.length - 1] - y.values[0]);
    return { row: nearestIndex(y.values, vy), col: nearestIndex(x.values, vx) };
  };

  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    const c = hover ?? startCell(p);
    const nx = x.values.length;
    const ny = y.values.length;
    const ascX = x.values[nx - 1] > x.values[0] ? 1 : -1;
    const ascY = y.values[ny - 1] > y.values[0] ? 1 : -1;
    const moves: Record<string, Cell> = {
      ArrowRight: { row: c.row, col: c.col + ascX },
      ArrowLeft: { row: c.row, col: c.col - ascX },
      ArrowUp: { row: c.row + ascY, col: c.col },
      ArrowDown: { row: c.row - ascY, col: c.col },
      Home: { row: c.row, col: ascX > 0 ? 0 : nx - 1 },
      End: { row: c.row, col: ascX > 0 ? nx - 1 : 0 },
    };
    const m = moves[e.key];
    if (e.key === "Escape") {
      setHover(null);
      return;
    }
    if (!m) return;
    e.preventDefault();
    setHover({ row: Math.max(0, Math.min(ny - 1, m.row)), col: Math.max(0, Math.min(nx - 1, m.col)) });
    p.setTipPanel(kind);
  };

  const labels_ = placeLabels(
    p.proposals.map((q) => ({ key: q.key, cx: xs(q.x), cy: ys(q.y) })),
    p.incumbent ? [{ cx: xs(p.incumbent.x), cy: ys(p.incumbent.y) }] : [],
  );

  const activeTip: TipState = tip ?? (hover && p.tipPanel === kind ? p.cellTip(hover, kind) : null);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-label text-fg">{title}</p>
      {kind === "sd" ? <p className="-mt-1.5 text-caption text-fg-muted">Grey: {sdKindText(p.sdKind)}. A model σ, not held-out calibrated and not a coverage band.</p> : null}
      <div className="relative">
        <svg width={pw} height={ph} role="group" aria-label={`${title}: filled contour map over ${x.name} and ${y.name}`} className="block">
          <defs>
            <clipPath id={clip}>
              <rect x={left} y={top} width={right - left} height={bottom - top} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clip})`} aria-hidden>
            <rect x={left} y={top} width={right - left} height={bottom - top} fill={`var(${ramp}${bandStep(0, nBands)})`} stroke="none" />
            {bands.map((b, k) => (
              <path
                key={b.threshold}
                d={b.polygons.map((poly) => poly.map((ring) => ringPath(ring, fx, fy)).join("")).join("")}
                fill={`var(${ramp}${bandStep(k + 1, nBands)})`}
                fillRule="evenodd"
                stroke="var(--surface)"
                strokeWidth={1}
              />
            ))}
          </g>
          <rect x={left} y={top} width={right - left} height={bottom - top} fill="none" stroke="var(--border-strong)" strokeWidth={1} aria-hidden />

          <XAxis scale={xs as never} top={bottom} ticks={xTicks} format={tickFormatter(xTicks)} label={x.name} />
          <YAxis scale={ys as never} left={left} ticks={yTicks} format={tickFormatter(yTicks)} label={y.name} />

          {/* Interaction surface: hover anywhere, or focus and use the arrow keys (one tab stop, on the mean panel). */}
          {interactive ? (
            <rect
              x={left}
              y={top}
              width={right - left}
              height={bottom - top}
              fill="transparent"
              tabIndex={kind === "mean" ? 0 : -1}
              role="application"
              aria-roledescription="surface explorer"
              aria-label={`${title}. Arrow keys move across the grid; the reading is announced below the map.`}
              onMouseMove={(e) => {
                setHover(cellFromEvent(e));
                p.setTipPanel(kind);
              }}
              onMouseLeave={() => {
                setHover(null);
                p.setTipPanel(null);
              }}
              onFocus={() => {
                if (!hover) setHover(startCell(p));
                p.setTipPanel(kind);
              }}
              onBlur={() => p.setTipPanel(null)}
              onKeyDown={onKey}
              style={{ outline: "none" }}
            />
          ) : null}

          {/* Overlays: runs (measured, projected), incumbent, proposals. */}
          <g aria-hidden pointerEvents="none">
            {p.runs.map(([rx, ry], i) => (
              <circle key={i} cx={xs(rx)} cy={ys(ry)} r={2.25} fill="var(--chart-measured)" stroke="var(--surface)" strokeWidth={0.75} />
            ))}
          </g>
          {p.incumbent ? (
            <g aria-hidden pointerEvents="none">
              <path
                d={`M${xs(p.incumbent.x)} ${ys(p.incumbent.y) - 7} L${xs(p.incumbent.x) + 7} ${ys(p.incumbent.y)} L${xs(p.incumbent.x)} ${ys(p.incumbent.y) + 7} L${xs(p.incumbent.x) - 7} ${ys(p.incumbent.y)} Z`}
                fill="var(--chart-measured)"
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
            </g>
          ) : null}
          {hover ? (
            <g aria-hidden pointerEvents="none">
              <line x1={xs(x.values[hover.col])} x2={xs(x.values[hover.col])} y1={top} y2={bottom} stroke="var(--fg)" strokeWidth={1} />
              <line x1={left} x2={right} y1={ys(y.values[hover.row])} y2={ys(y.values[hover.row])} stroke="var(--fg)" strokeWidth={1} />
              <circle cx={xs(x.values[hover.col])} cy={ys(y.values[hover.row])} r={5} fill="none" stroke="var(--surface)" strokeWidth={3} />
              <circle cx={xs(x.values[hover.col])} cy={ys(y.values[hover.row])} r={5} fill="none" stroke="var(--fg)" strokeWidth={1.25} />
            </g>
          ) : null}
          {p.proposals.map((q, qi) => {
            const cx = xs(q.x);
            const cy = ys(q.y);
            const lp = labels_[qi];
            const label = `${q.key}: proposed at ${x.name} ${fmtAxis(x, q.x)}, ${y.name} ${fmtAxis(y, q.y)}`;
            const content = (
              <div className="flex flex-col gap-1">
                <p className="pr-6 text-label text-fg">Proposal {q.key}</p>
                <TipRow label={x.name}>{fmtAxis(x, q.x)}</TipRow>
                <TipRow label={y.name}>{fmtAxis(y, q.y)}</TipRow>
                <p className="text-fg-muted">Its other inputs differ from the held recipe, so the surface value here is not its prediction. Its predicted value and band are in batch row {q.key}.</p>
                <TipSource>proposals ({q.key}) recipe</TipSource>
              </div>
            );
            const mp = focusable ? markProps(cx, cy + 8, content, label, kind === "mean") : null;
            return (
              <g key={q.key}>
                {/* Hollow ring over the bands: a surface halo, then the accent ring with the band showing through. */}
                <circle cx={cx} cy={cy} r={5} fill="none" stroke="var(--surface)" strokeWidth={4.5} aria-hidden />
                <PredictedDot x={cx} y={cy} r={5} strokeWidth={2} fill="none" />
                <text
                  x={lp.x}
                  y={lp.y}
                  textAnchor={lp.anchor}
                  className="fill-fg text-caption tabular-nums"
                  fontSize={12}
                  stroke="var(--surface)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  aria-hidden
                >
                  {q.key}
                </text>
                {mp ? <rect x={cx - 12} y={cy - 12} width={24} height={24} fill="transparent" {...mp} /> : null}
              </g>
            );
          })}
        </svg>
        {interactive ? (
          <ChartTooltip
            tip={activeTip}
            onClose={() => {
              close();
              setHover(null);
            }}
            width={pw}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-caption text-fg-muted tabular-nums" aria-label={`${title} bands`}>
        {labels.map((l, k) => (
          <span key={l} className="inline-flex items-center gap-1 pr-2">
            <span className="inline-block h-3 w-5 rounded-sm border border-border" style={{ background: `var(${ramp}${bandStep(k, labels.length)})` }} aria-hidden />
            {l}
          </span>
        ))}
        {flat ? <span className="w-full text-fg">{FLAT_NOTE}</span> : null}
      </div>
    </div>
  );
}

/** Where keyboard exploration starts: the incumbent's grid point when shown, else the centre. */
function startCell(p: Pick<PanelProps, "incumbent" | "x" | "y">): Cell {
  if (p.incumbent) return { row: nearestIndex(p.y.values, p.incumbent.y), col: nearestIndex(p.x.values, p.incumbent.x) };
  return { row: Math.floor(p.y.values.length / 2), col: Math.floor(p.x.values.length / 2) };
}
