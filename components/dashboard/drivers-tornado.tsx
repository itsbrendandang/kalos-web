import { cn } from "@/lib/utils";

/**
 * Signed horizontal tornado for `drivers[]` (see lib/api.ts). Bars grow from
 * a shared center axis at 0: blue bars are associated with higher `target`,
 * gray ("explore" tone) bars with lower - a correlation, not a causal claim.
 * The axis scale is derived from the data (max |rho| * 1.15), not hardcoded,
 * so it stays correct for any dataset the engine returns.
 */
export function DriversTornado({
  drivers,
  target,
}: {
  drivers: { name: string; rho: number }[];
  target: string;
}) {
  if (drivers.length === 0) {
    return <p className="py-10 text-center text-[12px] text-muted">no drivers</p>;
  }

  const maxAbs = Math.max(...drivers.map((dr) => Math.abs(dr.rho)));
  const scale = maxAbs > 0 ? maxAbs * 1.15 : 1;

  return (
    <div className="flex h-full flex-col rounded-[10px] border border-border bg-bg p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] text-muted">
          Signed correlation with {target}
        </span>
        <div className="flex items-center gap-3 text-[11px] whitespace-nowrap text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-accent" />
            Higher {target}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-explore" />
            Lower {target}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-2">
        {drivers.map((dr) => {
          const pct = (Math.abs(dr.rho) / scale) * 50;
          const positive = dr.rho >= 0;
          return (
            <div key={dr.name} className="grid min-h-[20px] flex-1 grid-cols-[128px_1fr] items-center gap-3">
              <div className="truncate pr-1 text-[12px] text-fg" title={dr.name}>
                {dr.name}
              </div>
              <div className="relative h-5">
                <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                <div
                  className={cn(
                    "absolute top-1/2 h-2.5 -translate-y-1/2",
                    positive ? "left-1/2 rounded-r-[4px] bg-accent" : "right-1/2 rounded-l-[4px] bg-explore",
                  )}
                  style={{ width: `${pct}%` }}
                />
                <div
                  className={cn(
                    "tabular absolute top-1/2 -translate-y-1/2 font-mono text-[11px] whitespace-nowrap",
                    positive ? "text-accent-hover" : "text-explore-deep",
                  )}
                  style={positive ? { left: `calc(50% + ${pct}% + 6px)` } : { right: `calc(50% + ${pct}% + 6px)` }}
                >
                  {positive ? "+" : ""}
                  {dr.rho.toFixed(2)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-[128px_1fr] gap-3">
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
