"use client";

import { useId, type ReactNode } from "react";
import { scaleLinear, scaleLog } from "@visx/scale";
import { AlertTriangle } from "lucide-react";
import { XAxis, YAxis, tickFormatter } from "@/components/viz/axes";
import { VizDefs, hatchFill } from "@/components/viz/defs";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import { DerivedDiamond, HitTarget, IntervalBar, MeasuredDot, OutsideGlyph, PredictedDot } from "@/components/viz/marks";
import { SourceButton } from "@/components/viz/num";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { coverageText, formatValue, formatVolume } from "@/lib/num";
import type { Source } from "@/lib/source";
import { cn } from "@/lib/utils";
import { MAX_FOCUSABLE_MARKS } from "@/lib/viz-thresholds";
import {
  decisionChip,
  describeScaleLadder,
  NO_BAND,
  OUTSIDE_WINDOW,
  rungFlags,
  scaleLadderTable,
  visibleStageBands,
  type LadderData,
  type LadderPoint,
  type LadderRungRow,
} from "@/lib/viz-data/scale-ladder";

/*
 * C9 ScaleLadderChart (VIZ_SPEC 5): performance against scale on one shared
 * log axis in liters. Top: measured runs per scale (filled ink, drawn on top)
 * and the backtest predictions for held-out scales (hollow accent), then the
 * target scale: a hollow accent prediction with its interval bar, or a hatched
 * refusal slot. Licensed / warning / refused zones come only from the engine's
 * `zones`; stage volume bands sit behind everything. Bottom: each held-out
 * rung's backtest error (model filled ink) against the two naive baselines
 * (muted hollow diamond and triangle). Flags are chips with words.
 */

const STAGE_ROW = 20;
const GAP = 22;
const AXIS = 40;

type Layout = { left: number; right: number; top: number; h1: number; h2: number; wide: boolean };

function layout(width: number): Layout {
  const wide = width >= 560;
  return { left: wide ? 56 : 44, right: wide ? 16 : 10, top: STAGE_ROW + 4, h1: wide ? 240 : 200, h2: wide ? 120 : 104, wide };
}

/** Deterministic sub-pixel spread for runs at the same scale (no Math.random: a hash of the point index). */
const jitter = (i: number) => (((i * 2654435761) >>> 0) % 7) - 3;

const vol = (l: number) => formatVolume(l).text;

export function ScaleLadderChart({
  data: d,
  source,
  width,
  bare = false,
  title = "Performance against scale",
}: {
  data: LadderData;
  source: Source;
  width?: number;
  bare?: boolean;
  title?: ReactNode;
}) {
  const chip = decisionChip(d.prediction.decision);
  const cov = coverageText(d.prediction.interval?.coverage);
  const description = describeScaleLadder(d);
  const { outside } = visibleStageBands(d);
  const L0 = layout(width ?? 800);
  const height = L0.top + L0.h1 + GAP + L0.h2 + AXIS;
  const refused = d.prediction.decision === "REFUSAL" || d.prediction.prediction == null;
  const hasOof = d.points.some((p) => p.oofPred != null);

  return (
    <ChartFrame
      bare={bare}
      title={title}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <DecisionChip word={chip.word} tone={chip.tone} />
          <span>
            {d.backtest ? `Backtest: ${d.backtest.label}, each held-out scale predicted from strictly smaller scales only.` : "No backtest was returned."}
          </span>
        </span>
      }
      state={d.points.length === 0 && d.rungs.length === 0 ? { kind: "insufficient", text: "The readout returned no measured points or backtest rungs to draw." } : { kind: "ready" }}
      width={width}
      height={height}
      description={description}
      data={scaleLadderTable(d)}
      legend={
        <>
          <LegendItem mark="measured">Measured run</LegendItem>
          {hasOof ? <LegendItem mark="predicted">Backtest prediction ({d.backtest?.label ?? "backtest"})</LegendItem> : null}
          {!refused ? (
            <LegendItem mark="predicted">
              Target prediction{d.prediction.interval ? ` (${cov ? `${cov} ` : ""}approximate interval)` : " (no interval reported)"}
            </LegendItem>
          ) : (
            <LegendItem mark="hatch">Refused at the target</LegendItem>
          )}
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <circle cx="6" cy="6" r="4" fill="var(--chart-measured)" />
            </svg>
            Model MAE
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <path d="M6 1.5 L10.5 6 L6 10.5 L1.5 6 Z" fill="var(--surface)" stroke="var(--chart-reference)" strokeWidth="1.25" />
            </svg>
            Carry-smallest-scale-mean baseline
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <path d="M6 1.5 L10.5 10 L1.5 10 Z" fill="var(--surface)" stroke="var(--chart-reference)" strokeWidth="1.25" />
            </svg>
            Nearest-recipe baseline
          </span>
          <span className="basis-full">
            {d.stages.bands.length
              ? `Shaded columns: ${d.stages.source === "default" ? "default stage volume ranges (the engine's program definition, not data)" : "this campaign's stage volume ranges"}.`
              : "No stage has a volume range."}
            {outside.length ? ` Outside this axis: ${outside.map((b) => `${b.key} ${vol(b.minL)} to ${vol(b.maxL)}`).join(", ")}.` : ""}
            {d.zones
              ? ` Zones beyond the largest scale run (licensed, warning, refused) are the engine's step-ratio rule on the scale axis only; the other checks still apply. The dotted line is the hard cap (${vol(d.zones.hardCapL)}): beyond it the engine's entry check refuses the target outright.`
              : ""}
          </span>
        </>
      }
      footer={
        <span className="inline-flex flex-wrap items-center gap-1">
          From: {source.label} · n = {formatValue(d.points.length, { quantity: "count" }).text} runs · {d.backtest?.label ?? "backtest"}
          {source.engineVersion ? ` · engine ${source.engineVersion}` : ""} · readout <span className="font-mono text-code">{d.readoutId.slice(0, 12)}</span>
          <SourceButton source={source} />
        </span>
      }
    >
      {(w) => <LadderSvg width={w} d={d} description={description} />}
    </ChartFrame>
  );
}

function DecisionChip({ word, tone }: { word: string; tone: "neutral" | "warn" | "refused" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-caption font-medium text-fg",
        tone === "warn" ? "border-transparent bg-warn-soft" : tone === "refused" ? "border-border-strong bg-subtle" : "border-border-strong bg-transparent",
      )}
    >
      {tone === "refused" ? (
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
          <defs>
            <pattern id="decision-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="3" stroke="var(--chart-refused)" strokeWidth="1.25" />
            </pattern>
          </defs>
          <rect width="12" height="12" rx="2" fill="url(#decision-hatch)" stroke="var(--chart-refused)" />
        </svg>
      ) : tone === "warn" ? (
        <AlertTriangle className="size-3.5 text-warn" aria-hidden />
      ) : (
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
          <circle cx="6" cy="6" r="4" fill="var(--surface)" stroke="var(--chart-predicted)" strokeWidth="1.5" />
        </svg>
      )}
      {word}
    </span>
  );
}

/** Decades inside the domain, as log-axis ticks. */
function decadeTicks([lo, hi]: [number, number]): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) out.push(10 ** e);
  return out;
}

/** Fit a label into `px` pixels at the caption size (about 6.6px a character), ellipsis when it does not. */
function fit(text: string, px: number): string {
  const max = Math.max(4, Math.floor(px / 6.6));
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function LadderSvg({ width, d, description }: { width: number; d: LadderData; description: string }) {
  const id = useId().replace(/:/g, "");
  const { tip, markProps, close } = useChartTip();
  const L = layout(width);
  const x0 = L.left;
  const x1 = Math.max(L.left + 80, width - L.right);
  const y1Top = L.top;
  const y1Bot = L.top + L.h1;
  const y2Top = y1Bot + GAP;
  const y2Bot = y2Top + L.h2;
  const height = y2Bot + AXIS;

  const x = scaleLog<number>({ domain: d.xDomain, range: [x0, x1] });
  const X = (v: number) => x(v) ?? x0;
  const yd = d.yDomain ?? [0, 1];
  const y = scaleLinear<number>({ domain: yd, range: [y1Bot - 8, y1Top + 8], nice: true });
  const yTicks = y.ticks(L.wide ? 5 : 4);
  const yFmt = tickFormatter(yTicks);
  const md = d.maeDomain ?? [0, 1];
  const ym = scaleLinear<number>({ domain: md, range: [y2Bot - 4, y2Top + 8], nice: true });
  const mTicks = ym.ticks(3);
  const mFmt = tickFormatter(mTicks);
  const decades = decadeTicks(d.xDomain);
  // Label every other decade when they would crowd ("100,000 L" is ~60px); every decade keeps its gridline.
  const labelled = (x1 - x0) / Math.max(1, decades.length) < 64 ? decades.filter((_, i) => (decades.length - 1 - i) % 2 === 0) : decades;
  const { shown } = visibleStageBands(d);
  const unit = d.unit;
  const u = unit ? ` (${unit})` : "";
  const p = d.prediction;
  const refused = p.decision === "REFUSAL" || p.prediction == null;
  const tx = Number.isFinite(p.scaleL) && p.scaleL > 0 ? X(p.scaleL) : null;
  const pointsFocusable = d.points.length <= MAX_FOCUSABLE_MARKS;

  const pointTip = (pt: LadderPoint) => (
    <div className="flex flex-col gap-1 pr-5">
      <p className="text-label text-fg">Run at {vol(pt.scaleL)}</p>
      <TipRow label="Measured">
        <span className="font-semibold">{formatValue(pt.actual, { basis: "measured", unit }).text}</span>
      </TipRow>
      {pt.oofPred != null ? (
        <TipRow label="Backtest prediction">{formatValue(pt.oofPred, { basis: "predicted", unit }).text}</TipRow>
      ) : (
        <p className="text-fg-muted">Not held out: this scale was only ever training data, so it has no backtest prediction.</p>
      )}
      {pt.oofPred != null ? <p className="text-fg-muted">{d.backtest?.label}: predicted from strictly smaller scales only. No interval is reported per run.</p> : null}
      <TipSource>scale_points[{pt.index}]</TipSource>
    </div>
  );

  const rungTip = (r: LadderRungRow) => {
    const mae = (v: number | null) => (v == null ? "n/a" : formatValue(v, { unit, decimals: d.decimals.mae }).text);
    const flags = rungFlags(r, d.minRungN);
    return (
      <div className="flex flex-col gap-1 pr-5">
        <p className="text-label text-fg">
          Held-out scale {vol(r.scaleL)}
          {r.stepRatio != null ? <span className="text-fg-muted"> · step {formatValue(r.stepRatio, { quantity: "ratio" }).text}</span> : null}
        </p>
        <TipRow label="Runs">{formatValue(r.n, { quantity: "count" }).text}</TipRow>
        <TipRow label="Model MAE">{mae(r.mae)}</TipRow>
        <TipRow label="Carry-mean MAE">{mae(r.naiveMean)}</TipRow>
        <TipRow label="Nearest-recipe MAE">{mae(r.naiveNN)}</TipRow>
        <TipRow label="Beats both">{r.beatsBoth == null ? "n/a" : r.beatsBoth ? "yes" : "no"}</TipRow>
        {r.measuredMean != null ? (
          <TipRow label="Measured mean">
            <span className="font-semibold">{formatValue(r.measuredMean, { basis: "measured", unit }).text}</span>
          </TipRow>
        ) : null}
        {r.backtestPredMean != null ? <TipRow label="Backtest prediction mean">{formatValue(r.backtestPredMean, { basis: "predicted", unit }).text}</TipRow> : null}
        {r.bandHalfWidth != null ? (
          <TipRow label="Backtest band">{`± ${formatValue(r.bandHalfWidth, { unit }).text}, ${r.outsideBand ? "measured mean outside" : "measured mean inside"}`}</TipRow>
        ) : r.bandUnavailableReason ? (
          <p className="text-fg-muted">Backtest band n/a: {r.bandUnavailableReason}</p>
        ) : null}
        {flags.length ? <p className="text-fg">Flags: {flags.join(", ")}</p> : null}
        <TipSource>backtest.per_scale[{vol(r.scaleL)}] · divergence.per_scale</TipSource>
      </div>
    );
  };

  const targetTip = (
    <div className="flex flex-col gap-1 pr-5">
      <p className="text-label text-fg">Target {vol(p.scaleL)}</p>
      {refused ? (
        <>
          <p className="text-fg">Refused. The engine&apos;s reasons:</p>
          <ul className="list-disc pl-4">
            {p.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {p.dataPlan.length ? <p className="text-fg-muted">What would fix it: {p.dataPlan.join("; ")}</p> : null}
        </>
      ) : (
        <>
          <TipRow label="Predicted">{formatValue(p.prediction, { basis: "predicted", unit, interval: p.interval }).value}</TipRow>
          {p.interval ? (
            <TipRow label={`${coverageText(p.interval.coverage) ?? ""} interval`.trim()}>{formatValue(p.prediction, { interval: p.interval }).interval}</TipRow>
          ) : (
            <p className="text-fg-muted">(no interval reported)</p>
          )}
          <p className="text-fg-muted">{p.intervalLabel}</p>
        </>
      )}
      <TipSource>prediction, interval · readout {d.readoutId.slice(0, 12)}</TipSource>
    </div>
  );

  const zoneRect = (from: number, to: number) => {
    const a = Math.max(X(Math.max(from, d.xDomain[0])), x0);
    const b = Math.min(X(Math.min(to, d.xDomain[1])), x1);
    return b > a ? { a, b } : null;
  };
  const z = d.zones;
  const zones = z
    ? [
        { key: "licensed", label: "licensed", r: zoneRect(z.fromL, z.licensedMaxL), fill: "var(--chart-zone-licensed)" },
        { key: "warn", label: "warning", r: zoneRect(z.licensedMaxL, z.warnMaxL), fill: "var(--chart-zone-warn)" },
        // Refused beyond the warning zone; past the hard cap the entry check refuses the target outright (a 422).
        { key: "refuse", label: "refused", r: zoneRect(z.warnMaxL, d.xDomain[1]), fill: hatchFill(id) },
      ]
    : [];

  // Refusal slot: a hatched column at the target, labelled with the first reason.
  const slotW = 18;
  const reasonLabel = refused ? `Refused: ${p.reasons[0] ?? "no reason given"}${p.reasons.length > 1 ? ` (+${p.reasons.length - 1} more)` : ""}` : null;
  const labelRight = tx != null && tx > (x0 + x1) / 2;

  return (
    <div className="relative flex flex-col gap-3">
      <svg width={width} height={height} role="group" aria-label={description} className="block overflow-visible">
        <VizDefs id={id} />
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={x0} y={0} width={x1 - x0} height={height} />
          </clipPath>
        </defs>
        <g aria-hidden clipPath={`url(#${id}-clip)`}>
          {/* Stage volume bands behind everything, labelled at the top. */}
          {shown.map((b, i) => {
            const a = X(b.minL);
            const c = X(b.maxL);
            const w = Math.max(1, c - a);
            return (
              <g key={b.key}>
                <rect x={a} y={y1Top - STAGE_ROW} width={w} height={y2Bot - y1Top + STAGE_ROW} fill={i % 2 === 0 ? "var(--chart-stage-b)" : "var(--chart-stage-a)"} />
                <line x1={a} x2={a} y1={y1Top - STAGE_ROW} y2={y2Bot} stroke="var(--chart-grid)" />
                <line x1={c} x2={c} y1={y1Top - STAGE_ROW} y2={y2Bot} stroke="var(--chart-grid)" />
                <text x={a + 4} y={y1Top - 8} className="fill-fg-muted text-caption" fontSize={12}>
                  {fit(w > 90 ? `${b.key} ${b.label}` : b.key, w - 6)}
                </text>
              </g>
            );
          })}
          {/* Zones from the engine's `zones` only. */}
          {zones.map((zz) =>
            zz.r ? (
              <g key={zz.key}>
                <rect x={zz.r.a} y={y1Top} width={zz.r.b - zz.r.a} height={y1Bot - y1Top} fill={zz.fill} />
                <text x={zz.r.a + 4} y={y1Bot - 6} className="fill-fg-muted text-caption" fontSize={12}>
                  {zz.r.b - zz.r.a >= 30 ? fit(zz.label, zz.r.b - zz.r.a - 6) : ""}
                </text>
              </g>
            ) : null,
          )}
          {/* Decade gridlines (log axis) and horizontal value gridlines. */}
          {z && z.hardCapL < d.xDomain[1] ? (
            <line x1={X(z.hardCapL)} x2={X(z.hardCapL)} y1={y1Top} y2={y1Bot} stroke="var(--chart-reference)" strokeWidth={1.25} strokeDasharray="1 3" strokeLinecap="round" />
          ) : null}
          {decades.map((t) => (
            <line key={t} x1={X(t)} x2={X(t)} y1={y1Top} y2={y2Bot} stroke="var(--chart-grid)" strokeWidth={1} />
          ))}
          {yTicks.map((t) => (
            <line key={`y${t}`} x1={x0} x2={x1} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
          ))}
          {mTicks.map((t) => (
            <line key={`m${t}`} x1={x0} x2={x1} y1={ym(t)} y2={ym(t)} stroke="var(--chart-grid)" />
          ))}
          <line x1={x0} x2={x1} y1={y1Bot} y2={y1Bot} stroke="var(--chart-grid)" />
        </g>

        {/* Top panel: backtest predictions (hollow accent) below, measured runs (filled ink) on top. */}
        <g aria-hidden>
          {d.points.map((pt) =>
            pt.oofPred != null ? <PredictedDot key={`o${pt.index}`} x={X(pt.scaleL) + 4 + jitter(pt.index)} y={y(pt.oofPred) ?? 0} r={3.5} /> : null,
          )}
          {d.points.map((pt) => (
            <MeasuredDot key={`m${pt.index}`} x={X(pt.scaleL) - 4 + jitter(pt.index)} y={y(pt.actual) ?? 0} r={3.5} />
          ))}
        </g>
        {d.points.map((pt) => (
          <HitTarget
            key={`h${pt.index}`}
            x={X(pt.scaleL) - 4 + jitter(pt.index)}
            y={y(pt.actual) ?? 0}
            {...markProps(
              X(pt.scaleL),
              y(pt.actual) ?? 0,
              pointTip(pt),
              `Run at ${vol(pt.scaleL)}: measured ${formatValue(pt.actual, { unit }).text}${pt.oofPred != null ? `, backtest prediction ${formatValue(pt.oofPred, { unit }).text}` : ""}`,
              pointsFocusable,
            )}
          />
        ))}

        {/* The target: prediction with its interval bar, or the hatched refusal slot. */}
        {tx != null ? (
          refused ? (
            <g>
              <rect x={tx - slotW / 2} y={y1Top} width={slotW} height={y1Bot - y1Top} fill={hatchFill(id)} stroke="var(--fg-muted)" strokeWidth={1.25} aria-hidden />
              <RefusalLabel
                x={labelRight ? tx - slotW / 2 - 6 : tx + slotW / 2 + 6}
                y={y1Top + 16}
                anchor={labelRight ? "end" : "start"}
                text={fit(reasonLabel ?? "", (labelRight ? tx - x0 : x1 - tx) - slotW - 12)}
              />
              <HitTarget x={tx} y={(y1Top + y1Bot) / 2} {...markProps(tx, y1Top + 40, targetTip, `Target ${vol(p.scaleL)}: ${reasonLabel}`)} />
            </g>
          ) : (
            <g>
              <g aria-hidden>
                {p.interval ? <IntervalBar orientation="vertical" at={tx} from={y(p.interval.lo) ?? 0} to={y(p.interval.hi) ?? 0} /> : null}
                <PredictedDot x={tx} y={y(p.prediction as number) ?? 0} r={5} />
                <text
                  x={labelRight ? tx - 10 : tx + 10}
                  y={(p.interval ? (y(p.interval.hi) ?? 0) : (y(p.prediction as number) ?? 0)) - 6}
                  textAnchor={labelRight ? "end" : "start"}
                  className="fill-fg text-caption"
                  fontSize={12}
                >
                  {`target ${vol(p.scaleL)}`}
                </text>
              </g>
              <HitTarget
                x={tx}
                y={y(p.prediction as number) ?? 0}
                {...markProps(tx, y(p.prediction as number) ?? 0, targetTip, `Target ${vol(p.scaleL)}: predicted ${formatValue(p.prediction, { unit, interval: p.interval }).text}`)}
              />
            </g>
          )
        ) : null}

        {/* Bottom panel: rung MAE, model (filled) against the two naive baselines (hollow). */}
        {d.rungs.map((r) => {
          const cx = X(r.scaleL);
          const flags = rungFlags(r, d.minRungN);
          const muted = r.inWindow === false;
          const notBeat = r.codes.includes("did_not_beat_baselines") || (r.beatsBoth === false && !r.tooFew);
          const outsideBand = r.codes.includes("outside_backtest_band");
          const topMark = Math.min(...[r.mae, r.naiveMean, r.naiveNN].filter((v): v is number => v != null).map((v) => ym(v) ?? y2Bot), y2Bot);
          return (
            <g key={`r${r.scaleL}`}>
              <g aria-hidden>
                {r.naiveMean != null ? <DerivedDiamond x={cx - 6} y={ym(r.naiveMean) ?? 0} s={4.5} hollow /> : null}
                {r.naiveNN != null ? (
                  <path
                    d={`M${cx + 6} ${(ym(r.naiveNN) ?? 0) - 4.5} L${cx + 10.5} ${(ym(r.naiveNN) ?? 0) + 3.5} L${cx + 1.5} ${(ym(r.naiveNN) ?? 0) + 3.5} Z`}
                    fill="var(--surface)"
                    stroke="var(--chart-reference)"
                    strokeWidth={1.25}
                  />
                ) : null}
                {r.mae != null ? <circle cx={cx} cy={ym(r.mae) ?? 0} r={4} fill={muted ? "var(--chart-reference)" : "var(--chart-measured)"} /> : null}
                {notBeat ? (
                  <text x={cx} y={topMark - 8} textAnchor="middle" className="fill-bad text-caption" fontSize={12}>
                    ⚠
                  </text>
                ) : null}
                {outsideBand ? <OutsideGlyph x={cx} y={y1Bot - 8} s={3.5} /> : null}
              </g>
              <HitTarget
                x={cx}
                y={r.mae != null ? (ym(r.mae) ?? 0) : (y2Top + y2Bot) / 2}
                {...markProps(cx, r.mae != null ? (ym(r.mae) ?? 0) : y2Top, rungTip(r), `Held-out scale ${vol(r.scaleL)}: model MAE ${r.mae == null ? "n/a" : formatValue(r.mae, { decimals: d.decimals.mae }).text}${flags.length ? `, ${flags.join(", ")}` : ""}`)}
              />
            </g>
          );
        })}
        {/* Skipped rungs: a muted tick with the word; the reason is in the tooltip. */}
        {d.skipped.map((s) => {
          const cx = X(s.scaleL);
          return (
            <g key={`s${s.scaleL}`}>
              <g aria-hidden>
                <line x1={cx} x2={cx} y1={y2Bot - 14} y2={y2Bot} stroke="var(--fg-muted)" strokeWidth={1.25} strokeDasharray="1 2" />
                <text x={cx} y={y2Bot - 18} textAnchor="middle" className="fill-fg-muted text-caption" fontSize={12}>
                  skipped
                </text>
              </g>
              <HitTarget
                x={cx}
                y={y2Bot - 10}
                {...markProps(
                  cx,
                  y2Bot - 16,
                  <div className="flex flex-col gap-1 pr-5">
                    <p className="text-label text-fg">Skipped {vol(s.scaleL)}</p>
                    <p className="text-fg-muted">{s.reason}</p>
                    <TipSource>backtest.skipped</TipSource>
                  </div>,
                  `Skipped ${vol(s.scaleL)}: ${s.reason}`,
                )}
              />
            </g>
          );
        })}

        <text x={x0} y={y2Top - 6} className="fill-fg-muted text-caption" fontSize={12} aria-hidden>
          {`Backtest error by held-out scale (MAE${u})`}
        </text>
        <YAxis scale={y} left={x0} ticks={yTicks} format={yFmt} label={L.wide ? `${d.target}${u}` : undefined} />
        <YAxis scale={ym} left={x0} ticks={mTicks} format={mFmt} />
        <XAxis scale={x} top={y2Bot} ticks={labelled} format={(v) => vol(v)} label="Scale (liters, log axis)" />
      </svg>
      <ChartTooltip tip={tip} onClose={close} width={width} />
      <FlagChips d={d} />
    </div>
  );
}

/** The refusal slot's label on a surface backing, so it stays legible over the data. */
function RefusalLabel({ x, y, anchor, text }: { x: number; y: number; anchor: "start" | "end"; text: string }) {
  const w = text.length * 6.6 + 10;
  return (
    <g aria-hidden>
      <rect x={anchor === "end" ? x - w + 4 : x - 6} y={y - 13} width={w} height={18} rx={4} fill="var(--surface)" stroke="var(--border)" />
      <text x={x} y={y} textAnchor={anchor} className="fill-fg text-caption" fontSize={12}>
        {text}
      </text>
    </g>
  );
}

/** Divergence and rung flags as chips (word + icon, never color alone), with skipped rungs and out-of-range inputs. */
function FlagChips({ d }: { d: LadderData }) {
  // "outside license window" is drawn as a muted model dot, not a chip (VIZ_SPEC C9); it stays in the tooltip and Data table.
  const flagged = d.rungs.map((r) => ({ r, flags: rungFlags(r, d.minRungN).filter((f) => f !== OUTSIDE_WINDOW) })).filter((x) => x.flags.length);
  if (!flagged.length && !d.skipped.length && !d.outOfRange.length && d.divergence.computed) return null;
  return (
    <ul className="flex flex-wrap gap-2 text-caption" aria-label="Flags">
      {flagged.map(({ r, flags }) =>
        flags.map((f) => (
          <li
            key={`${r.scaleL}-${f}`}
            title={f === NO_BAND && r.bandUnavailableReason ? r.bandUnavailableReason : undefined}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border px-2",
              f === "did not beat baselines" ? "border-transparent bg-bad-soft text-bad" : f === "outside backtest band" ? "border-transparent bg-warn-soft text-fg" : "border-border-strong text-fg-muted",
            )}
          >
            {f === "did not beat baselines" ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
            {f === "outside backtest band" ? (
              <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
                <g stroke="var(--warn)" strokeWidth="1.75" strokeLinecap="round">
                  <line x1="2" x2="8" y1="2" y2="8" />
                  <line x1="2" x2="8" y1="8" y2="2" />
                </g>
              </svg>
            ) : null}
            <span className="tabular-nums">{`${vol(r.scaleL)}: ${f}`}</span>
          </li>
        )),
      )}
      {d.skipped.map((s) => (
        <li key={`skip-${s.scaleL}`} title={s.reason} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border-strong px-2 text-fg-muted">
          <span className="tabular-nums">{`${vol(s.scaleL)}: skipped`}</span>
        </li>
      ))}
      {d.outOfRange.map((o) => (
        <li key={`oor-${o}`} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-transparent bg-warn-soft px-2 text-fg">
          <AlertTriangle className="size-3.5 text-warn" aria-hidden />
          <span>
            <span className="font-mono text-code">{o}</span>: out of trained range
          </span>
        </li>
      ))}
      {!d.divergence.computed ? (
        <li className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border-strong px-2 text-fg-muted">
          Divergence not computed{d.divergence.reason ? `: ${d.divergence.reason}` : ""}
        </li>
      ) : null}
    </ul>
  );
}
