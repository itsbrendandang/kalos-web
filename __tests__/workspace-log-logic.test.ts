import { describe, expect, it } from "vitest";
import {
  activityLevel,
  buildActivityWeeks,
  computeActivityStats,
  deltaBetween,
  formatAge,
  formatDelta,
  formatShortDate,
  roundsToTarget,
} from "@/lib/workspace/log-logic";

describe("activityLevel", () => {
  it("buckets zero runs (or a zero-max series) into level 0", () => {
    expect(activityLevel(0, 4)).toBe(0);
    expect(activityLevel(3, 0)).toBe(0);
  });

  it("buckets relative to the series max, not an absolute scale", () => {
    expect(activityLevel(1, 4)).toBe(1); // 0.25
    expect(activityLevel(2, 4)).toBe(2); // 0.50
    expect(activityLevel(3, 4)).toBe(3); // 0.75
    expect(activityLevel(4, 4)).toBe(4); // 1.00
  });

  it("a campaign that never exceeds 1 run/day still shows its busiest day as full", () => {
    expect(activityLevel(1, 1)).toBe(4);
  });
});

describe("computeActivityStats", () => {
  it("is all-zero for an empty series", () => {
    expect(computeActivityStats([], "2026-08-05")).toEqual({ daysRunning: 0, daysWithRuns: 0, longestPauseDays: 0 });
  });

  it("counts days running as the span from the first day to today, inclusive", () => {
    const days = [
      { date: "2026-08-01", runs: 1 },
      { date: "2026-08-03", runs: 2 },
    ];
    const stats = computeActivityStats(days, "2026-08-05");
    expect(stats.daysRunning).toBe(5); // Aug 1..5 inclusive
    expect(stats.daysWithRuns).toBe(2);
  });

  it("ignores days after 'today' (a partial trailing week) when computing stats", () => {
    const days = [
      { date: "2026-08-01", runs: 1 },
      { date: "2026-08-10", runs: 5 }, // future relative to todayISO below
    ];
    const stats = computeActivityStats(days, "2026-08-05");
    expect(stats.daysRunning).toBe(5);
    expect(stats.daysWithRuns).toBe(1);
  });

  it("the longest pause is the largest gap strictly BETWEEN two run-days, not before the first or after the last", () => {
    const days = [
      { date: "2026-05-12", runs: 3 },
      { date: "2026-05-13", runs: 2 },
      // 18-day gap
      { date: "2026-06-01", runs: 1 },
      { date: "2026-06-02", runs: 1 },
      // 3-day gap
      { date: "2026-06-06", runs: 1 },
    ];
    const stats = computeActivityStats(days, "2026-06-06");
    expect(stats.longestPauseDays).toBe(18);
  });

  it("a single run-day has no pause to measure", () => {
    const days = [{ date: "2026-08-01", runs: 4 }];
    expect(computeActivityStats(days, "2026-08-05").longestPauseDays).toBe(0);
  });
});

describe("buildActivityWeeks", () => {
  it("starts each week on Monday and spans through the week containing today", () => {
    // 2026-05-12 is a Tuesday; today is Wednesday 2026-05-13.
    const weeks = buildActivityWeeks([{ date: "2026-05-12", runs: 2 }], "2026-05-13");
    expect(weeks).toHaveLength(1);
    expect(weeks[0].cells).toHaveLength(7);
    expect(weeks[0].cells[0].date).toBe("2026-05-11"); // the Monday
    expect(weeks[0].cells[1].date).toBe("2026-05-12");
    expect(weeks[0].cells[1].runs).toBe(2);
  });

  it("marks days after today as future, not a fabricated level-0 day", () => {
    const weeks = buildActivityWeeks([{ date: "2026-05-12", runs: 2 }], "2026-05-13");
    const wednesday = weeks[0].cells[2]; // 2026-05-13, today
    const thursday = weeks[0].cells[3]; // 2026-05-14, after today
    expect(wednesday.future).toBe(false);
    expect(thursday.future).toBe(true);
    expect(thursday.level).toBe(0);
  });

  it("labels only the first week of each month it spans", () => {
    const days = [
      { date: "2026-05-12", runs: 1 },
      { date: "2026-06-15", runs: 1 },
    ];
    const weeks = buildActivityWeeks(days, "2026-06-20");
    const labels = weeks.map((w) => w.monthLabel).filter((m): m is string => m != null);
    expect(labels).toEqual(["May", "Jun"]);
  });

  it("an empty series still renders the current week", () => {
    const weeks = buildActivityWeeks([], "2026-08-05");
    expect(weeks.length).toBeGreaterThanOrEqual(1);
    expect(weeks[weeks.length - 1].cells.some((c) => c.date === "2026-08-05")).toBe(true);
  });
});

describe("formatAge", () => {
  const now = Date.UTC(2026, 7, 5, 12, 0, 0);

  it("renders sub-minute ages as 'just now'", () => {
    expect(formatAge(now / 1000 - 10, now)).toBe("just now");
  });

  it("renders minutes, hours, and days at the right granularity", () => {
    expect(formatAge(now / 1000 - 5 * 60, now)).toBe("5m ago");
    expect(formatAge(now / 1000 - 3 * 3600, now)).toBe("3h ago");
    expect(formatAge(now / 1000 - 2 * 86400, now)).toBe("2d ago");
  });
});

describe("deltaBetween / formatDelta", () => {
  it("is null whenever either side is unmeasured", () => {
    expect(deltaBetween(6.4, null)).toBeNull();
    expect(deltaBetween(null, 5.7)).toBeNull();
  });

  it("computes a signed difference", () => {
    expect(deltaBetween(6.4, 5.7)).toBeCloseTo(0.7);
  });

  it("formats with an explicit sign", () => {
    expect(formatDelta(1.6)).toBe("+1.6");
    expect(formatDelta(-0.4)).toBe("-0.4");
    expect(formatDelta(0)).toBe("±0.0");
  });
});

describe("formatShortDate", () => {
  it("renders the timeline's day-and-month line", () => {
    expect(formatShortDate("2026-05-12")).toBe("12 May");
    expect(formatShortDate("2026-07-21")).toBe("21 Jul");
  });

  it("does not shift the day for viewers behind UTC", () => {
    // The whole point of parsing the parts by hand rather than via Date: a
    // round that read out on the 1st must never render as the 30th.
    expect(formatShortDate("2026-06-01")).toBe("1 Jun");
  });

  it("passes an unparseable string straight through rather than inventing a date", () => {
    expect(formatShortDate("not-a-date")).toBe("not-a-date");
    expect(formatShortDate("2026-13-01")).toBe("2026-13-01");
  });
});

describe("roundsToTarget", () => {
  it("is null without a goal, without a best, or without a positive gain", () => {
    expect(roundsToTarget(6.4, null, [1.6, 0.7])).toBeNull();
    expect(roundsToTarget(null, 8, [1.6, 0.7])).toBeNull();
    expect(roundsToTarget(6.4, 8, [])).toBeNull();
    expect(roundsToTarget(6.4, 8, [-0.3, 0])).toBeNull();
  });

  it("is null once the target is already met - there is nothing left to project", () => {
    expect(roundsToTarget(8, 8, [1.6, 0.7])).toBeNull();
    expect(roundsToTarget(8.4, 8, [1.6, 0.7])).toBeNull();
  });

  it("extrapolates the mean positive gain and rounds up to a whole round", () => {
    // remaining 1.6, mean gain (1.6 + 0.7) / 2 = 1.15 -> 1.39 rounds -> 2.
    expect(roundsToTarget(6.4, 8, [1.6, 0.7])).toBe(2);
    expect(roundsToTarget(6, 8, [2])).toBe(1);
  });

  it("ignores rounds that went backwards rather than letting them drag the rate down", () => {
    expect(roundsToTarget(6.4, 8, [1.6, -0.5, 0.7])).toBe(2);
  });
});
