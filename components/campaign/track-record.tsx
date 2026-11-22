"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChartFrame } from "@/components/kit/chart-frame";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { ChartTooltipBox } from "@/components/tremor/chart-parts";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  chartNote,
  currentSheetOnly,
  describePoint,
  groupByRound,
  layoutSlots,
  niceTicks,
  roundRows,
  scoringRules,
  trackPoints,
  trackVerdict,
  valueDomain,
  type TrackGroup,
  type TrackPoint,
} from "@/components/campaign/track-record-data";
import { useAsync } from "@/hooks/use-async";
import { useCampaignKey, useDefaultCampaignId } from "@/hooks/use-assist";
import { getTrackRecord, getTrackRuns } from "@/lib/assist";
import { describeEngineError } from "@/lib/engine-error";
import { formatNumber } from "@/lib/format";

const HEAD = "bg-surface px-2 whitespace-normal sm:px-3 sm:whitespace-nowrap";
const CELL = "px-2 sm:px-3";
const CARD = "rounded-2xl border border-border bg-surface shadow-card";

/**
 * Track record: how the predictions the engine recorded when each run started
 * held up once the run was measured. Reads the engine's prospective record,
 * never the current analysis. `fallback` renders when the engine has no
 * track-record route (older engines), so the page can keep its own check.
 */
export function TrackRecordSection({ targetName, unit, fallback = null }: { targetName: string; unit: string; fallback?: ReactNode }) {
  const campaignId = useDefaultCampaignId();
  const key = useCampaignKey();
  const id = campaignId.status === "data" ? campaignId.data : null;
  const readKey = id && key ? `${id}|${key}` : null;
  const record = useAsync(() => (id ? getTrackRecord(id) : Promise.resolve(null)), readKey);
  const runs = useAsync(() => (id ? getTrackRuns(id) : Promise.resolve(null)), readKey);

  const title = "Track record";
  const description = "How the predictions recorded when each run started held up once it was measured.";

  if (campaignId.status === "error" || record.status === "error" || runs.status === "error") {
    const failure = campaignId.status === "error" ? campaignId.error : record.status === "error" ? record.error : runs.status === "error" ? runs.error : null;
    const retry = () => {
      if (campaignId.status === "error") campaignId.reload();
      record.reload();
      runs.reload();
    };
    return (
      <Section title={title} description={description}>
        <ErrorState title="Could not load the track record" description={`${describeEngineError(failure).replace(/([^.!?])$/, "$1.")} This is a problem with the request, not a finding about your results.`} onRetry={retry} />
      </Section>
    );
  }
  // The engine answered that it has no campaigns route: nothing to show here.
  if (campaignId.status === "data" && campaignId.data == null) return <>{fallback}</>;
  if (record.status !== "data" || runs.status !== "data") {
    return (
      <Section title={title} description={description}>
        <div className="flex flex-col gap-4">
          <LoadingSkeleton variant="rows" rows={1} label="Loading the track record" />
          <LoadingSkeleton variant="chart" label="Loading the track record chart" />
        </div>
      </Section>
    );
  }
  if (record.data == null || runs.data == null) return <>{fallback}</>;

  const tr = record.data;
  if (!tr.has_campaign) {
    return (
      <Section title={title} description={description}>
        <p className="text-body text-fg-muted">There is no campaign record to score yet.</p>
      </Section>
    );
  }

  const sheet = currentSheetOnly(tr, runs.data.items);
  const points = trackPoints(sheet.items);
  const groups = groupByRound(points);
  const rows = roundRows(sheet);
  const rules = scoringRules(tr);
  const note = chartNote(points, runs.data.has_more, sheet.leftOut);
  const pct = formatNumber(tr.coverage, "pct");

  return (
    <Section title={title} description={description}>
      <p className="max-w-[68ch] text-body text-fg">{trackVerdict(sheet.coverage)}</p>

      <ChartFrame
        className={CARD}
        title={`Predicted and measured ${targetName}`}
        unit={unit || undefined}
        n={points.length}
        method={`Each column is one run, grouped by round. The dot is the prediction recorded when the run started, the shaded bar its ${pct} range, and the diamond the measured result. Runs still awaiting a result show only the prediction.`}
        state={points.length ? "ready" : "empty"}
        emptyText="No run has a recorded prediction yet."
        height={points.length ? 0 : 160}
      >
        <TrackLegend pct={pct} />
        <TrackChart groups={groups} unit={unit} targetName={targetName} />
        {note ? <p className="text-caption text-fg-muted">{note}</p> : null}
      </ChartFrame>

      {rows.length ? (
        <div className={`${CARD} px-2 py-1`}>
          <Table aria-label="Track record by round">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD}>Round</TableHead>
                <TableHead numeric className={HEAD}>Started</TableHead>
                <TableHead numeric className={HEAD}>Measured</TableHead>
                <TableHead numeric className={HEAD}>Inside range</TableHead>
                <TableHead numeric className={HEAD}>Mean error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.round}>
                  <TableCell className={`${CELL} tabular-nums`}>Round {r.round}</TableCell>
                  <TableCell numeric className={CELL}>{formatNumber(r.started, "count")}</TableCell>
                  <TableCell numeric className={CELL}>
                    {formatNumber(r.measured, "count")}
                    {r.corrected ? <span className="text-fg-muted"> ({formatNumber(r.corrected, "count")} corrected)</span> : null}
                  </TableCell>
                  <TableCell numeric className={CELL}>
                    {r.scored ? `${formatNumber(r.inside, "count")} of ${formatNumber(r.scored, "count")}` : <span className="text-fg-muted">none scored</span>}
                  </TableCell>
                  <TableCell numeric className={CELL}>{r.meanError == null ? <span className="text-fg-muted">n/a</span> : formatNumber(r.meanError, "value", { sign: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-3 pb-3 pt-1 text-caption text-fg-muted">
            Mean error is measured minus predicted{unit ? `, in ${unit}` : ""}: above zero means results came in higher than predicted.
          </p>
        </div>
      ) : null}

      <div>
        <Disclosure summary="How this is scored">
          <div className="flex max-w-[68ch] flex-col gap-3 text-body text-fg-muted">
            <p>
              When a run is started, the engine records its prediction and the {pct} range around it. Once a result is recorded, the result is compared with that
              recorded prediction, never with a later analysis. A run counts only when its prediction was recorded before its first result.
            </p>
            {rules.length ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
                {rules.map((r) => (
                  <div key={r.label} className="contents">
                    <dt className="text-label text-fg">{r.label}</dt>
                    <dd className="mb-1 sm:mb-0">{r.text}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </Disclosure>
      </div>
    </Section>
  );
}

function PredictedMark() {
  return (
    <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden className="shrink-0">
      <circle r="4" fill="var(--chart-predicted)" />
    </svg>
  );
}

function MeasuredMark() {
  return (
    <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden className="shrink-0">
      <path d="M0 -5 L5 0 L0 5 L-5 0 Z" fill="var(--chart-measured)" />
    </svg>
  );
}

function TrackLegend({ pct }: { pct: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-muted">
      <li className="inline-flex items-center gap-1.5">
        <PredictedMark />
        Predicted at start
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-2.5 shrink-0 rounded-sm bg-chart-band" />
        {pct} range recorded at start
      </li>
      <li className="inline-flex items-center gap-1.5">
        <MeasuredMark />
        Measured
      </li>
    </ul>
  );
}

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const H = 240;
const M = { top: 12, right: 8, bottom: 28, left: 48 };

/** Hand-built SVG: one column per run, grouped by round, a gap of one column between rounds. */
function TrackChart({ groups, unit, targetName }: { groups: TrackGroup[]; unit: string; targetName: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<TrackPoint | null>(null);
  const points = groups.flatMap((g) => g.points);
  const domain = valueDomain(points);
  const nRuns = points.length;
  const label = `Predicted and measured ${targetName} for ${nRuns} runs across ${groups.length} ${groups.length === 1 ? "round" : "rounds"}`;

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = H - M.top - M.bottom;
  const { slots, rounds } = layoutSlots(groups);
  const slotW = slots ? plotW / slots : 0;
  const [d0, d1] = domain ?? [0, 1];
  const y = (v: number) => M.top + plotH - ((v - d0) / (d1 - d0)) * plotH;
  const ticks = niceTicks(d0, d1, 5);
  const bandW = Math.max(3, Math.min(14, slotW * 0.5));
  const r = Math.max(2.5, Math.min(4.5, slotW * 0.25));

  const laid = rounds.map((g) => ({
    round: g.round,
    cols: g.cols.map(({ p, slot }) => ({ p, cx: M.left + (slot + 0.5) * slotW })),
    x0: M.left + g.start * slotW,
    x1: M.left + g.end * slotW,
  }));
  const hoverX = hover ? laid.flatMap((g) => g.cols).find((c) => c.p.id === hover.id)?.cx : undefined;

  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      {width > 0 && domain ? (
        <svg width={width} height={H} role="img" aria-label={label} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-muted text-caption tabular-nums">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {laid.map((g, gi) => (
            <g key={g.round}>
              {gi > 0 ? <line x1={g.x0 - slotW / 2} x2={g.x0 - slotW / 2} y1={M.top} y2={M.top + plotH} stroke="var(--chart-grid)" strokeDasharray="3 3" /> : null}
              <text x={(g.x0 + g.x1) / 2} y={H - 8} textAnchor="middle" className="fill-fg-muted text-caption tabular-nums">
                {g.x1 - g.x0 >= 60 ? `Round ${g.round}` : `R${g.round}`}
              </text>
              {g.cols.map(({ p, cx }) => (
                <g key={p.id}>
                  {p.lo != null && p.hi != null ? (
                    <g>
                      <rect x={cx - bandW / 2} width={bandW} y={y(p.hi)} height={Math.max(1, y(p.lo) - y(p.hi))} rx={2} fill="var(--chart-band)" />
                      <line x1={cx - bandW / 2} x2={cx + bandW / 2} y1={y(p.hi)} y2={y(p.hi)} stroke="var(--chart-predicted)" />
                      <line x1={cx - bandW / 2} x2={cx + bandW / 2} y1={y(p.lo)} y2={y(p.lo)} stroke="var(--chart-predicted)" />
                    </g>
                  ) : null}
                  {p.pred != null ? <circle cx={cx} cy={y(p.pred)} r={r} fill="var(--chart-predicted)" stroke="var(--surface)" strokeWidth={1.5} /> : null}
                  {p.measured != null ? (
                    <path
                      d={`M${cx} ${y(p.measured) - r - 1} L${cx + r + 1} ${y(p.measured)} L${cx} ${y(p.measured) + r + 1} L${cx - r - 1} ${y(p.measured)} Z`}
                      fill="var(--chart-measured)"
                      stroke="var(--surface)"
                      strokeWidth={1.5}
                    />
                  ) : null}
                  <rect
                    x={cx - slotW / 2}
                    width={slotW}
                    y={M.top}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(p)}
                    onMouseLeave={() => setHover((h) => (h?.id === p.id ? null : h))}
                  >
                    <title>{describePoint(p, unit)}</title>
                  </rect>
                </g>
              ))}
            </g>
          ))}
          {hoverX != null ? <line x1={hoverX} x2={hoverX} y1={M.top} y2={M.top + plotH} stroke="var(--border-strong)" strokeDasharray="3 3" pointerEvents="none" /> : null}
        </svg>
      ) : null}
      {hover && hoverX != null ? (
        <div
          className="pointer-events-none absolute top-0 z-10"
          style={hoverX > width / 2 ? { right: width - hoverX + 12 } : { left: hoverX + 12 }}
        >
          <ChartTooltipBox label={`Round ${hover.round}`}>
            <TooltipLine name="Predicted" value={hover.pred} unit={unit} mark={<PredictedMark />} />
            {hover.lo != null && hover.hi != null ? (
              <div className="flex justify-between gap-6 text-fg-muted">
                <span>Range</span>
                <span className="text-fg tabular-nums">
                  {formatNumber(hover.lo)} to {formatNumber(hover.hi)}
                </span>
              </div>
            ) : null}
            {hover.measured != null ? (
              <TooltipLine name={hover.corrected ? "Measured (corrected)" : "Measured"} value={hover.measured} unit={unit} mark={<MeasuredMark />} />
            ) : (
              <p className="text-fg-muted">Awaiting a result</p>
            )}
            {hover.kind === "scored" && hover.inside != null ? <p className="text-fg">{hover.inside ? "Inside the range" : "Outside the range"}</p> : null}
            {hover.kind === "unscored" ? <p className="text-fg-muted">Not scored</p> : null}
          </ChartTooltipBox>
        </div>
      ) : null}
      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.id}>{describePoint(p, unit)}</li>
        ))}
      </ul>
    </div>
  );
}

function TooltipLine({ name, value, unit, mark }: { name: string; value: number | null; unit: string; mark: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 text-fg-muted">
        {mark}
        {name}
      </span>
      <span className="text-fg tabular-nums">
        {formatNumber(value)}
        {unit && value != null ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
