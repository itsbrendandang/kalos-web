import { cn } from "@/lib/utils";
import { buildActivityWeeks, daysSinceLastRun } from "@/lib/workspace/log-logic";
import { ACTIVITY_FILL, ACTIVITY_LEVELS, recentWeeks } from "@/lib/workspace/activity-logic";
import type { ActivityDay, ActivityStats } from "@/lib/workspace/log-types";
import { NotInstrumentedNote } from "@/components/workspace/primitives/not-instrumented-note";
import { DOT, InlineNumeral, SectionLabel } from "./primitives";

/** The seven weekday slots. Only Mon/Wed/Fri are labelled; the four blanks
 *  are real spans, not skipped rows, so the column keeps a constant 19px
 *  pitch (15px slot + 4px gap) that lines up with the grid beside it. */
const WEEKDAYS = ["M", "", "W", "", "F", "", ""];

/** Design spec 1.3.D. A 12-week x 7-day strip of MEASURED RUNS PER DAY.
 *
 *  Not wells: the design's own copy says "days with wells on the deck", but
 *  kalos has no well, plate, or deck-capacity concept anywhere in its data
 *  model (same gap the stat strip's fourth cell hits). `GET
 *  /api/campaign/activity` counts runs whose result was logged that day, so
 *  that is what the cells, the header sentence, and the legend all say. */
export function ActivityStrip({
  days,
  stats,
  note,
  todayISO,
}: {
  days: ActivityDay[];
  stats: ActivityStats | null;
  /** The engine's own coverage caveat. Rendered verbatim - it is the reason
   *  the series is not full coverage, and hiding it would make a partial
   *  history look complete. */
  note: string | null;
  todayISO: string;
}) {
  const window = recentWeeks(buildActivityWeeks(days, todayISO));
  const sinceLastRun = daysSinceLastRun(days, todayISO);
  const hasAnyRun = days.some((d) => d.runs > 0 && d.date <= todayISO);

  return (
    <section className="mt-7 border-t border-border pt-[22px]">
      <div className="mb-4 flex flex-wrap items-baseline gap-2.5">
        <SectionLabel>Activity</SectionLabel>
        {stats != null ? (
          <span className="text-[12px] text-muted">
            running <InlineNumeral>{stats.daysRunning}</InlineNumeral> days{DOT}
            <InlineNumeral>{stats.daysWithRuns}</InlineNumeral> days with runs measured
            {stats.longestPauseDays > 0 && (
              <>
                {DOT}longest pause <InlineNumeral>{stats.longestPauseDays}</InlineNumeral> days
              </>
            )}
          </span>
        ) : (
          <span className="text-[12px] text-muted">no run has been measured through the campaign loop yet</span>
        )}
      </div>

      <div className="flex items-start gap-[14px]">
        {/* Weekday gutter. Fixed 12px wide with a 15px line-height per slot so
            its rhythm is the grid's rhythm, not the font's. */}
        <div className="flex flex-none flex-col gap-1 font-plex-mono text-[9.5px] text-muted" aria-hidden>
          {WEEKDAYS.map((label, i) => (
            <span key={i} className="h-[15px] w-[12px] leading-[15px]">
              {label}
            </span>
          ))}
        </div>

        {/* Grid and month row are siblings in one column so they share the
            same flex geometry - the month spans below are laid out at the
            exact week pitch the cells above them use. */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex gap-1">
            {window.weeks.map((week) => (
              <div key={week.cells[0].date} className="flex flex-col gap-1">
                {week.cells.map((cell) =>
                  cell.future ? (
                    <span
                      key={cell.date}
                      className="size-[15px] rounded-[3px] bg-card outline outline-1 -outline-offset-1 outline-dashed outline-activity-future"
                      title={`${cell.date} · not yet`}
                    />
                  ) : (
                    <span
                      key={cell.date}
                      className={cn("size-[15px] rounded-[3px]", ACTIVITY_FILL[cell.level])}
                      title={`${cell.date} · ${cell.runs} run${cell.runs === 1 ? "" : "s"} measured`}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-1 font-plex-mono text-[10px] text-muted" aria-hidden>
            {window.weeks.map((week) => (
              <span key={week.cells[0].date} className="w-[15px] shrink-0 whitespace-nowrap">
                {week.monthLabel}
              </span>
            ))}
          </div>
        </div>

        <div className="ml-auto flex flex-none flex-col items-end gap-2">
          <div className="flex items-center gap-[5px]">
            <span className="text-[11px] text-muted">quiet</span>
            {ACTIVITY_LEVELS.map((level) => (
              <span key={level} className={cn("size-[9px] rounded-[2px]", ACTIVITY_FILL[level])} />
            ))}
            <span className="text-[11px] text-muted">busy</span>
          </div>
          {sinceLastRun != null ? (
            <span className="text-[11.5px] text-muted">
              Last run measured{" "}
              <span className="text-fg tabular-nums">
                {sinceLastRun === 0 ? "today" : `${sinceLastRun} day${sinceLastRun === 1 ? "" : "s"} ago`}
              </span>
            </span>
          ) : (
            <span className="text-[11.5px] text-muted">Nothing measured through the loop yet</span>
          )}
        </div>
      </div>

      {window.hiddenWeeks > 0 && (
        <NotInstrumentedNote className="mt-3">
          The grid shows the most recent {window.weeks.length} weeks. {window.hiddenWeeks} earlier week
          {window.hiddenWeeks === 1 ? "" : "s"} of this campaign sit{window.hiddenWeeks === 1 ? "s" : ""} off the left
          edge; the sentence above still counts all of them.
        </NotInstrumentedNote>
      )}

      {note && (
        <p className="mt-3 max-w-[62ch] font-serif text-[14px] leading-[1.55] text-pretty text-muted">{note}</p>
      )}

      {!hasAnyRun && note == null && (
        <NotInstrumentedNote className="mt-3">
          Every cell here counts runs measured through the campaign loop. Rows folded in from an upload carry no
          per-row timestamp, so a campaign that has only ever been analysed from a file shows an empty grid.
        </NotInstrumentedNote>
      )}
    </section>
  );
}

/** The strip's own unavailable state. Section-local on purpose: one failed
 *  read should not take the plane around it down with it. */
export function ActivityStripMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-7 border-t border-border pt-[22px]">
      <SectionLabel>Activity</SectionLabel>
      <NotInstrumentedNote className="mt-2">{children}</NotInstrumentedNote>
    </section>
  );
}
