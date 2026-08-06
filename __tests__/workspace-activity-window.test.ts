import { describe, expect, it } from "vitest";
import { activityLevel, buildActivityWeeks, computeActivityStats, daysSinceLastRun } from "@/lib/workspace/log-logic";
import { ACTIVITY_FILL, ACTIVITY_LEVELS, ACTIVITY_WEEKS, recentWeeks } from "@/lib/workspace/activity-logic";
import type { ActivityDay } from "@/lib/workspace/log-types";

const DAY_MS = 86_400_000;

/** A dense series of `count` consecutive days from `startISO`, `runs` per day. */
function series(startISO: string, count: number, runs: (i: number) => number): ActivityDay[] {
  const [y, m, d] = startISO.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(start + i * DAY_MS).toISOString().slice(0, 10),
    runs: runs(i),
  }));
}

describe("recentWeeks", () => {
  it("crops to the most recent 12 week columns and reports what it dropped", () => {
    // 26 weeks of data ending on a Sunday, so buildActivityWeeks yields 26
    // whole Monday-start columns.
    const days = series("2026-02-02", 26 * 7, () => 1); // 2026-02-02 is a Monday
    const weeks = buildActivityWeeks(days, "2026-08-02"); // the final Sunday
    expect(weeks).toHaveLength(26);

    const window = recentWeeks(weeks);
    expect(window.weeks).toHaveLength(ACTIVITY_WEEKS);
    expect(window.hiddenWeeks).toBe(14);
    // The cropped window ends on the same week the full series ended on.
    expect(window.weeks[ACTIVITY_WEEKS - 1].cells[0].date).toBe(weeks[25].cells[0].date);
  });

  it("does not crop, and hides nothing, when the campaign is younger than the window", () => {
    const days = series("2026-06-01", 21, () => 1); // 3 weeks from a Monday
    const window = recentWeeks(buildActivityWeeks(days, "2026-06-21"));
    expect(window.weeks).toHaveLength(3);
    expect(window.hiddenWeeks).toBe(0);
  });

  it("re-derives month labels over the VISIBLE window so the first column is never anonymous", () => {
    const days = series("2026-02-02", 26 * 7, () => 1);
    const weeks = buildActivityWeeks(days, "2026-08-02");
    const window = recentWeeks(weeks);

    // The 15th week of the full series falls mid-month, so buildActivityWeeks
    // left it unlabelled - but it is the first column of the cropped window.
    expect(weeks[14].monthLabel).toBeNull();
    expect(window.weeks[0].monthLabel).not.toBeNull();
  });

  it("labels a month exactly once inside the window", () => {
    const days = series("2026-02-02", 26 * 7, () => 1);
    const window = recentWeeks(buildActivityWeeks(days, "2026-08-02"));
    const labels = window.weeks.map((w) => w.monthLabel).filter((l): l is string => l != null);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("activity ramp wiring", () => {
  it("has exactly one fill class per level activityLevel can return", () => {
    expect(ACTIVITY_LEVELS).toHaveLength(5);
    for (const level of ACTIVITY_LEVELS) {
      expect(ACTIVITY_FILL[level]).toBe(`bg-activity-${level}`);
    }
    // Every value activityLevel produces has a fill - no unmapped bucket.
    for (const runs of [0, 1, 2, 3, 4, 9, 40]) {
      expect(ACTIVITY_FILL[activityLevel(runs, 40)]).toBeDefined();
    }
  });
});

describe("the strip's numbers, on the real engine payload's shape", () => {
  // The stub engine serves an 86-day series with an 18-day pause between the
  // round-2 and round-3 clusters. These assertions pin the three numbers the
  // strip's header sentence renders.
  const days: ActivityDay[] = [
    ...series("2026-05-12", 6, () => 3),
    ...series("2026-05-18", 15, () => 0),
    ...series("2026-06-02", 5, () => 2),
    ...series("2026-06-07", 18, () => 0), // the long pause
    ...series("2026-06-25", 4, () => 1),
  ];
  const todayISO = "2026-06-28";

  it("counts days running from the first logged day through today, inclusive", () => {
    expect(computeActivityStats(days, todayISO).daysRunning).toBe(48);
  });

  it("counts only days that actually measured a run", () => {
    expect(computeActivityStats(days, todayISO).daysWithRuns).toBe(15);
  });

  it("derives the longest pause as the largest gap strictly between two run-days", () => {
    expect(computeActivityStats(days, todayISO).longestPauseDays).toBe(18);
  });

  it("reads the last-measured readout off the same series", () => {
    expect(daysSinceLastRun(days, todayISO)).toBe(0);
    expect(daysSinceLastRun(days, "2026-07-05")).toBe(7);
  });

  it("buckets the busiest and quietest days to the ends of the ramp", () => {
    const weeks = buildActivityWeeks(days, todayISO);
    const cells = weeks.flatMap((w) => w.cells).filter((c) => !c.future);
    const busiest = cells.filter((c) => c.runs === 3);
    const quiet = cells.filter((c) => c.runs === 0);
    expect(busiest.every((c) => c.level === 4)).toBe(true);
    expect(quiet.every((c) => c.level === 0)).toBe(true);
  });

  it("marks days after today as future rather than as quiet level-0 days", () => {
    // Mid-week "today", so the trailing week column is partial.
    const midWeek = "2026-06-26";
    const weeks = buildActivityWeeks(days, midWeek);
    const future = weeks.flatMap((w) => w.cells).filter((c) => c.date > midWeek);
    expect(future).toHaveLength(2); // 27 and 28 June
    expect(future.every((c) => c.future)).toBe(true);
    // Those two days DO carry runs in the series; being future still wins, so
    // the strip renders them as not-yet-happened rather than as measured.
    expect(future.every((c) => c.runs > 0 && c.level === 0)).toBe(true);
  });
});
