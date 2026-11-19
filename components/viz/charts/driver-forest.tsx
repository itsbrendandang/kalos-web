"use client";

/*
 * C4 DriverForest (VIZ_SPEC section 5): which inputs go with the target, how
 * sure the engine is, and what shape the model sees. A forest plot of Spearman
 * rho with the engine's 95% CI (`ci95`) on a fixed -1..1 axis (correlations
 * are never auto-zoomed), zero as a dotted reference. The engine's
 * `significant` verdict is copied, never re-derived: filled dot and solid bar
 * when significant, hollow dot and muted bar otherwise, always with a word.
 * GP `relevance` has no interval, so it is a tooltip number, never a bar.
 */
import { scaleLinear } from "@visx/scale";
import { Text } from "@visx/text";
import { CircleDashed } from "lucide-react";
import { XAxis, tickFormatter } from "@/components/viz/axes";
import { ChartFrame, type VizState } from "@/components/viz/frame";
import { RefLine } from "@/components/viz/marks";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { formatCorr, formatP, formatValue } from "@/lib/num";
import { sourceLines, type Source } from "@/lib/source";
import { MAX_FOCUSABLE_MARKS } from "@/lib/viz-thresholds";
import {
  MISSED_TEXT,
  describeDriverForest,
  driverForestTable,
  driverStatus,
  emptyDriversText,
  shapeWord,
  sourceFooter,
  type DriverForestData,
  type ForestDriver,
  type ForestShape,
} from "@/lib/viz-data/driver-forest";

export type DriverForestProps = DriverForestData & {
  /** The target's display name. */
  target: string;
  source: Source;
  width?: number;
  stale?: { nNew: number } | null;
  /** Report/print: no tooltips, no focusable marks. */
  static?: boolean;
  title?: string;
  subtitle?: string;
  bare?: boolean;
};

const TICKS = [-1, -0.5, 0, 0.5, 1];
const HEADER = 22;
const AXIS = 52;
const WIDE = 760;
const NARROW = 480;

/** 16px category glyph for a GP shape (a symbol, not a plot of the response). */
export function ShapeGlyph({ shape, x = 0, y = 0 }: { shape: string; x?: number; y?: number }) {
  const d =
    shape === "flat"
      ? "M1 6 L15 6"
      : shape === "monotonic_up"
        ? "M1 11 L15 1"
        : shape === "monotonic_down"
          ? "M1 1 L15 11"
          : shape === "interior_optimum"
            ? "M1 11 Q8 -5 15 11"
            : shape === "interior_minimum"
              ? "M1 1 Q8 17 15 1"
              : null;
  if (!d) return null;
  return <path transform={`translate(${x} ${y})`} d={d} fill="none" stroke="var(--chart-predicted)" strokeWidth={1.5} strokeLinecap="round" aria-hidden />;
}

function FlagGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden>
      <line x1={1} x2={1} y1={0} y2={12} stroke="var(--warn)" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M1.5 0.5 L10 3.5 L1.5 6.5 Z" fill="var(--warn)" />
    </g>
  );
}

export function DriverForest(props: DriverForestProps) {
  const { drivers, target, source, stale, title, subtitle, bare } = props;
  const state: VizState = drivers.length ? { kind: "ready" } : { kind: "empty", text: emptyDriversText(props) };
  const cov = formatCorr(0, [0, 0]).coverage;
  const table = driverForestTable(props);
  const rows = drivers.length;
  const nUnitsWord = props.unitWord;
  const footer = (
    <>
      {props.selectionNote ? <span className="block">{props.selectionNote}</span> : null}
      <span className="block">{sourceFooter(source, { value: props.nUnits, word: nUnitsWord })}</span>
    </>
  );
  return (
    <ChartFrame
      title={title ?? `Rank agreement with ${target}`}
      subtitle={subtitle ?? `Spearman ρ with its ${cov} CI from the engine. An association in these runs, not a cause.`}
      state={state}
      stale={stale}
      data={drivers.length ? { columns: table.columns, rows: table.rows } : null}
      description={describeDriverForest(props, target)}
      footer={footer}
      width={props.width}
      height={HEADER + AXIS + Math.max(1, rows) * 44}
      bare={bare}
      legend={<ForestLegend data={props} />}
    >
      {(w) => <ForestPlot {...props} width={w} />}
    </ChartFrame>
  );
}

function ForestLegend({ data }: { data: DriverForestData }) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 24 10" className="h-2.5 w-6 shrink-0" aria-hidden>
          <line x1="1" x2="23" y1="5" y2="5" stroke="var(--fg)" strokeWidth="2" />
          <circle cx="12" cy="5" r="4" fill="var(--fg)" />
        </svg>
        Significant (engine verdict: CI excludes 0 and survives {data.fdrShort ?? "FDR"} control)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 24 10" className="h-2.5 w-6 shrink-0" aria-hidden>
          <line x1="1" x2="23" y1="5" y2="5" stroke="var(--chart-reference)" strokeWidth="1.25" />
          <circle cx="12" cy="5" r="3.5" fill="var(--surface)" stroke="var(--fg-muted)" strokeWidth="1.5" />
        </svg>
        Not significant
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 16 10" className="h-2.5 w-4 shrink-0" aria-hidden>
          <line x1="8" x2="8" y1="0" y2="10" stroke="var(--chart-reference)" strokeWidth="1.5" strokeDasharray="1 3" strokeLinecap="round" />
        </svg>
        No association (ρ = 0)
      </span>
      {data.shapes.kind === "ready" && Object.values(data.shapes.shapes).some((s) => s.missedBySpearman) ? (
        <span className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
            <FlagGlyph x={0} y={0} />
          </svg>
          {MISSED_TEXT}
        </span>
      ) : null}
    </>
  );
}

function truncate(name: string, maxChars: number): string {
  return name.length > maxChars ? `${name.slice(0, Math.max(1, maxChars - 1))}…` : name;
}

function ForestPlot(props: DriverForestProps & { width: number }) {
  const { drivers, width, shapes, fdrShort, source } = props;
  const { tip, markProps, close } = useChartTip();
  const narrow = width < NARROW;
  const showShapes = width >= WIDE && shapes.kind !== "absent";
  const nameW = narrow ? 0 : Math.round(Math.min(190, Math.max(120, width * 0.2)));
  const numW = narrow ? 0 : 118;
  const shapeW = showShapes ? 200 : 0;
  const pad = 14;
  const x0 = narrow ? 20 : nameW + 8;
  const x1 = width - (narrow ? 20 : numW + shapeW + pad);
  const rowH = narrow ? 56 : 44;
  const h = HEADER + drivers.length * rowH + AXIS;
  const x = scaleLinear<number>({ domain: [-1, 1], range: [x0, x1] });
  const fmtTick = tickFormatter(TICKS, "corr");
  const cov = formatCorr(0, [0, 0]).coverage;
  const focusable = !props.static && drivers.length <= MAX_FOCUSABLE_MARKS;
  const shapeMap = shapes.kind === "ready" ? shapes.shapes : null;
  const plotTop = HEADER;
  const plotBottom = HEADER + drivers.length * rowH;
  const time = sourceLines(source).find(([k]) => k === "Time")?.[1];

  const tipContent = (dr: ForestDriver) => {
    const f = formatCorr(dr.rho, dr.ci);
    const s = shapeMap?.[dr.name];
    return (
      <div className="flex flex-col gap-1">
        <p className="pr-6 text-label text-fg">{dr.name}</p>
        <TipRow label="Spearman ρ">{f.value}</TipRow>
        <TipRow label={`${f.coverage ?? ""} CI`.trim()}>{f.interval ?? "n/a"}</TipRow>
        <TipRow label="p">{formatP(dr.p).text}</TipRow>
        <TipRow label="Verdict">{driverStatus(dr, fdrShort)}</TipRow>
        {dr.excludesZero != null ? <TipRow label="CI excludes 0">{dr.excludesZero ? "yes" : "no"}</TipRow> : null}
        {dr.survivesFdr != null ? <TipRow label={`Survives ${fdrShort ?? ""} FDR`.replace("  ", " ")}>{dr.survivesFdr ? "yes" : "no"}</TipRow> : null}
        {s ? (
          <>
            <TipRow label="GP model shape">{shapeWord(s)}</TipRow>
            <TipRow label="GP relevance">{formatValue(s.relevance, { quantity: "score" }).text}, no interval reported</TipRow>
            {s.missedBySpearman ? <p className="text-fg-muted">{MISSED_TEXT}.</p> : null}
          </>
        ) : shapes.kind === "not-scored" ? (
          <TipRow label="GP model shape">Not scored</TipRow>
        ) : null}
        <TipSource>
          drivers[{dr.index}]{time ? ` · analysis ${time}` : ""}
          {source.engineVersion ? ` · engine ${source.engineVersion}` : ""}
        </TipSource>
      </div>
    );
  };

  const statusText = (dr: ForestDriver) => driverStatus(dr, fdrShort);

  return (
    <div className="relative">
      <svg width={width} height={h} role={focusable ? "group" : "img"} aria-label={`Forest plot: Spearman ρ with ${props.target} for ${drivers.length} ${drivers.length === 1 ? "input" : "inputs"}`} className="block overflow-visible">
        {/* Column headers */}
        {!narrow ? (
          <text x={0} y={12} className="fill-fg-muted text-caption" fontSize={12}>
            Input
          </text>
        ) : null}
        {!narrow ? (
          <text x={x1 + pad} y={12} className="fill-fg-muted text-caption" fontSize={12}>
            ρ [{cov} CI]
          </text>
        ) : null}
        {showShapes ? (
          <text x={x1 + pad + numW} y={12} className="fill-fg-muted text-caption" fontSize={12}>
            GP model shape
          </text>
        ) : null}

        {/* Vertical gridlines at the fixed ticks, zero as the dotted reference. Narrow: only under each row's text line. */}
        {(narrow ? drivers.map((_, i) => [HEADER + i * rowH + 24, HEADER + (i + 1) * rowH] as const) : [[plotTop, plotBottom] as const]).map(([a, b]) => (
          <g key={a}>
            {TICKS.filter((t) => t !== 0).map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1={a} y2={b} stroke="var(--chart-grid)" strokeWidth={1} aria-hidden />
            ))}
            <RefLine x1={x(0)} x2={x(0)} y1={a} y2={b} />
          </g>
        ))}

        {drivers.map((dr, i) => {
          const top = HEADER + i * rowH;
          const cy = narrow ? top + 38 : top + rowH / 2;
          const lo = x(Math.max(-1, Math.min(1, dr.ci[0])));
          const hi = x(Math.max(-1, Math.min(1, dr.ci[1])));
          const cx = x(Math.max(-1, Math.min(1, dr.rho)));
          const f = formatCorr(dr.rho, dr.ci);
          const s = shapeMap?.[dr.name];
          const label = `${dr.name}: ${f.aria}, ${statusText(dr)}${s ? `, model shape ${shapeWord(s)}` : ""}`;
          const mp = focusable ? markProps(Math.min(cx, width - 270), cy + 12, tipContent(dr), label) : null;
          return (
            <g key={dr.name}>
              {i > 0 ? <line x1={0} x2={showShapes && shapes.kind === "not-scored" ? x1 + pad + numW - 12 : width} y1={top} y2={top} stroke="var(--chart-grid)" strokeWidth={1} aria-hidden /> : null}
              {/* Name and status */}
              {narrow ? (
                <>
                  <text x={0} y={top + 16} className="fill-fg text-label" fontSize={13} stroke="var(--surface)" strokeWidth={4} paintOrder="stroke">
                    {truncate(dr.name, Math.floor(width / 16))}
                    <tspan className="fill-fg-muted" fontSize={12}>
                      {` · ${statusText(dr)}`}
                    </tspan>
                    <title>{dr.name}</title>
                  </text>
                  <text x={width} y={top + 16} textAnchor="end" className="fill-fg text-caption tabular-nums" fontSize={12} stroke="var(--surface)" strokeWidth={4} paintOrder="stroke">
                    {f.value}
                  </text>
                </>
              ) : (
                <>
                  <text x={0} y={cy - 3} className="fill-fg text-label" fontSize={13}>
                    {truncate(dr.name, Math.floor(nameW / 7.5))}
                    <title>{dr.name}</title>
                  </text>
                  <text x={0} y={cy + 13} className="fill-fg-muted text-caption" fontSize={12}>
                    {statusText(dr)}
                  </text>
                </>
              )}

              {/* The interval bar, then the dot */}
              {dr.significant ? (
                <g stroke="var(--fg)" strokeWidth={2} aria-hidden>
                  <line x1={lo} x2={hi} y1={cy} y2={cy} />
                  <line x1={lo} x2={lo} y1={cy - 4} y2={cy + 4} />
                  <line x1={hi} x2={hi} y1={cy - 4} y2={cy + 4} />
                </g>
              ) : (
                <g stroke="var(--chart-reference)" strokeWidth={1.25} aria-hidden>
                  <line x1={lo} x2={hi} y1={cy} y2={cy} />
                  <line x1={lo} x2={lo} y1={cy - 3} y2={cy + 3} />
                  <line x1={hi} x2={hi} y1={cy - 3} y2={cy + 3} />
                </g>
              )}
              {dr.significant ? (
                <circle cx={cx} cy={cy} r={4.5} fill="var(--fg)" aria-hidden />
              ) : (
                <circle cx={cx} cy={cy} r={4} fill="var(--surface)" stroke="var(--fg-muted)" strokeWidth={1.5} aria-hidden />
              )}

              {/* rho and CI */}
              {!narrow ? (
                <>
                  <text x={x1 + pad} y={cy - 3} className="fill-fg text-label tabular-nums" fontSize={13} fontWeight={dr.significant ? 600 : 400}>
                    {f.value}
                  </text>
                  <text x={x1 + pad} y={cy + 13} className="fill-fg-muted text-caption tabular-nums" fontSize={12}>
                    {f.interval}
                  </text>
                </>
              ) : null}

              {/* GP shape column */}
              {showShapes && s ? (
                <g>
                  <ShapeGlyph shape={String(s.shape)} x={x1 + pad + numW} y={cy - 6} />
                  <text x={x1 + pad + numW + 22} y={cy + 4} className="fill-fg text-caption" fontSize={12}>
                    {shapeWord(s)}
                  </text>
                  {s.missedBySpearman ? <FlagGlyph x={width - 12} y={cy - 6} /> : null}
                </g>
              ) : showShapes && shapes.kind === "ready" ? (
                <text x={x1 + pad + numW} y={cy + 4} className="fill-fg-muted text-caption" fontSize={12}>
                  n/a
                </text>
              ) : null}

              {mp ? <rect x={0} y={top} width={width} height={rowH} fill="transparent" {...mp} /> : null}
            </g>
          );
        })}

        {showShapes && shapes.kind === "not-scored" ? (
          <g aria-hidden>
            <Text
              x={x1 + pad + numW}
              y={plotTop + 6}
              width={shapeW - 4}
              verticalAnchor="start"
              className="fill-fg-muted text-caption"
              fontSize={12}
              lineHeight={16}
            >
              {`Not scored: ${shapes.reason}`}
            </Text>
          </g>
        ) : null}

        <XAxis scale={x} top={plotBottom + 4} ticks={TICKS} format={fmtTick} label={`Spearman ρ with ${props.target} (${cov} CI)`} />
      </svg>
      {!showShapes && shapes.kind === "not-scored" ? (
        <p className="mt-2 flex items-start gap-1.5 text-caption text-fg-muted">
          <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            GP model shape not scored: <span className="text-fg">{shapes.reason}</span>
          </span>
        </p>
      ) : null}
      {!showShapes && shapeMap ? <ShapeList drivers={drivers} shapes={shapeMap} /> : null}
      {props.missedOnly.length ? (
        <p className="mt-2 flex items-start gap-1.5 text-caption text-fg-muted">
          <svg viewBox="0 0 12 12" className="mt-0.5 size-3 shrink-0" aria-hidden>
            <FlagGlyph x={0} y={0} />
          </svg>
          <span>
            {MISSED_TEXT} in {props.missedOnly.join(", ")}, which {props.missedOnly.length === 1 ? "is" : "are"} not among the inputs ranked above.
          </span>
        </p>
      ) : null}
      {focusable ? <ChartTooltip tip={tip} onClose={close} width={width} /> : null}
    </div>
  );
}

/** Narrow widths: the shape column as a compact list under the forest. */
function ShapeList({ drivers, shapes }: { drivers: ForestDriver[]; shapes: Record<string, ForestShape> }) {
  const rows = drivers.filter((d) => shapes[d.name]);
  if (!rows.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1 text-caption">
      <li className="text-fg-muted">GP model shape</li>
      {rows.map((d) => {
        const s = shapes[d.name];
        return (
          <li key={d.name} className="flex items-center gap-2 text-fg">
            <svg viewBox="0 0 16 12" className="h-3 w-4 shrink-0" aria-hidden>
              <ShapeGlyph shape={String(s.shape)} />
            </svg>
            <span>
              {d.name}: {shapeWord(s)}
            </span>
            {s.missedBySpearman ? (
              <span className="inline-flex items-center gap-1 text-fg-muted">
                <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                  <FlagGlyph x={0} y={0} />
                </svg>
                {MISSED_TEXT}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
