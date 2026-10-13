"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import {
  SCALE_STAGES,
  SCALEUP_PRIORS,
  pathSummary,
  projectScaleUp,
  type ScaleStage,
  type ScaleStagePrior,
  type ScaleUpPath,
  type ScaleUpPathId,
} from "@/lib/scaleup-projection";

const PATH_ORDER: readonly ScaleUpPathId[] = ["max_yield", "min_cost", "fastest"];

const SVG_W = 500;
const SVG_H = 58;
const PAD_Y = 7;

const xAt = (i: number) => ((i + 0.5) / SCALE_STAGES.length) * SVG_W;

/**
 * The scale-up timeline - the PROJECTED marquee described in
 * docs/DECIDE_COCKPIT.md ("The scale-up timeline" / "Projection module" /
 * "Honesty UX"). Everything here comes from `lib/scaleup-projection.ts`
 * (pure, deterministic, literature-prior driven) - never from the engine,
 * so the whole card carries the dashed-border + "projected" pill honesty
 * treatment rather than the solid-border REAL default.
 *
 * Visual, per the (twice-reviewed) spec: one headline number per stage
 * node (projected yield + its widening band); purity/cost/time move to a
 * click popover on the node, each citing the exact prior factor that
 * produced it; one path highlighted in full color at a time, the other two
 * as thin low-opacity ghost lines with no labels; a text tradeoff row above
 * doubles as the path selector.
 *
 * Color tokens (2026-08-08 shadcn migration): the selected path's line/band/
 * dots and the selector's active state use `--accent`, not `--chart-1`.
 * `--chart-1..5` is reserved for a ramp that encodes magnitude via COLOR
 * across a value range (heatmaps, response surfaces - see heat-scale.ts);
 * this chart is a single highlighted trend line plus a categorical path
 * selector, the same "accent vs. muted ghost" pairing `components/charts.tsx`
 * documents for every other trend chart in the app. The "projected" badge
 * uses the neutral `--explore` family instead (the same "not measured / not
 * live" framing as `DemoBadge` in components/page-header.tsx), so it reads
 * as a distinct signal from "this is the selected path."
 */
export function ScaleUpTimeline({
  bestRecipe,
  bestValue,
  targetName,
  unit,
}: {
  bestRecipe: Record<string, number>;
  bestValue: number;
  targetName: string;
  unit: string;
}) {
  const paths = projectScaleUp(bestRecipe, { yield: bestValue });
  const [selected, setSelected] = useState<ScaleUpPathId>("max_yield");
  const [openStage, setOpenStage] = useState<ScaleStage | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openStage) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpenStage(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenStage(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openStage]);

  const selectedPath = paths.find((p) => p.id === selected) ?? paths[0];
  if (!selectedPath) return null;

  const allBounds = paths.flatMap((p) => p.stages.flatMap((s) => [s.yield.value - s.yield.band, s.yield.value + s.yield.band]));
  const yMin = Math.min(...allBounds);
  const yMax = Math.max(...allBounds);
  const range = yMax - yMin || 1;
  const yAt = (v: number) => PAD_Y + (1 - (v - yMin) / range) * (SVG_H - 2 * PAD_Y);

  const linePoints = (path: ScaleUpPath) => path.stages.map((s, i) => `${xAt(i)},${yAt(s.yield.value)}`).join(" ");
  const bandPolygon = (path: ScaleUpPath) => {
    const upper = path.stages.map((s, i) => `${xAt(i)},${yAt(s.yield.value + s.yield.band)}`);
    const lower = path.stages.map((s, i) => `${xAt(i)},${yAt(s.yield.value - s.yield.band)}`).reverse();
    return [...upper, ...lower].join(" ");
  };

  return (
    <Card className="border border-dashed border-explore-soft bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-fg">Scale-up path</h2>
            <Badge variant="outline" className="h-auto gap-1.5 rounded-full border-explore-soft bg-explore-soft px-2.5 py-0.5 text-[11px] font-medium text-explore-deep">
              <span className="size-1.5 rounded-full bg-explore-deep" />
              projected
            </Badge>
          </div>
          <p className="mt-1 max-w-[52ch] text-[12px] leading-snug text-muted">
            Projected scale-up - physics/literature priors, not yet validated on your process data.
          </p>
        </div>
      </div>

      {/* Tradeoff comparison / path selector - text first, per the design review */}
      <div className="mt-4 flex flex-col gap-2" aria-label="Scale-up path selector">
        {PATH_ORDER.map((id, i) => {
          const path = paths.find((p) => p.id === id);
          if (!path) return null;
          const isSelected = id === selected;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelected(id)}
              className={cn(
                "flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left text-[13px] transition-colors focus-visible:outline-none",
                isSelected ? "border-accent/45 bg-accent-soft" : "border-border bg-bg hover:bg-card",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold",
                  isSelected ? "bg-accent text-[color:var(--primary-foreground)]" : "bg-card text-muted",
                )}
              >
                {i + 1}
              </span>
              <span className="w-[84px] shrink-0 font-semibold text-fg">{path.label}</span>
              <span className="text-muted">{pathSummary(path)}</span>
            </button>
          );
        })}
      </div>

      {/* Horizontal stepper - overflow-x-auto + min-w mirrors correlation-heatmap.tsx */}
      <div ref={containerRef} className="mt-4 overflow-x-auto rounded-[10px] bg-bg p-3">
        <div className="min-w-[560px]">
          <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="none" className="h-[58px] w-full" aria-hidden="true">
            {paths
              .filter((p) => p.id !== selected)
              .map((p) => (
                <polyline key={p.id} points={linePoints(p)} fill="none" stroke="var(--muted)" strokeOpacity={0.35} strokeWidth={1.25} />
              ))}
            <polygon points={bandPolygon(selectedPath)} fill="var(--accent)" fillOpacity={0.14} stroke="none" />
            <polyline points={linePoints(selectedPath)} fill="none" stroke="var(--accent)" strokeWidth={2.25} />
            {selectedPath.stages.map((s, i) => (
              <circle key={s.stage} cx={xAt(i)} cy={yAt(s.yield.value)} r={3} fill="var(--accent)" />
            ))}
          </svg>

          <div className="mt-2 grid grid-cols-5 gap-2">
            {SCALE_STAGES.map((meta) => {
              const point = selectedPath.stages.find((s) => s.stage === meta.stage);
              if (!point) return null;
              const prior = SCALEUP_PRIORS[selected][meta.stage];
              const maxBand = Math.max(...selectedPath.stages.map((s) => s.yield.band)) || 1;
              const bandWidthPct = Math.min(100, 6 + (point.yield.band / maxBand) * 94);
              const isOpen = openStage === meta.stage;
              const panelId = `scaleup-panel-${meta.stage}`;

              return (
                <div key={meta.stage} className="relative flex flex-col items-center">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    aria-label={`${meta.label}: projected ${targetName} ${formatNumber(point.yield.value)}${unit ? ` ${unit}` : ""}, plus or minus ${formatNumber(point.yield.band)}. Activate for purity, cost, and time detail.`}
                    onClick={() => setOpenStage(isOpen ? null : meta.stage)}
                    className="flex w-full flex-col items-center gap-0.5 rounded-[10px] bg-blue-soft px-2 py-2.5 text-center transition-colors hover:bg-blue-soft/70 focus-visible:outline-none"
                  >
                    <span className="text-[9.5px] font-semibold tracking-wide text-muted uppercase">{meta.label}</span>
                    <span className="text-[9.5px] text-muted">{meta.volumeLabel}</span>
                    <span className="tabular mt-1 font-mono text-[16px] font-semibold text-fg">
                      {formatNumber(point.yield.value)}
                      {unit ? <span className="ml-0.5 text-[9.5px] font-normal text-muted">{unit}</span> : null}
                    </span>
                    <span className="tabular text-[9.5px] text-muted">± {formatNumber(point.yield.band)}</span>
                    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-bg">
                      <span
                        className="block h-full rounded-full bg-accent opacity-60"
                        style={{ width: `${bandWidthPct}%`, marginLeft: `${(100 - bandWidthPct) / 2}%` }}
                      />
                    </span>
                  </button>

                  {isOpen ? (
                    <div
                      id={panelId}
                      role="dialog"
                      aria-label={`${meta.label} detail`}
                      className="absolute top-full z-10 mt-2 w-56 rounded-[10px] border border-border bg-card p-3 text-left shadow-lg"
                    >
                      <PopoverRow label="Purity" value={`${formatNumber(point.purity.value, "count")}%`} title={purityNote(meta.stage, prior, meta.label, point.purity.value)} />
                      <PopoverRow label="Cost/L" value={`$${formatNumber(point.costPerL.value, "count")}`} title={costNote(meta.stage, prior, meta.label)} />
                      <PopoverRow label="Time to stage" value={`${formatNumber(point.timeDays.value, "count")} d`} title={timeNote(meta.stage, prior, meta.label)} />
                      <p className="mt-1.5 border-t border-border pt-1.5 text-[10.5px] leading-snug text-muted">{yieldNote(meta.stage, prior, meta.label)}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PopoverRow({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[12px]" title={title}>
      <span className="text-muted">{label}</span>
      <span className="tabular font-mono font-semibold text-fg">{value}</span>
    </div>
  );
}

function yieldNote(stage: ScaleStage, prior: ScaleStagePrior, label: string): string {
  return stage === "plate_96w"
    ? "Measured value - the real best-so-far result, not a projection."
    : `${Math.round(prior.yieldRetention * 100)}% titer-retention prior applied entering ${label} (literature scale-up range).`;
}

function purityNote(stage: ScaleStage, prior: ScaleStagePrior, label: string, value: number): string {
  return stage === "plate_96w"
    ? `Projected from a literature default (${formatNumber(value, "count")}%) - purity wasn't part of this measurement.`
    : `${Math.round(prior.purityRetention * 100)}% purity-retention prior applied entering ${label}.`;
}

function costNote(stage: ScaleStage, prior: ScaleStagePrior, label: string): string {
  return stage === "plate_96w"
    ? "Illustrative cost/L anchor at plate scale - order of magnitude only, not a validated cost model."
    : `${prior.costMultiplier.toFixed(2)}x cost/L multiplier applied entering ${label} (economies-of-scale prior).`;
}

function timeNote(stage: ScaleStage, prior: ScaleStagePrior, label: string): string {
  return stage === "plate_96w"
    ? "Baseline cycle time at plate scale."
    : `+${prior.cycleTimeDays} d cycle-time prior applied entering ${label}.`;
}
