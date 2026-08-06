// Pure logic the activity strip needs on top of lib/workspace/log-logic.ts's
// bucketing. Kept in its own module (rather than appended to log-logic.ts)
// because that file is Part 1's and is imported by blocks this one has no
// business touching; everything here is specific to how the STRIP crops and
// labels the series log-logic already produced.
import type { ActivityWeek } from "./log-logic";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The design's grid is 12 week columns wide. A campaign older than that is
 *  cropped to its most recent 12 weeks rather than squeezed - see
 *  `recentWeeks` for why the header sentence still counts the whole run. */
export const ACTIVITY_WEEKS = 12;

export type ActivityWindow = {
  weeks: ActivityWeek[];
  /** Weeks dropped off the left edge. The strip says so out loud instead of
   *  letting a reader assume the grid is the whole campaign. */
  hiddenWeeks: number;
};

/** Crops the week series to the most recent `count` columns and re-derives
 *  the month labels over the VISIBLE window. Re-deriving matters:
 *  buildActivityWeeks only labels a week when its month differs from the
 *  previous week's, so a naive slice can start on an unlabelled column and
 *  leave the first month of the grid anonymous. */
export function recentWeeks(weeks: ActivityWeek[], count: number = ACTIVITY_WEEKS): ActivityWindow {
  const visible = weeks.slice(-count);
  let lastMonthKey = "";
  const relabelled = visible.map((week) => {
    const monthKey = week.cells[0].date.slice(0, 7); // "YYYY-MM"
    const monthLabel = monthKey !== lastMonthKey ? MONTH_ABBR[Number(monthKey.slice(5, 7)) - 1] : null;
    lastMonthKey = monthKey;
    return { ...week, monthLabel };
  });
  return { weeks: relabelled, hiddenWeeks: Math.max(0, weeks.length - visible.length) };
}

/** The five ramp steps, quiet to busy, as the legend renders them. Indexes
 *  line up with `activityLevel`'s return value by construction. */
export const ACTIVITY_LEVELS = [0, 1, 2, 3, 4] as const;

/** Tailwind fill class per level - one lookup so the grid cell and the legend
 *  swatch can never drift onto two different ramps. */
export const ACTIVITY_FILL: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-activity-0",
  1: "bg-activity-1",
  2: "bg-activity-2",
  3: "bg-activity-3",
  4: "bg-activity-4",
};
