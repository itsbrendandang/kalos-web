"use client";

import { useCallback, useMemo } from "react";
import { hatchFill } from "@/components/viz/defs";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import { HeatGrid, type GridCell } from "@/components/viz/heat-grid";
import { LegendHatchDefs } from "@/components/viz/heatmap";
import { TipRow, TipSource } from "@/components/viz/tooltip";
import { coverageText, formatValue } from "@/lib/num";
import { shortId } from "@/lib/workbench";
import { describeResidualGrid, NEEDS_HISTORY, ratioText, residualTable, residualText, type ResidualCell, type ResidualGrid as Grid } from "@/lib/viz-data/residual-grid";

/*
 * H6 ResidualGrid: round x proposal slot. Each cell is a run: measured minus
 * the prediction the engine recorded when the run started, printed with its
 * sign, shaded by how many band half-widths it is (5 diverging classes; the two
 * middle steps are inside the band). Outside the band (the engine's
 * `inside_band`, verbatim) adds an x glyph and the word. Awaiting runs show the
 * pending state; a run without an engine prediction is hatched with the reason.
 * Rounds already folded into the model read "needs prediction history".
 */
const ID = "residual-grid";
const TINT = { 1: 0.22, 2: 0.5 } as const;

export function ResidualGridChart({ grid, sourceLabel, width: fixedWidth, bare = false }: { grid: Grid; sourceLabel: string; width?: number; bare?: boolean }) {
  const cov = coverageText(grid.coverage);
  const description = describeResidualGrid(grid);
  const empty = !grid.hasResidual && !grid.rounds.some((r) => r.cells.length > 0);
  const state = empty ? { kind: "insufficient" as const, text: NEEDS_HISTORY } : { kind: "ready" as const };
  const columns = useMemo(() => (grid.columns.length ? grid.columns : ["P1"]), [grid.columns]);
  const cell = useCallback((i: number, j: number): GridCell | null => {
    const r = grid.rounds[i];
    if (r.needsHistory) {
      if (j > 0) return null;
      return {
        fill: hatchFill(ID),
        stroke: "var(--chart-refused)",
        lines: ["needs prediction", "history"],
        ink: "var(--fg-muted)",
        aria: `${r.label}: needs prediction history. ${NEEDS_HISTORY}`,
        tip: (
          <div className="flex flex-col gap-1">
            <p className="pr-5 text-label text-fg">{r.label}</p>
            <p className="text-fg-muted">{NEEDS_HISTORY}</p>
            <TipSource>campaign.pending (no runs of this round) · {sourceLabel}</TipSource>
          </div>
        ),
      };
    }
    const c = r.cells.find((x) => x.slot === columns[j]);
    if (!c) return null;
    return toCell(c, r.label, grid.unit, cov, sourceLabel);
  }, [grid, columns, cov, sourceLabel]);
  return (
    <ChartFrame
      bare={bare}
      title="Measured minus predicted, by round"
      subtitle={`Each cell is a run: its measured result minus the prediction the engine recorded when it started, shaded in units of that run's ${cov ? `${cov} ` : ""}band half-width. Drift shows as a round that leans one way.`}
      state={state}
      height={44 + 44 * Math.max(1, grid.rounds.length)}
      width={fixedWidth}
      description={description}
      data={empty ? null : residualTable(grid)}
      legend={
        <>
          <LegendHatchDefs id={`${ID}-legend`} />
          <DivergingKey />
          <LegendItem mark="outside">outside the band (engine)</LegendItem>
          <LegendItem mark="pending">awaiting a result</LegendItem>
          <LegendItem mark="hatch">no engine prediction, or needs prediction history</LegendItem>
        </>
      }
      footer={`From: ${sourceLabel} · campaign.pending[].{round, prediction_at_start, residual, inside_band} · inside or outside is the engine's own flag · earlier rounds need folded_runs[].prediction_at_start (not in the engine yet)`}
    >
      {(width) => (
        <HeatGrid
          id={ID}
          width={width}
          ariaLabel={description}
          rows={grid.rounds.map((r) => ({
            key: String(r.round),
            label: r.label,
            sub: r.needsHistory ? "folded, not recorded" : `${r.inside} of ${r.judged} inside${r.awaiting ? ` · ${r.awaiting} awaiting` : ""}`,
            strong: !r.needsHistory,
          }))}
          columns={columns.map((c) => ({ key: c, label: c }))}
          cell={cell}
          rowH={44}
          headH={30}
          minCol={92}
          maxCol={132}
        />
      )}
    </ChartFrame>
  );
}

function toCell(c: ResidualCell, round: string, unit: string | null, cov: string | null, sourceLabel: string): GridCell {
  const tip = <ResidualTip c={c} round={round} unit={unit} cov={cov} sourceLabel={sourceLabel} />;
  const run = shortId(c.runId);
  if (c.state === "awaiting") {
    return { fill: "var(--surface)", dashed: true, lines: ["Awaiting", "result"], ink: "var(--fg-muted)", aria: `${round}, ${c.slot}, run ${run}: awaiting a measured result`, tip };
  }
  if (c.state === "no-prediction" || c.state === "no-band") {
    return {
      fill: hatchFill(ID),
      stroke: "var(--chart-refused)",
      lines: [c.residual != null ? residualText(c) : "no engine", c.state === "no-band" ? "no band" : "prediction"],
      ink: "var(--fg)",
      aria: `${round}, ${c.slot}, run ${run}: ${c.reason ?? "no engine prediction"}`,
      tip,
    };
  }
  const k = c.cls ?? 0;
  const outside = c.inside === false;
  return {
    fill: "var(--surface)",
    tint: k === 0 ? null : { color: k < 0 ? "var(--chart-div-neg)" : "var(--chart-div-pos)", opacity: TINT[Math.abs(k) as 1 | 2] },
    lines: [residualText(c), `${ratioText(c.ratio)}${outside ? " out" : c.inside ? " in" : ""}`],
    ink: "var(--fg)",
    subInk: "var(--fg)",
    bold: true,
    glyph: outside ? "outside" : null,
    aria: `${round}, ${c.slot}, run ${run}: measured minus predicted ${residualText(c)}${unit ? ` ${unit}` : ""}, ${ratioText(c.ratio)} the band half-width, ${c.inside == null ? "inside or outside not reported" : c.inside ? "inside the band" : "outside the band"}`,
    tip,
  };
}

function ResidualTip({ c, round, unit, cov, sourceLabel }: { c: ResidualCell; round: string; unit: string | null; cov: string | null; sourceLabel: string }) {
  const u = unit ? ` ${unit}` : "";
  return (
    <div className="flex flex-col gap-1">
      <p className="pr-5 text-label text-fg">
        {round} · {c.slot} · run <span className="font-mono">{shortId(c.runId)}</span>
      </p>
      <TipRow label="Predicted at start">{c.pred != null ? `${formatValue(c.pred, { uncertainty: c.halfWidth ?? undefined }).value}${u}` : "n/a"}</TipRow>
      <TipRow label={cov ? `${cov} band at start` : "Band at start"}>{c.lo != null && c.hi != null ? `[${formatValue(c.lo, { uncertainty: c.halfWidth ?? undefined }).value}, ${formatValue(c.hi, { uncertainty: c.halfWidth ?? undefined }).value}]` : "n/a"}</TipRow>
      <TipRow label="Measured">{c.measured != null ? `${formatValue(c.measured, { uncertainty: c.halfWidth ?? undefined }).value}${u}` : c.state === "awaiting" ? "Awaiting result" : "n/a"}</TipRow>
      <TipRow label="Measured − predicted">{residualText(c)}</TipRow>
      <TipRow label="In band half-widths">{ratioText(c.ratio)}</TipRow>
      <TipRow label="Inside the band">{c.inside == null ? "n/a" : c.inside ? "yes (engine)" : "no (engine)"}</TipRow>
      {c.reason ? <p className="text-fg-muted">{c.reason}</p> : null}
      <TipSource>
        campaign.pending[id={shortId(c.runId)}].prediction_at_start, .residual, .inside_band · {sourceLabel}
      </TipSource>
    </div>
  );
}

/** The diverging key: 5 classes in band half-widths, the two middle steps inside the band. */
function DivergingKey() {
  const steps: { label: string; color: string | null; op: number }[] = [
    { label: "below −1", color: "var(--chart-div-neg)", op: TINT[2] },
    { label: "−1 to −⅓", color: "var(--chart-div-neg)", op: TINT[1] },
    { label: "−⅓ to ⅓", color: null, op: 0 },
    { label: "⅓ to 1", color: "var(--chart-div-pos)", op: TINT[1] },
    { label: "above 1", color: "var(--chart-div-pos)", op: TINT[2] },
  ];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>Half-widths:</span>
      {steps.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1">
          <svg viewBox="0 0 14 10" className="h-2.5 w-3.5 shrink-0" aria-hidden>
            <rect width="14" height="10" rx="2" fill="var(--surface)" stroke="var(--chart-grid)" strokeWidth={0.75} />
            {s.color ? <rect width="14" height="10" rx="2" fill={s.color} fillOpacity={s.op} /> : null}
          </svg>
          {s.label}
        </span>
      ))}
    </span>
  );
}
