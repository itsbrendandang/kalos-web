"use client";

import { ChartFrame } from "@/components/kit/chart-frame";
import { formatNumber } from "@/lib/format";
import { finitePairs, outcomeBins } from "@/lib/science-viz";
import type { Calibration, Proposal } from "@/lib/api";

const W = 360, H = 218, L = 44, R = 14, T = 16, B = 46;
const plotW = W - L - R, plotH = H - T - B;
const svgClass = "w-full overflow-visible text-[12px] text-fg-muted";

function PlotAxes({ xLabel, yLabel }: { xLabel: string; yLabel: string }) {
  return <g fill="currentColor" stroke="none">
    <path d={`M${L} ${T}V${T+plotH}H${W-R}`} fill="none" stroke="var(--border-strong)" />
    <text x={L} y={10}>{yLabel}</text>
    <text x={L+plotW/2} y={H-3} textAnchor="middle">{xLabel}</text>
  </g>;
}

export function OutcomeDistribution({ oof = [], target, unit }: { oof?: [number, number][]; target: string; unit: string }) {
  const values = finitePairs(oof).map(([measured]) => measured);
  const bins = outcomeBins(values);
  const maxCount = Math.max(1, ...bins.map(b => b.count));
  return <ChartFrame title="Where did measured outcomes land?" unit={unit || undefined} n={values.length} height={220} state={values.length ? "ready" : "empty"} emptyText="Held-out measurements are not available yet. No distribution is inferred." method="Counts of the measured values in the engine's held-out pairs, not a fitted curve or all uploaded rows. Equal-width bins; no outlier trimming. The final bin includes its upper edge.">
    {bins.length ? <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Histogram of ${values.length} held-out measured ${target} values`} className={svgClass}>
        <PlotAxes xLabel={`Measured response${unit ? ` (${unit})` : ""}`} yLabel="Held-out run count" />
        {[0, maxCount].map(n=><text key={n} x={L-6} y={T+plotH-(n/maxCount)*plotH+4} textAnchor="end" fill="currentColor">{n}</text>)}
        {bins.map((b, i) => {
          const width=plotW/bins.length, height=(b.count/maxCount)*plotH;
          return <g key={i}><rect x={L+i*width+2} y={T+plotH-height} width={Math.max(1,width-4)} height={height} rx="3" fill="var(--chart-measured)" opacity=".8"><title>{`${formatNumber(b.lo)} to ${formatNumber(b.hi)}: ${b.count} runs`}</title></rect></g>;
        })}
        <text x={L} y={H-25} fill="currentColor">{formatNumber(bins[0].lo)}</text>
        <text x={W-R} y={H-25} textAnchor="end" fill="currentColor">{formatNumber(bins[bins.length-1].hi)}</text>
      </svg>
      <p className="mt-2 text-caption text-fg-muted">Measured values from held-out pairs only; these may be a subset of the uploaded runs.</p>
      <details className="mt-3 text-caption text-fg-muted"><summary className="cursor-pointer">View bin counts</summary><table className="mt-2 w-full text-left"><thead><tr><th className="font-medium">Measured range</th><th className="font-medium">Runs</th></tr></thead><tbody>{bins.map((b,i)=><tr key={i}><td>{formatNumber(b.lo)}–{formatNumber(b.hi)}</td><td>{b.count}</td></tr>)}</tbody></table></details>
    </> : null}
  </ChartFrame>;
}

export function ProposalTradeoff({ proposals, target, unit }: { proposals: Proposal[]; target: string; unit: string }) {
  const points=proposals.map((p,i)=>({...p, index:i+1})).filter(p=>Number.isFinite(p.pred)&&Number.isFinite(p.std)&&p.std>=0);
  const xs=points.map(p=>p.pred), lo=Math.min(...xs), hi=Math.max(...xs);
  const padding=hi>lo ? (hi-lo)*.08 : Math.max(Math.abs(lo)*.08,1);
  const min=lo-padding, max=hi+padding, sdMax=Math.max(...points.map(p=>p.std),1e-9)*1.12;
  const x=(n:number)=>L+(n-min)/(max-min)*plotW, y=(n:number)=>T+plotH-(n/sdMax)*plotH;
  return <ChartFrame title="Predicted response × uncertainty" unit={unit || undefined} n={points.length} height={220} state={points.length ? "ready" : "empty"} emptyText="No proposals with a finite mean and non-negative posterior SD were returned." method="Each point is an engine proposal. Horizontal position is its predicted mean; height is its posterior standard deviation. These are model estimates, not measurements, and SD is not a calibrated prediction interval.">
    {points.length ? <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Predicted ${target} versus posterior standard deviation for ${points.length} proposed experiments`} className={svgClass}>
        <PlotAxes xLabel={`Predicted response${unit ? ` (${unit})` : ""}`} yLabel="Posterior SD (same response units)" />
        {[0,sdMax].map((n,i)=><text key={i} x={L-6} y={y(n)+4} textAnchor="end" fill="currentColor">{formatNumber(n)}</text>)}
        {[lo,hi].filter((n,i,a)=>a.indexOf(n)===i).map(n=><text key={n} x={x(n)} y={H-25} textAnchor="middle" fill="currentColor">{formatNumber(n)}</text>)}
        {points.map(p=><g key={p.index}><circle cx={x(p.pred)} cy={y(p.std)} r="6" stroke="var(--chart-predicted)" strokeWidth="2" fill={p.mode==="explore" ? "var(--surface)" : "var(--chart-predicted)"}><title>{`Proposal ${p.index}: predicted ${formatNumber(p.pred)}, SD ${formatNumber(p.std)}; ${p.mode}`}</title></circle><text x={x(p.pred)+8} y={y(p.std)-7} fill="currentColor">{p.index}</text></g>)}
      </svg>
      <p className="mt-2 text-caption text-fg-muted">Filled: exploit · open: explore. Numbers are the original proposal order, not a new ranking. SD is not a calibrated interval.</p>
      <details className="mt-3 text-caption text-fg-muted"><summary className="cursor-pointer">View plotted proposals</summary><table className="mt-2 w-full text-left"><thead><tr><th>Proposal</th><th>Mean</th><th>SD</th><th>Mode</th></tr></thead><tbody>{points.map(p=><tr key={p.index}><td>{p.index}</td><td>{formatNumber(p.pred)}</td><td>{formatNumber(p.std)}</td><td>{p.mode}</td></tr>)}</tbody></table></details>
    </> : null}
    {points.length !== proposals.length ? <p className="mt-2 text-caption text-fg-muted">{proposals.length-points.length} proposal(s) omitted because their mean or SD could not be plotted.</p> : null}
  </ChartFrame>;
}

export function CalibrationChart({ calibration }: { calibration: Calibration | undefined }) {
  const levels=calibration?.available ? calibration.levels.filter(p=>Number.isFinite(p.nominal)&&Number.isFinite(p.empirical)&&p.nominal>=0&&p.nominal<=1&&p.empirical>=0&&p.empirical<=1).toSorted((a,b)=>a.nominal-b.nominal) : [];
  const x=(n:number)=>L+n*plotW, y=(n:number)=>T+(1-n)*plotH;
  return <ChartFrame title="Do the uncertainty bands cover enough runs?" n={calibration?.n} height={220} state={levels.length ? "ready" : "empty"} emptyText={calibration?.reason || "The engine has not returned usable held-out interval coverage. No calibration curve is inferred."} method="The engine's reported empirical interval coverage against each nominal level. The diagonal is ideal agreement, not a fitted model. Points below it indicate undercoverage at that level; this plot does not replace the engine reliability verdict.">
    {levels.length ? <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Nominal versus empirical interval coverage at ${levels.length} reported levels`} className={svgClass}>
        <PlotAxes xLabel="Nominal interval coverage" yLabel="Observed held-out coverage" />
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--chart-reference)" strokeDasharray="4 4" />
        <polyline points={levels.map(p=>`${x(p.nominal)},${y(p.empirical)}`).join(" ")} stroke="var(--chart-predicted)" fill="none" strokeWidth="2" />
        {[0,.5,1].map(n=><g key={n} fill="currentColor"><text x={x(n)} y={H-25} textAnchor="middle">{Math.round(n*100)}%</text><text x={L-6} y={y(n)+4} textAnchor="end">{Math.round(n*100)}%</text></g>)}
        {levels.map((p,i)=><circle key={i} cx={x(p.nominal)} cy={y(p.empirical)} r="4" fill="var(--surface)" stroke="var(--chart-predicted)" strokeWidth="2"><title>{`Nominal ${formatNumber(p.nominal*100)}%, observed ${formatNumber(p.empirical*100)}%`}</title></circle>)}
      </svg>
      <p className="mt-2 text-caption text-fg-muted">Below the diagonal: fewer held-out runs were covered than the interval claimed. Reported engine values, not a new reliability decision.</p>
      <details className="mt-3 text-caption text-fg-muted"><summary className="cursor-pointer">View coverage values</summary><table className="mt-2 w-full text-left"><thead><tr><th>Nominal</th><th>Observed</th></tr></thead><tbody>{levels.map((p,i)=><tr key={i}><td>{formatNumber(p.nominal*100)}%</td><td>{formatNumber(p.empirical*100)}%</td></tr>)}</tbody></table></details>
    </> : null}
  </ChartFrame>;
}
