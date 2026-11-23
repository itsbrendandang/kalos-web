"use client";

import { ChartFrame } from "@/components/viz/frame";
import { SourceButton } from "@/components/viz/num";
import { targetUnitOf, type PopulatedResult } from "@/lib/api";
import { formatValue } from "@/lib/num";
import { sourceFromAnalysis } from "@/lib/source";
import { outcomeDistribution } from "@/lib/viz-data/outcome-distribution";

export function OutcomeDistribution({ analysis }: { analysis: PopulatedResult }) {
  const data = outcomeDistribution(analysis.oof);
  const source = sourceFromAnalysis(analysis, "oof[i][0]", "measured", "Equal-width histogram of finite held-out pairs; counts only");
  const unit = targetUnitOf(analysis);
  const label = (v: number) => formatValue(v, { unit }).text;
  const count = (v: number) => formatValue(v, { quantity: "count" }).text;
  const highest = Math.max(1, ...data.bins.map((b) => b.count));
  return <ChartFrame bare title="How the held-out measurements are distributed" subtitle={`${count(data.n)} held-out pairs · ${analysis.target}`} height={220}
    description="Counts of measured outcomes in the engine's held-out pairs. Not a fitted density, the full uploaded sheet, or the campaign run log."
    state={data.n ? { kind: "ready" } : { kind: "empty", text: "The engine returned no finite held-out pairs. There is no distribution to draw." }}
    data={{ columns: [`From (${unit ?? analysis.target})`, `To (${unit ?? analysis.target})`, "Measured count"], rows: data.bins.map((b) => [b.lo, b.hi, b.count]), caption: "Bins include the lower edge and exclude the upper edge, except the last bin includes both. A single repeated value is one bin." }}
    footer={<span className="inline-flex flex-wrap items-center gap-1">{source.label} · measured values from oof[i][0] <SourceButton source={source} /></span>}
    legend={<span className="text-caption text-fg-muted">Descriptive counts, not a fitted density or all uploaded runs. {data.bins.length === 1 && data.n ? "All included measurements have the same value. " : ""}{data.excluded ? `${count(data.excluded)} incomplete or non-finite pairs left out. ` : ""}No campaign run is matched to a held-out pair.</span>}
  >{(width) => {
    const left = 34, right = 12, top = 24, bottom = 46, height = 220;
    const inner = Math.max(1, width - left - right);
    const plot = height - top - bottom;
    const step = inner / Math.max(1, data.bins.length);
    const ticks = [...new Set([0, Math.round(highest / 2), highest])];
    return <svg width={width} height={height} role="img" aria-label={`${count(data.n)} measured outcomes in ${data.bins.length} bins; exact bin edges and counts are in Data.`} className="max-w-full text-fg">
      {ticks.map((n) => <g key={n}><line x1={left} x2={width-right} y1={top + plot * (1-n/highest)} y2={top + plot * (1-n/highest)} stroke="var(--chart-grid)" /><text x={left-7} y={top+plot*(1-n/highest)+4} textAnchor="end" className="fill-fg-muted text-caption">{count(n)}</text></g>)}
      {data.bins.map((b, i) => <rect key={i} x={left + i*step + 2} y={top + plot*(1-b.count/highest)} width={Math.max(1, step-4)} height={plot*b.count/highest} fill="var(--chart-measured)"><title>{label(b.lo)} to {label(b.hi)}: {count(b.count)} measured outcomes</title></rect>)}
      {data.bins.length ? <><text x={left} y={height-25} className="fill-fg-muted text-caption">{label(data.bins[0].lo)}</text>{data.bins.length > 1 ? <text x={width-right} y={height-25} textAnchor="end" className="fill-fg-muted text-caption">{label(data.bins[data.bins.length-1].hi)}</text> : null}</> : null}
      <text x={left} y={12} className="fill-fg-muted text-caption">Measured count</text>
      <text x={width/2} y={height-4} textAnchor="middle" className="fill-fg-muted text-caption">Measured response{unit ? ` (${unit})` : ""}</text>
    </svg>;
  }}</ChartFrame>;
}
