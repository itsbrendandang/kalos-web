import { cn, num } from "@/lib/utils";
import { driverFindings, rankedDrivers, rankedEffects, type DriverBar, type EffectBar } from "@/lib/workspace/driver-logic";
import type { WorkspaceLogStats } from "@/lib/workspace/log-types";
import { NotInstrumentedNote } from "@/components/workspace/primitives/not-instrumented-note";
import { DOT, SectionLabel } from "./primitives";

/** Rows shown per panel. Both panels list the same inputs, so one cap keeps
 *  them the same height and keeps a reader from comparing a full list against
 *  a truncated one. */
const MAX_ROWS = 8;

/** Rank correlation is bounded at +/-1, so the axis is fixed rather than
 *  fitted to the data: a campaign whose strongest driver is 0.2 should LOOK
 *  weak, not get rescaled until it looks strong. */
const RHO_DOMAIN = 1;

/** Fraction of the track a value sits at, 0 at rho = -1 and 1 at rho = +1. */
function rhoPosition(v: number): number {
  const clamped = Math.max(-RHO_DOMAIN, Math.min(RHO_DOMAIN, v));
  return (clamped + RHO_DOMAIN) / (2 * RHO_DOMAIN);
}

/**
 * Design spec 1.3.G, "What round N taught".
 *
 * The handoff ships no chart here - only a dashed box reading "signed driver
 * chart / 11 inputs, CI bars" (gap list item 4), so the chart below is an
 * original design. Its governing constraint is that the engine reports two
 * different things about inputs and they must not be blended:
 *
 *   Left panel  - `drivers`: signed Spearman rho with a bootstrap 95%
 *                 interval. A statistic OF THE DATA. Diverging bars around a
 *                 zero axis, sign carried by direction and color, the
 *                 interval drawn on top of every bar, fixed +/-1 axis.
 *   Right panel - `gp_main_effects`: ARD importance read off the fitted
 *                 surrogate. A property OF A MODEL. One-sided bars from a
 *                 left baseline, no zero axis, no interval, one neutral
 *                 color, values normalised to the strongest input.
 *
 * The two grammars are deliberately incompatible on sight: a one-sided
 * neutral bar cannot be misread as a signed correlation, and vice versa.
 * Neither panel is sorted into the other's order, and nothing anywhere
 * averages them into a single "importance" number.
 *
 * Flat fills, no gradients, no shadows. The signed panel's colors come from
 * the app's data-viz tokens (--chart-1 / --explore, the same pair
 * components/charts.tsx already uses for a signed driver bar). The model
 * panel uses a third, unrelated neutral (--explore-deep) so it can never be
 * read as either sign, and so the model estimate does not out-shout the raw
 * statistic it sits beside.
 */
export function DriverChart({
  stats,
  roundNumber,
}: {
  stats: WorkspaceLogStats;
  /** The most recent round that has read out - what the fit last learned
   *  from. Null when no round has closed yet. */
  roundNumber: number | null;
}) {
  const drivers = rankedDrivers(stats.drivers, MAX_ROWS);
  const findings = driverFindings(stats.drivers, stats.gpMainEffects);
  const gp = stats.gpMainEffects;

  const provenance: string[] = [];
  if (stats.runsMeasured != null) provenance.push(`fitted on ${stats.runsMeasured} runs`);
  if (stats.runsInputs != null) provenance.push(`${stats.runsInputs} inputs`);
  if (stats.drivers.length > MAX_ROWS) provenance.push(`strongest ${MAX_ROWS} shown`);

  return (
    <section className="rounded-[16px] bg-card p-7">
      <h3 className="font-serif text-[20px] font-semibold tracking-[-0.01em] text-fg">
        {roundNumber != null ? `What round ${roundNumber} taught` : "What the runs so far taught"}
      </h3>
      {provenance.length > 0 && <p className="mt-1.5 text-[12px] text-muted">{provenance.join(DOT)}</p>}

      {findings.length === 0 ? (
        <NotInstrumentedNote className="mt-[22px]">
          The latest analysis reports no per-input correlations, so there is nothing to say about which inputs moved
          the target.
        </NotInstrumentedNote>
      ) : (
        <ul className="mt-[22px] flex max-w-[62ch] flex-col gap-5">
          {findings.map((f) => (
            <li key={f.headline}>
              <p className="font-serif text-[15.5px] leading-[1.35] font-semibold text-pretty text-fg">{f.headline}</p>
              <p className="mt-[3px] font-serif text-[14px] leading-[1.55] text-pretty text-muted">{f.support}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-7 grid gap-7 border-t border-border pt-6 md:grid-cols-2">
        <Panel
          label="Measured in the data"
          note="Spearman rank correlation between one input and the target, computed from the runs themselves. No model is involved."
        >
          {drivers.length === 0 ? (
            <NotInstrumentedNote>No correlations reported on this fit.</NotInstrumentedNote>
          ) : (
            <>
              <div className="flex flex-col gap-[7px]">
                {drivers.map((d) => (
                  <RhoRow key={d.name} bar={d} />
                ))}
              </div>
              <RhoAxis />
              <p className="mt-3 text-[11px] leading-[1.5] text-muted">
                Bar is the correlation, line is its 95% interval. Solid means the interval excludes zero; hollow means
                it crosses zero, so the sign is not established.
              </p>
            </>
          )}
        </Panel>

        <Panel
          label="Estimated by the model"
          note="Relative importance from the fitted surrogate's own lengthscales. A model estimate, unsigned and unitless, comparable only against the other inputs in this list."
        >
          {gp == null ? (
            <NotInstrumentedNote>
              This analysis predates per-input model estimates, so the engine returned none.
            </NotInstrumentedNote>
          ) : !gp.available ? (
            <NotInstrumentedNote>{gp.reason}</NotInstrumentedNote>
          ) : (
            <>
              <div className="flex flex-col gap-[7px]">
                {rankedEffects(gp.effects, MAX_ROWS).map((e) => (
                  <EffectRow key={e.name} bar={e} />
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-[1.5] text-muted">
                Scaled so the strongest input reads 1.00. These numbers carry no direction: a high value means the
                model&rsquo;s prediction is sensitive to that input, not that raising it raises the target.
              </p>
            </>
          )}
        </Panel>
      </div>

      <p className="mt-6 border-t border-border pt-4 text-[11.5px] leading-[1.5] text-muted">
        The two panels measure different things, so they are never merged into one ranking and never averaged. The left
        panel is a statistic about the runs; the right panel is a property of the model fitted to them.
      </p>
    </section>
  );
}

function Panel({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <SectionLabel>{label}</SectionLabel>
      <p className="mt-1.5 mb-3.5 text-[11.5px] leading-[1.45] text-muted">{note}</p>
      {children}
    </div>
  );
}

function RhoRow({ bar }: { bar: DriverBar }) {
  const zero = rhoPosition(0);
  const value = rhoPosition(bar.rho);
  const left = Math.min(zero, value);
  const width = Math.abs(value - zero);
  const ciLeft = rhoPosition(bar.ciLow);
  const ciWidth = rhoPosition(bar.ciHigh) - ciLeft;
  const positive = bar.rho >= 0;

  return (
    <div className="flex items-center gap-2">
      <span
        className="w-[104px] shrink-0 truncate text-right font-plex-mono text-[10.5px] text-muted"
        title={bar.name}
      >
        {bar.name}
      </span>
      <div className="relative h-4 min-w-0 flex-1">
        <span className="absolute inset-y-0 w-px bg-border" style={{ left: `${zero * 100}%` }} aria-hidden />
        <span
          className={cn(
            "absolute top-1 h-2 rounded-[2px]",
            bar.significant
              ? positive
                ? "bg-chart-1"
                : "bg-explore"
              : positive
                ? "border border-chart-1"
                : "border border-explore",
          )}
          style={{ left: `${left * 100}%`, width: `${Math.max(width * 100, 0.4)}%` }}
          aria-hidden
        />
        <span
          className="absolute top-1/2 h-px bg-fg"
          style={{ left: `${ciLeft * 100}%`, width: `${ciWidth * 100}%` }}
          aria-hidden
        />
        <span className="absolute top-[3px] h-[10px] w-px bg-fg" style={{ left: `${ciLeft * 100}%` }} aria-hidden />
        <span
          className="absolute top-[3px] h-[10px] w-px bg-fg"
          style={{ left: `calc(${(ciLeft + ciWidth) * 100}% - 1px)` }}
          aria-hidden
        />
      </div>
      <span className="w-[46px] shrink-0 text-right font-plex-mono text-[10.5px] tabular-nums text-fg">
        {bar.rho > 0 ? `+${num(bar.rho, 2)}` : num(bar.rho, 2)}
      </span>
    </div>
  );
}

function RhoAxis() {
  return (
    <div className="mt-1.5 flex items-center gap-2 font-plex-mono text-[9px] text-muted">
      <span className="w-[104px] shrink-0" aria-hidden />
      <div className="relative h-3 min-w-0 flex-1">
        <span className="absolute left-0">-1</span>
        <span className="absolute left-1/2 -translate-x-1/2">0</span>
        <span className="absolute right-0">+1</span>
      </div>
      <span className="w-[46px] shrink-0" aria-hidden />
    </div>
  );
}

function EffectRow({ bar }: { bar: EffectBar }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-[104px] shrink-0 truncate text-right font-plex-mono text-[10.5px] text-muted"
        title={bar.name}
      >
        {bar.name}
      </span>
      <div className="relative h-4 min-w-0 flex-1">
        <span className="absolute inset-y-0 left-0 w-px bg-border" aria-hidden />
        <span
          className="absolute top-1 left-0 h-2 rounded-[2px] bg-explore-deep"
          style={{ width: `${Math.max(bar.relative * 100, 0.4)}%` }}
          aria-hidden
        />
      </div>
      <span className="w-[46px] shrink-0 text-right font-plex-mono text-[10.5px] tabular-nums text-fg">
        {num(bar.relative, 2)}
      </span>
    </div>
  );
}
