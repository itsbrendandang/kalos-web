"use client";

/*
 * C4b SliceProfiler (VIZ_SPEC C4, engine request R2): what the model predicts
 * as one input at a time is swept, every other input held at the incumbent.
 * Small multiples on one shared y axis: the model mean as a dashed accent line
 * (predicted), the engine's GP posterior band at `slice.coverage` in
 * --chart-band (labelled model-based, never conformal), a dotted reference
 * rule at the held recipe's own value, and the batch's proposals as ticks on
 * the x axis. No measured points: the slices are the model only. Hover or
 * arrow keys read the engine sample nearest the pointer (no interpolation).
 */
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { scaleLinear } from "@visx/scale";
import { XAxis, YAxis, tickFormatter } from "@/components/viz/axes";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import type { Source } from "@/lib/source";
import { sourceFooter } from "@/lib/viz-data/driver-forest";
import {
  MODEL_ONLY_NOTE,
  bandText,
  describeSliceProfiler,
  fmtBand,
  fmtMean,
  fmtX,
  nearestSample,
  sliceTable,
  type SliceProfilerData,
  type SliceSeries,
} from "@/lib/viz-data/slice-profiler";
import { formatSetting, formatValue } from "@/lib/num";

const PANEL_H = 176;
const M = { top: 10, right: 12, bottom: 40, left: 52 };

export function SliceProfiler({
  data,
  target,
  unit,
  source,
  stale,
  width,
  bare,
}: {
  data: SliceProfilerData;
  target: string;
  unit: string | null;
  source: Source;
  stale?: { nNew: number; text?: string } | null;
  width?: number;
  bare?: boolean;
}) {
  if (data.state === "absent") return null;
  const ready = data.state === "ready";
  const n = ready ? data.slices.length : 0;
  const held =
    ready && data.referenceRecipe.length
      ? `Other inputs held at the ${data.sweptAt === "incumbent" ? "incumbent" : (data.sweptAt ?? "reference")} recipe: ${data.referenceRecipe
          .map((r) => `${r.name} ${typeof r.value === "number" ? formatSetting(r.value).value : r.value}`)
          .join(", ")}.`
      : "Other inputs held at the incumbent recipe.";
  return (
    <ChartFrame
      title={`Model-predicted ${target}${unit ? ` (${unit})` : ""}, one input at a time`}
      subtitle={`${held} ${MODEL_ONLY_NOTE}`}
      state={data.state === "not-scored" ? { kind: "not-scored", reason: data.reason } : { kind: "ready" }}
      stale={stale}
      width={width}
      bare={bare}
      height={Math.ceil(Math.max(1, n) / 3) * (PANEL_H + 28)}
      description={describeSliceProfiler(data, target, unit)}
      data={ready ? sliceTable(data, unit) : null}
      footer={sourceFooter(source, ready ? { value: n, word: "input" } : null)}
      legend={
        ready ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 16 10" className="h-2.5 w-4 shrink-0" aria-hidden>
                <line x1="0" x2="16" y1="5" y2="5" stroke="var(--chart-predicted)" strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
              Model mean (predicted)
            </span>
            <LegendItem mark="band">{bandText(data.coverage)}</LegendItem>
            <LegendItem mark="reference">Held recipe&apos;s own setting</LegendItem>
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 16 10" className="h-2.5 w-4 shrink-0" aria-hidden>
                <line x1="8" x2="8" y1="1" y2="9" stroke="var(--chart-predicted)" strokeWidth="1.5" />
              </svg>
              Proposal setting (P1, P2, … as in the batch)
            </span>
          </>
        ) : null
      }
    >
      {(w) => (ready ? <Panels data={data} width={w} unit={unit} /> : null)}
    </ChartFrame>
  );
}

function Panels({ data, width, unit }: { data: Extract<SliceProfilerData, { state: "ready" }>; width: number; unit: string | null }) {
  const cols = width >= 900 ? 3 : width >= 560 ? 2 : 1;
  const gap = 20;
  const pw = Math.floor((width - gap * (cols - 1)) / cols);
  const y = useMemo(() => scaleLinear<number>({ domain: data.yDomain, range: [PANEL_H - M.bottom, M.top], nice: false }), [data.yDomain]);
  const yTicks = y.ticks(3);
  const yFmt = tickFormatter(yTicks);
  const [read, setRead] = useState<{ feature: string; i: number } | null>(null);
  const active = read ? data.slices.find((s) => s.feature === read.feature) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: gap, rowGap: 16 }}>
        {data.slices.map((s) => (
          <Panel key={s.feature} s={s} pw={pw} y={y} yTicks={yTicks} yFmt={yFmt} read={read?.feature === s.feature ? read.i : null} onRead={(i) => setRead(i == null ? null : { feature: s.feature, i })} />
        ))}
      </div>
      <p className="min-h-4 text-caption text-fg tabular-nums" aria-live="polite">
        {active && read
          ? `${active.feature} ${fmtX(active, active.x[read.i])}: predicted ${fmtMean(active.mean[read.i], active.sd?.[read.i] ?? null, unit)}, model band ${fmtBand(active, read.i)}${active.sd ? `, model σ ${formatValue(active.sd[read.i], { unit, fallbackSigFigs: 2 }).text}` : ""}`
          : "Hover or focus a panel and use the arrow keys to read the model at each engine sample."}
      </p>
      {data.skipped.length || data.malformed.length ? (
        <ul className="flex flex-col gap-0.5 text-caption text-fg-muted">
          {data.skipped.map((k) => (
            <li key={k.feature}>
              <span className="text-fg">{k.feature}</span>: not sliced, {k.text}.
            </li>
          ))}
          {data.malformed.map((f) => (
            <li key={f}>
              <span className="text-fg">{f}</span>: the engine&apos;s slice could not be drawn (its arrays do not line up), so it is not shown.
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Panel({
  s,
  pw,
  y,
  yTicks,
  yFmt,
  read,
  onRead,
}: {
  s: SliceSeries;
  pw: number;
  y: (v: number) => number;
  yTicks: number[];
  yFmt: (v: number) => string;
  read: number | null;
  onRead: (i: number | null) => void;
}) {
  const x = useMemo(() => scaleLinear<number>({ domain: [s.x[0], s.x[s.x.length - 1]], range: [M.left, pw - M.right] }), [s.x, pw]);
  const xTicks = x.ticks(pw < 260 ? 2 : 4);
  const xFmt = tickFormatter(xTicks);
  const bottom = PANEL_H - M.bottom;
  const band = `M${s.x.map((v, i) => `${x(v)} ${y(s.hi[i])}`).join(" L")} L${[...s.x.keys()]
    .reverse()
    .map((i) => `${x(s.x[i])} ${y(s.lo[i])}`)
    .join(" L")} Z`;
  const mean = `M${s.x.map((v, i) => `${x(v)} ${y(s.mean[i])}`).join(" L")}`;
  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    onRead(nearestSample(s.x, x.invert(e.clientX - rect.left)));
  };
  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    const i = read ?? (s.reference != null ? nearestSample(s.x, s.reference) : Math.floor(s.x.length / 2));
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? s.x.length - 1 : null;
    if (e.key === "Escape") return onRead(null);
    if (next == null) return;
    e.preventDefault();
    onRead(Math.max(0, Math.min(s.x.length - 1, next)));
  };
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="truncate text-label text-fg" title={s.feature}>
        {s.feature}
      </figcaption>
      <svg width={pw} height={PANEL_H} role="group" aria-label={`${s.feature}: model mean and ${bandText(s.coverage)}`} className="block overflow-visible">
        <g aria-hidden>
          {yTicks.map((t) => (
            <line key={t} x1={M.left} x2={pw - M.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
          ))}
          <path d={band} fill="var(--chart-band)" stroke="none" />
          <path d={mean} fill="none" stroke="var(--chart-predicted)" strokeWidth={1.5} strokeDasharray="4 3" />
          {s.reference != null ? (
            <line x1={x(s.reference)} x2={x(s.reference)} y1={M.top} y2={bottom} stroke="var(--chart-reference)" strokeWidth={1.25} strokeDasharray="1 3" strokeLinecap="round" />
          ) : null}
          {s.proposals.map((p) => (
            <line key={p.key} x1={x(p.x)} x2={x(p.x)} y1={bottom - 9} y2={bottom} stroke="var(--chart-predicted)" strokeWidth={1.5}>
              <title>{`${p.key} at ${fmtX(s, p.x)}`}</title>
            </line>
          ))}
          {read != null ? (
            <g>
              <line x1={x(s.x[read])} x2={x(s.x[read])} y1={M.top} y2={bottom} stroke="var(--fg)" strokeWidth={1} />
              <circle cx={x(s.x[read])} cy={y(s.mean[read])} r={4} fill="var(--surface)" stroke="var(--chart-predicted)" strokeWidth={1.5} />
            </g>
          ) : null}
        </g>
        <XAxis scale={x as never} top={bottom} ticks={xTicks} format={xFmt} label={s.unit ?? undefined} />
        <YAxis scale={y as never} left={M.left} ticks={yTicks} format={yFmt} />
        <rect
          x={M.left}
          y={M.top}
          width={Math.max(0, pw - M.left - M.right)}
          height={bottom - M.top}
          fill="transparent"
          tabIndex={0}
          role="application"
          aria-roledescription="slice explorer"
          aria-label={`${s.feature} slice. Arrow keys step through the engine's samples; the reading is announced below the panels.`}
          onMouseMove={onMove}
          onMouseLeave={() => onRead(null)}
          onFocus={() => onRead(read ?? (s.reference != null ? nearestSample(s.x, s.reference) : Math.floor(s.x.length / 2)))}
          onBlur={() => onRead(null)}
          onKeyDown={onKey}
          className="focus-visible:stroke-[var(--ring)] focus-visible:stroke-2"
          style={{ outline: "none" }}
        />
      </svg>
      {s.outside.length ? <p className="text-caption text-fg-muted">{s.outside.join(", ")} outside the swept range, not drawn.</p> : null}
      {s.reference != null ? (
        <p className="text-caption text-fg-muted tabular-nums">held at {fmtX(s, s.reference)}</p>
      ) : null}
    </figure>
  );
}
