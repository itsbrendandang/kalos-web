// Pure, unit-tested logic for the Log tab: activity-strip bucketing and the
// campaign-timeline's delta chips. No React, no fetching - components call
// these with data the adapter already resolved. All dates are plain
// "YYYY-MM-DD" strings and are parsed as UTC midnight so day-arithmetic is
// exact regardless of the viewer's local timezone.
import type { ActivityDay, ActivityStats } from "./log-types";

const DAY_MS = 86_400_000;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseISODate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function toISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayDiff(aISO: string, bISO: string): number {
  return Math.round((parseISODate(bISO) - parseISODate(aISO)) / DAY_MS);
}

/** Buckets one day's run count into the 5-step "quiet to busy" ramp,
 *  relative to the busiest day in the visible series (not a fixed absolute
 *  scale - a campaign that never runs more than 2/day should still show its
 *  busiest days as "full", not permanently "quiet"). */
export function activityLevel(runs: number, maxRuns: number): 0 | 1 | 2 | 3 | 4 {
  if (runs <= 0 || maxRuns <= 0) return 0;
  const t = runs / maxRuns;
  if (t <= 0.25) return 1;
  if (t <= 0.5) return 2;
  if (t <= 0.75) return 3;
  return 4;
}

/** Derives the header sentence's three numbers from a raw `{date, runs}[]`
 *  series. Mirrors what the engine's own `stats` object should mean (see
 *  lib/api.ts's CampaignActivity) - used for demo data so the mock path
 *  exercises the same definitions a real payload would. "Longest pause" only
 *  counts a gap strictly BETWEEN two run-days: time before the first run or
 *  after the most recent one is "not started yet" / "still open", not a
 *  pause. */
export function computeActivityStats(days: ActivityDay[], todayISO: string): ActivityStats {
  const past = days
    .filter((d) => d.date <= todayISO)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  if (past.length === 0) return { daysRunning: 0, daysWithRuns: 0, longestPauseDays: 0 };

  const daysRunning = dayDiff(past[0].date, todayISO) + 1;
  const daysWithRuns = past.filter((d) => d.runs > 0).length;

  const runDates = past.filter((d) => d.runs > 0).map((d) => d.date);
  let longestPauseDays = 0;
  for (let i = 1; i < runDates.length; i++) {
    const gap = dayDiff(runDates[i - 1], runDates[i]) - 1;
    if (gap > longestPauseDays) longestPauseDays = gap;
  }
  return { daysRunning, daysWithRuns, longestPauseDays };
}

/** Whole days between the most recent day with a measured run and today.
 *  Null when nothing has been measured yet - the caller renders nothing
 *  rather than "0 days ago", which would read as "a run landed today". */
export function daysSinceLastRun(days: ActivityDay[], todayISO: string): number | null {
  const runDates = days.filter((d) => d.runs > 0 && d.date <= todayISO).map((d) => d.date);
  if (runDates.length === 0) return null;
  runDates.sort();
  return dayDiff(runDates[runDates.length - 1], todayISO);
}

export type ActivityCell = { date: string; runs: number; level: 0 | 1 | 2 | 3 | 4; future: boolean };
export type ActivityWeek = { cells: ActivityCell[]; monthLabel: string | null };

function mondayOf(iso: string): string {
  const ms = parseISODate(iso);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return toISODate(ms - backToMonday * DAY_MS);
}

/** Buckets a `{date, runs}[]` series into Monday-start week columns spanning
 *  from the first day with data (or today, if empty) through the end of the
 *  current week - i.e. it can run past "today" into a partial trailing week,
 *  which is exactly the case the design calls out for rendering those cells
 *  as dashed/not-yet-happened rather than a fabricated level-0 day. */
export function buildActivityWeeks(days: ActivityDay[], todayISO: string): ActivityWeek[] {
  const byDate = new Map(days.map((d) => [d.date, d.runs] as const));
  const maxRuns = Math.max(0, ...days.filter((d) => d.date <= todayISO).map((d) => d.runs));

  const firstDataDate = days.length ? days.map((d) => d.date).sort()[0] : todayISO;
  const startMonday = mondayOf(firstDataDate < todayISO ? firstDataDate : todayISO);
  const endMonday = mondayOf(todayISO);

  const weeks: ActivityWeek[] = [];
  let lastMonthKey = "";
  for (let wm = startMonday; parseISODate(wm) <= parseISODate(endMonday); wm = toISODate(parseISODate(wm) + 7 * DAY_MS)) {
    const cells: ActivityCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = toISODate(parseISODate(wm) + i * DAY_MS);
      const future = date > todayISO;
      const runs = byDate.get(date) ?? 0;
      cells.push({ date, runs, level: future ? 0 : activityLevel(runs, maxRuns), future });
    }
    const monthKey = cells[0].date.slice(0, 7); // "YYYY-MM"
    const monthLabel = monthKey !== lastMonthKey ? MONTH_ABBR[Number(monthKey.slice(5, 7)) - 1] : null;
    lastMonthKey = monthKey;
    weeks.push({ cells, monthLabel });
  }
  return weeks;
}

/** Relative age from a unix-seconds timestamp, matching the "Xh ago" shape
 *  used elsewhere in the app (components/experiments/experiment-table.tsx's
 *  `ago()`), adapted for a unix-seconds source instead of an ISO string. */
export function formatAge(unixSeconds: number, nowMs: number = Date.now()): string {
  const s = nowMs / 1000 - unixSeconds;
  if (!Number.isFinite(s) || s < 0) return "just now";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** The campaign-timeline's per-round delta: how much a closed round's best
 *  measured value moved over the PREVIOUS closed round's. Null whenever
 *  either side is unmeasured - never a fabricated 0. */
export function deltaBetween(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

/** Signed, fixed-precision delta string ("+1.6", "-0.4"). */
export function formatDelta(delta: number, digits = 1): string {
  if (delta > 0) return `+${delta.toFixed(digits)}`;
  if (delta < 0) return delta.toFixed(digits);
  return `±${Math.abs(delta).toFixed(digits)}`;
}

/** The campaign timeline's per-column date line ("12 May"). Parsed as UTC for
 *  the same reason as everything else in this module: a round that read out on
 *  the 12th should not render as the 11th for a viewer west of Greenwich. */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${d} ${MONTH_ABBR[m - 1]}`;
}

/** How many more rounds it would take to reach `goal`, extrapolating the mean
 *  per-round gain this campaign has actually shown. Null whenever there is no
 *  goal, no measured best, or no positive gain to extrapolate from - the
 *  timeline's target column then says nothing rather than inventing an ETA.
 *  Assumes gains keep arriving at their historical average, which is optimistic
 *  for a campaign already near its ceiling; the copy hedges it with "at this
 *  rate" for exactly that reason. */
export function roundsToTarget(best: number | null, goal: number | null, gains: number[]): number | null {
  if (best == null || goal == null) return null;
  const positive = gains.filter((g) => g > 0);
  if (positive.length === 0) return null;
  const remaining = goal - best;
  if (remaining <= 0) return null;
  const mean = positive.reduce((a, b) => a + b, 0) / positive.length;
  return Math.ceil(remaining / mean);
}
