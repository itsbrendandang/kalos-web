"use client";

import { useId, useState, type ReactNode } from "react";
import { scaleLinear } from "@visx/scale";
import { TriangleAlert } from "lucide-react";
import { ChartFrame } from "@/components/viz/frame";
import { VizDefs, hatchFill } from "@/components/viz/defs";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { formatValue } from "@/lib/num";
import { cn } from "@/lib/utils";
import {
  describeSetpointMatrix,
  edgeOf,
  edgePhrase,
  rangeWord,
  setpointMatrixTable,
  settingFormatted,
  type CategoricalFeature,
  type NumericFeature,
  type SetpointMatrixModel,
} from "@/lib/viz-data/recipe-setpoint-matrix";
import { MAX_FOCUSABLE_MARKS } from "@/lib/viz-thresholds";

/*
 * C3 RecipeSetpointMatrix (VIZ_SPEC 5): one row per input on a shared,
 * normalized track (the input's range, real values at the ends and in the
 * tooltip). Proposals are numbered hollow accent markers matching the batch
 * strip's rows; markers that would overlap stack upward (deterministic, no
 * jitter). The incumbent is a muted diamond below the track, a GP interior
 * optimum a small triangle. A narrowed search box is hatched with its count.
 * Categorical inputs are level chips. Hover links to the batch strip.
 */

const R = 7.5;
const D = 2 * R + 2;
const LABEL_W = 168;
const END_W = 64;
const NOTE_W = 168;
const PAD_X = 12;
/** Room under the track for the incumbent diamond and the optimum triangle. */
const TRACK_BELOW = 22;

/** Lanes so markers never overlap: each goes in the lowest lane with room (input order, deterministic). */
export function laneFor(xs: number[], minGap = D): number[] {
  const lanes: number[][] = [];
  return xs.map((x) => {
    let l = 0;
    while ((lanes[l] ?? []).some((o) => Math.abs(o - x) < minGap)) l++;
    (lanes[l] ??= []).push(x);
    return l;
  });
}

export function RecipeSetpointMatrix({
  model,
  highlight = null,
  onHighlight,
  sourceLabel,
  footer,
  stale,
  width,
}: {
  model: SetpointMatrixModel;
  highlight?: string | null;
  onHighlight?: (key: string | null) => void;
  /** e.g. "Analysis of good.csv · engine 0.1.0", shown in each tooltip's source line. */
  sourceLabel?: string;
  footer?: ReactNode;
  stale?: { nNew: number; text?: ReactNode } | null;
  width?: number;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? model.features : model.features.slice(0, model.initial);
  const hidden = model.features.length - model.initial;
  const anyOpt = shown.some((f) => f.kind === "numeric" && f.optimumAt != null);
  const anyNarrow = shown.some((f) => f.kind === "numeric" && f.narrowed);
  const legend = (
    <>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
          <circle cx="8" cy="8" r="6.5" fill="var(--surface)" stroke="var(--chart-predicted)" strokeWidth="1.5" />
          <text x="8" y="11" textAnchor="middle" fontSize="9" fill="var(--chart-predicted)">
            1
          </text>
        </svg>
        Proposal (numbers match the batch rows)
      </span>
      {model.incumbentLabel ? (
        <span className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
            <path d="M6 1 L11 6 L6 11 L1 6 Z" fill="var(--chart-reference)" />
          </svg>
          {model.incumbentLabel === "incumbent" ? "Incumbent recipe" : `Other inputs ${model.incumbentLabel}`}
        </span>
      ) : null}
      {anyOpt ? (
        <span className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
            <path d="M6 2 L11 10 L1 10 Z" fill="none" stroke="var(--chart-reference)" strokeWidth="1.5" />
          </svg>
          GP interior optimum
        </span>
      ) : null}
      {anyNarrow ? (
        <span className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 16 10" className="h-2.5 w-4 shrink-0" aria-hidden>
            <rect width="16" height="10" rx="2" fill={hatchFill("smx-legend")} stroke="var(--chart-refused)" />
            <VizDefs id="smx-legend" />
          </svg>
          Excluded from the search box
        </span>
      ) : null}
    </>
  );
  return (
    <ChartFrame
      title="Where the proposals sit in each input's range"
      subtitle="Each track runs from the low to the high end of the input's range; numbers are the proposals. Markers at an end mean the model is extrapolating from one side."
      state={model.proposals.length === 0 || model.features.length === 0 ? { kind: "empty", text: "No proposed setpoints to show." } : { kind: "ready" }}
      stale={stale}
      legend={legend}
      data={setpointMatrixTable(model)}
      footer={footer}
      description={describeSetpointMatrix(model)}
      height={Math.max(1, shown.length) * 44}
      width={width}
    >
      {(w) => (
        <div className="flex flex-col gap-2">
          <Matrix w={w} model={model} features={shown} highlight={highlight} onHighlight={onHighlight} sourceLabel={sourceLabel} />
          {hidden > 0 ? (
            <button type="button" onClick={() => setAll((v) => !v)} className="self-start rounded-md px-1 text-label text-accent hover:underline">
              {all ? `Show the first ${model.initial}` : `Show all ${model.features.length} inputs`}
            </button>
          ) : null}
        </div>
      )}
    </ChartFrame>
  );
}

function Matrix({
  w,
  model,
  features,
  highlight,
  onHighlight,
  sourceLabel,
}: {
  w: number;
  model: SetpointMatrixModel;
  features: SetpointMatrixModel["features"];
  highlight: string | null;
  onHighlight?: (key: string | null) => void;
  sourceLabel?: string;
}) {
  const id = useId().replace(/:/g, "");
  const { tip, markProps, close } = useChartTip();
  const compact = w < 640;
  const tiny = w < 440;
  const labelW = tiny ? 92 : compact ? 120 : LABEL_W;
  const endW = tiny ? 44 : END_W;
  const noteW = compact ? 0 : NOTE_W;
  // The columns always sum to the measured width, so the chart never widens the page.
  const trackW = Math.max(60, w - labelW - 2 * endW - noteW);
  const nMarks = features.filter((f) => f.kind === "numeric").length * model.proposals.length;
  const focusable = nMarks <= MAX_FOCUSABLE_MARKS;
  const cols = `${labelW}px ${endW}px ${trackW}px ${endW}px${noteW ? ` ${noteW}px` : ""}`;

  // Row geometry first, so tooltip positions are known (relative to the matrix container).
  const layout = features.map((f) => {
    if (f.kind === "categorical") return { f, h: 40, lanes: [] as number[], x: null };
    const x = scaleLinear<number>({ domain: f.domain, range: [PAD_X, trackW - PAD_X] });
    const xs = model.proposals.map((p) => {
      const v = p.values[f.name];
      return typeof v === "number" && Number.isFinite(v) ? x(v) : null;
    });
    const placed = laneFor(xs.map((v) => v ?? -1e9));
    const lanes = xs.map((v, i) => (v == null ? -1 : placed[i]));
    const nLanes = Math.max(1, ...lanes.map((l) => l + 1));
    return { f, h: (nLanes - 1) * D + 2 * R + TRACK_BELOW + 6, lanes, x };
  });
  const tops = layout.reduce<number[]>((acc, r, i) => [...acc, i === 0 ? 0 : acc[i - 1] + layout[i - 1].h], []);

  return (
    <div className="relative" onMouseLeave={() => onHighlight?.(null)}>
      <svg width={0} height={0} className="absolute" aria-hidden>
        <VizDefs id={id} />
      </svg>
      <ul className="flex flex-col divide-y divide-border" role="list" aria-label={describeSetpointMatrix(model)}>
        {layout.map(({ f, h, lanes, x }, ri) => (
          <li key={f.name} className={cn("grid", f.kind === "categorical" ? "items-center" : "items-end")} style={{ gridTemplateColumns: cols, minHeight: h }}>
            <div className={cn("min-w-0 pr-2", f.kind === "numeric" && "pb-1.5")}>
              <p className="truncate text-label text-fg" title={f.name}>
                {f.label}
                {f.kind === "numeric" && f.unit ? <span className="font-normal text-fg-muted"> ({f.unit})</span> : null}
              </p>
              <p className="truncate text-caption text-fg-muted">{f.kind === "categorical" ? "categorical" : rangeWord(f)}</p>
            </div>
            {f.kind === "categorical" ? (
              <div className="flex flex-wrap items-center gap-1.5 py-2" style={{ gridColumn: `2 / span 3` }}>
                <Chips f={f} highlight={highlight} onHighlight={onHighlight} incumbentLabel={model.incumbentLabel} />
              </div>
            ) : (
              <>
                <span className="pr-2 text-right text-caption text-fg-muted tabular-nums" style={{ paddingBottom: TRACK_BELOW - 9 }}>
                  {f.range ? settingFormatted(f.range[0], f).value : ""}
                </span>
                <svg width={trackW} height={h} className="overflow-visible">
                  <Track
                    f={f}
                    x={x!}
                    h={h}
                    lanes={lanes}
                    model={model}
                    hatch={hatchFill(id)}
                    highlight={highlight}
                    onHighlight={onHighlight}
                    markProps={(cx, cy, content, label) => markProps(labelW + endW + cx, tops[ri] + cy, content, label, focusable)}
                    sourceLabel={sourceLabel}
                  />
                </svg>
                <span className="pl-2 text-caption text-fg-muted tabular-nums" style={{ paddingBottom: TRACK_BELOW - 9 }}>
                  {f.range ? settingFormatted(f.range[1], f).value : ""}
                </span>
              </>
            )}
            {noteW ? (
              <div className={cn("min-w-0 pl-3", f.kind === "numeric" && "pb-2")}>
                <Notes f={f} model={model} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <ChartTooltip tip={tip} onClose={close} width={w} />
    </div>
  );
}

type MarkPropsFn = (cx: number, cy: number, content: ReactNode, label: string) => ReturnType<ReturnType<typeof useChartTip>["markProps"]>;

function Track({
  f,
  x,
  h,
  lanes,
  model,
  hatch,
  highlight,
  onHighlight,
  markProps,
  sourceLabel,
}: {
  f: NumericFeature;
  x: (v: number) => number;
  h: number;
  lanes: number[];
  model: SetpointMatrixModel;
  hatch: string;
  highlight: string | null;
  onHighlight?: (key: string | null) => void;
  markProps: MarkPropsFn;
  sourceLabel?: string;
}) {
  const trackY = h - TRACK_BELOW;
  const below = trackY + R + 6; // centre of the diamond / triangle, clear of a lane-0 marker
  const [lo, hi] = f.range ?? f.domain;
  const excluded: [number, number][] = [];
  if (f.narrowed && f.range) {
    if (f.narrowed.lower > f.range[0]) excluded.push([f.range[0], Math.min(f.narrowed.lower, f.range[1])]);
    if (f.narrowed.upper < f.range[1]) excluded.push([Math.max(f.narrowed.upper, f.range[0]), f.range[1]]);
  }
  const valueTip = (label: string, v: number) => (
    <div className="flex flex-col gap-1">
      <p className="text-label text-fg">{label}</p>
      <TipRow label={f.label}>{settingFormatted(v, f).text}</TipRow>
      {f.range ? (
        <TipRow label={rangeWord(f)}>
          [{settingFormatted(f.range[0], f).value}, {settingFormatted(f.range[1], f).value}]
        </TipRow>
      ) : (
        <TipRow label="Range">search range not reported</TipRow>
      )}
    </div>
  );
  return (
    <g>
      {excluded.map(([a, b]) => (
        <rect key={`${a}-${b}`} x={x(a)} y={trackY - 5} width={Math.max(1, x(b) - x(a))} height={10} rx={2} fill={hatch} stroke="var(--chart-refused)" aria-hidden />
      ))}
      <line x1={x(lo)} x2={x(hi)} y1={trackY} y2={trackY} stroke="var(--border-strong)" strokeWidth={2} strokeLinecap="round" aria-hidden />
      {f.range ? (
        <g stroke="var(--chart-reference)" strokeWidth={1.25} aria-hidden>
          <line x1={x(lo)} x2={x(lo)} y1={trackY - 6} y2={trackY + 6} />
          <line x1={x(hi)} x2={x(hi)} y1={trackY - 6} y2={trackY + 6} />
        </g>
      ) : null}
      {f.incumbent != null ? (
        <g {...markProps(x(f.incumbent), below, valueTip(model.incumbentLabel ?? "incumbent", f.incumbent), `${model.incumbentLabel ?? "incumbent"} ${f.label} ${settingFormatted(f.incumbent, f).text}`)} tabIndex={-1}>
          <path d={`M${x(f.incumbent)} ${below - 5} L${x(f.incumbent) + 5} ${below} L${x(f.incumbent)} ${below + 5} L${x(f.incumbent) - 5} ${below} Z`} fill="var(--chart-reference)" />
        </g>
      ) : null}
      {f.optimumAt != null ? (
        <g {...markProps(x(f.optimumAt), below, valueTip("GP interior optimum", f.optimumAt), `GP interior optimum ${f.label} ${settingFormatted(f.optimumAt, f).text}`)} tabIndex={-1}>
          <path d={`M${x(f.optimumAt)} ${below - 5} L${x(f.optimumAt) + 5} ${below + 4} L${x(f.optimumAt) - 5} ${below + 4} Z`} fill="var(--surface)" stroke="var(--chart-reference)" strokeWidth={1.5} />
        </g>
      ) : null}
      {model.proposals.map((p, i) => {
        const v = p.values[f.name];
        if (typeof v !== "number" || !Number.isFinite(v) || lanes[i] < 0) return null;
        const cx = x(v);
        const cy = trackY - lanes[i] * D;
        const edge = edgeOf(v, f);
        const on = highlight === p.key;
        const dim = highlight != null && !on;
        const content = (
          <div className="flex flex-col gap-1">
            <p className="text-label text-fg">
              {p.key} <span className="font-normal text-fg-muted">{f.label}</span>
            </p>
            <TipRow label="Proposed">{settingFormatted(v, f).text}</TipRow>
            {edge ? <TipRow label="Position">{edge}</TipRow> : null}
            {f.range ? (
              <TipRow label={rangeWord(f)}>
                [{settingFormatted(f.range[0], f).value}, {settingFormatted(f.range[1], f).value}]
              </TipRow>
            ) : (
              <TipRow label="Range">search range not reported</TipRow>
            )}
            {f.narrowed ? (
              <TipRow label="Searched box">
                [{settingFormatted(f.narrowed.lower, f).value}, {settingFormatted(f.narrowed.upper, f).value}], {formatValue(f.narrowed.nExcluded, { quantity: "count" }).text} excluded
              </TipRow>
            ) : null}
            {f.incumbent != null ? <TipRow label={model.incumbentLabel ?? "incumbent"}>{settingFormatted(f.incumbent, f).text}</TipRow> : null}
            <TipSource>
              proposals[{p.n - 1}].recipe.{f.name}
              {sourceLabel ? ` · ${sourceLabel}` : ""}
            </TipSource>
          </div>
        );
        const mp = markProps(cx, cy, content, `${p.key} ${f.label} ${settingFormatted(v, f).text}${edge ? `, ${edge.endsWith("edge") ? "at " : ""}${edge}` : ""}`);
        return (
          <g
            key={p.key}
            opacity={dim ? 0.35 : 1}
            {...mp}
            onMouseEnter={() => {
              mp.onMouseEnter();
              onHighlight?.(p.key);
            }}
            onFocus={() => {
              mp.onFocus();
              onHighlight?.(p.key);
            }}
          >
            <rect x={cx - 12} y={cy - 12} width={24} height={24} fill="transparent" />
            <circle cx={cx} cy={cy} r={R} fill={on ? "var(--accent-soft)" : "var(--surface)"} stroke={edge ? "var(--warn)" : "var(--chart-predicted)"} strokeWidth={on ? 2.5 : 1.5} />
            <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={10} fontWeight={on ? 600 : 500} fill="var(--chart-predicted)" className="tabular-nums" aria-hidden>
              {p.n}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Chips({ f, highlight, onHighlight, incumbentLabel }: { f: CategoricalFeature; highlight: string | null; onHighlight?: (key: string | null) => void; incumbentLabel: string | null }) {
  return (
    <>
      {f.levels.map((l) => (
        <span key={l.level} className={cn("inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-caption text-fg", l.keys.length === 0 && "text-fg-muted")}>
          {f.incumbent === l.level ? (
            <svg viewBox="0 0 12 12" className="size-2.5 shrink-0" aria-hidden>
              <path d="M6 1 L11 6 L6 11 L1 6 Z" fill="var(--chart-reference)" />
            </svg>
          ) : null}
          <span>{l.level}</span>
          {f.incumbent === l.level ? <span className="sr-only">({incumbentLabel})</span> : null}
          <span className="text-fg-muted tabular-nums">×{formatValue(l.keys.length, { quantity: "count" }).text}</span>
          {l.keys.map((k) => (
            <svg
              key={k}
              viewBox="0 0 16 16"
              className={cn("size-4 shrink-0", highlight != null && highlight !== k && "opacity-40")}
              onMouseEnter={() => onHighlight?.(k)}
              role="img"
              aria-label={k}
            >
              <title>{k}</title>
              <circle cx="8" cy="8" r="6.5" fill={highlight === k ? "var(--accent-soft)" : "var(--surface)"} stroke="var(--chart-predicted)" strokeWidth={highlight === k ? 2 : 1.25} />
              <text x="8" y="11" textAnchor="middle" fontSize="9" fontWeight={highlight === k ? 600 : 500} fill="var(--chart-predicted)">
                {k.replace(/^P/, "")}
              </text>
            </svg>
          ))}
        </span>
      ))}
    </>
  );
}

function Notes({ f, model }: { f: SetpointMatrixModel["features"][number]; model: SetpointMatrixModel }) {
  if (f.kind === "categorical") return <span className="text-caption text-fg-muted">{f.levels.length === 1 ? "one level proposed" : `${f.levels.length} levels shown`}</span>;
  const edges = model.proposals.flatMap((p) => {
    const v = p.values[f.name];
    const e = typeof v === "number" && Number.isFinite(v) ? edgeOf(v, f) : null;
    return e ? [{ key: p.key, e }] : [];
  });
  return (
    <div className="flex flex-col gap-0.5 text-caption">
      {edges.length ? (
        <span className="inline-flex items-start gap-1 text-warn" title={edges.map((x) => edgePhrase(x.key, x.e)).join(", ")}>
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="text-fg">{edges.length <= 2 ? edges.map((x) => edgePhrase(x.key, x.e)).join(", ") : `${edges.length} at an edge or outside`}</span>
        </span>
      ) : null}
      {f.narrowed ? <span className="text-fg-muted">box narrowed, {formatValue(f.narrowed.nExcluded, { quantity: "count" }).text} excluded</span> : null}
    </div>
  );
}
