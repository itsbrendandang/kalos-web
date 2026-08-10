import type { Driver } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Signed horizontal tornado for `drivers[]` (see lib/api.ts). Bars grow from
 * a shared center axis at 0, and a thin whisker under each bar spans the
 * driver's 95% CI so the scientist can see whether that range crosses zero.
 *
 * Color encodes SIGNIFICANCE, not direction: `dr.significant` is true only
 * when the CI excludes zero AND the driver survives Benjamini-Hochberg FDR
 * correction across every feature tested (see lib/api.ts) - that driver gets
 * the --chart-1 emphasis. Anything that fails either test gets the neutral
 * --explore gray and a "not significant" tag, regardless of which way its
 * point estimate leans. Direction (higher/lower target) is still readable
 * from which side of the zero axis the bar and whisker sit on - it is an
 * association, not a claim of causation.
 *
 * The axis scale is derived from the data (max of every rho and CI bound,
 * padded 15%), not hardcoded, so it stays correct for any dataset the engine
 * returns.
 */
export function DriversTornado({ drivers, target }: { drivers: Driver[]; target: string }) {
  if (drivers.length === 0) {
    return <p className="py-10 text-center text-[12px] text-muted">no drivers</p>;
  }

  const maxAbs = Math.max(
    ...drivers.flatMap((dr) => [Math.abs(dr.rho), Math.abs(dr.ci95[0]), Math.abs(dr.ci95[1])]),
  );
  const scale = maxAbs > 0 ? maxAbs * 1.15 : 1;
  /** Position, as a percentage from the track's left edge, for a signed value on the shared axis. */
  const toPct = (v: number) => Math.min(100, Math.max(0, 50 + (v / scale) * 50));

  return (
    <div className="flex flex-col rounded-[10px] border border-border bg-bg p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] text-muted">
          Signed correlation with {target}
        </span>
        <div className="flex flex-wrap items-center gap-3 text-[11px] whitespace-nowrap text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-chart-1" />
            Significant (CI excludes zero, survives FDR correction)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-explore" />
            Not significant
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-px w-3 bg-muted-foreground" />
            95% CI
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {drivers.map((dr) => {
          const barPct = (Math.abs(dr.rho) / scale) * 50;
          const positive = dr.rho >= 0;
          const ciLeft = toPct(dr.ci95[0]);
          const ciRight = toPct(dr.ci95[1]);
          return (
            <div key={dr.name} className="grid h-14 grid-cols-[128px_1fr] items-center gap-3">
              <div className="truncate pr-1 text-right text-[12px] text-fg" title={dr.name}>
                {dr.name}
              </div>
              <div className="relative h-9">
                <div className="absolute inset-y-0 left-1/2 w-px bg-border" />

                {/* point-estimate bar */}
                <div
                  className={cn(
                    "absolute top-[9px] h-2.5 -translate-y-1/2",
                    positive
                      ? cn("left-1/2 rounded-r-[4px]", dr.significant ? "bg-chart-1" : "bg-explore")
                      : cn("right-1/2 rounded-l-[4px]", dr.significant ? "bg-chart-1" : "bg-explore"),
                  )}
                  style={{ width: `${barPct}%` }}
                />
                <div
                  className={cn(
                    "tabular absolute top-[9px] -translate-y-1/2 font-mono text-[11px] whitespace-nowrap",
                    dr.significant ? "text-chart-1-ink" : "text-explore-deep",
                  )}
                  style={positive ? { left: `calc(50% + ${barPct}% + 6px)` } : { right: `calc(50% + ${barPct}% + 6px)` }}
                >
                  {positive ? "+" : ""}
                  {dr.rho.toFixed(2)}
                  {!dr.significant ? (
                    <span className="ml-1.5 rounded border border-border bg-card px-1 py-px text-[9.5px] font-sans font-semibold text-muted uppercase">
                      not significant
                    </span>
                  ) : null}
                </div>

                {/* 95% CI whisker */}
                <div
                  className="absolute top-[30px] h-px -translate-y-1/2 bg-muted-foreground/60"
                  style={{ left: `${ciLeft}%`, width: `${Math.max(0, ciRight - ciLeft)}%` }}
                />
                <div
                  className="absolute top-[30px] h-2 w-px -translate-y-1/2 bg-muted-foreground/60"
                  style={{ left: `${ciLeft}%` }}
                />
                <div
                  className="absolute top-[30px] h-2 w-px -translate-y-1/2 bg-muted-foreground/60"
                  style={{ left: `${ciRight}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1 grid grid-cols-[128px_1fr] gap-3">
        <span />
        <div className="relative text-[10px] text-muted">
          <span className="absolute left-0">-{scale.toFixed(2)}</span>
          <span className="absolute left-1/2 -translate-x-1/2">0</span>
          <span className="absolute right-0">+{scale.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
