import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/kit/disclosure";
import { formatNumber, formatRange } from "@/lib/format";
import type { DriverBar } from "@/lib/overview";
import { cn } from "@/lib/utils";

/**
 * What went with the target, as a ranked list, strongest first. Plain HTML so
 * names wrap instead of truncating. Each row: how strongly the input went with
 * the target as a bar from zero with its uncertainty as a whisker, a word for
 * it (solid bar and "Clear signal" vs outline bar and "Could be chance", never
 * colour alone), and what the sign means as an association in these runs, not
 * a cause. The numbers behind each row (the rank correlation and its 95%
 * interval) sit one click down.
 */
export function DriversList({ drivers, targetName }: { drivers: DriverBar[]; targetName: string }) {
  // The axis fits the data (the widest interval, padded), so small correlations stay readable; capped at the +-1 a correlation can reach.
  const scale = Math.min(1, Math.max(0.1, ...drivers.flatMap((d) => [Math.abs(d.lo), Math.abs(d.hi), Math.abs(d.rho)])) * 1.15);
  const pos = (v: number) => 50 + (Math.max(-scale, Math.min(scale, v)) / scale) * 50;
  return (
    <div>
      <ol className="divide-y divide-border">
        {drivers.map((d, i) => (
          <li key={d.name} className="grid gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="min-w-0">
              <p className="flex items-baseline gap-2 text-label text-fg">
                <span className="text-fg-muted tabular-nums">{i + 1}</span>
                <span className="min-w-0 break-words">{d.name}</span>
              </p>
              <p className="mt-0.5 pl-5 text-caption text-fg-muted">
                Higher {d.name} went with {d.rho >= 0 ? "higher" : "lower"} {targetName} in these runs.
              </p>
            </div>
            <div className="min-w-0">
              <div
                role="img"
                aria-label={`${d.name} went with ${targetName} ${formatNumber(d.rho, "corr", { sign: true })} on a scale from -1 to +1; ${d.significant ? "a clear signal" : "it could be chance"}`}
                className="relative h-5"
              >
                <div className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                <div
                  className={cn("absolute top-0.5 h-2.5 rounded-sm", d.significant ? "bg-accent" : "border-[1.5px] border-fg-muted")}
                  style={{ left: `${Math.min(pos(0), pos(d.rho))}%`, width: `${(Math.abs(d.rho) / scale) * 50}%` }}
                />
                <div className="absolute top-[15px] h-px bg-fg-muted" style={{ left: `${pos(d.lo)}%`, width: `${Math.max(0, pos(d.hi) - pos(d.lo))}%` }} />
                <div className="absolute top-[12px] h-[7px] w-px bg-fg-muted" style={{ left: `${pos(d.lo)}%` }} />
                <div className="absolute top-[12px] h-[7px] w-px bg-fg-muted" style={{ left: `${pos(d.hi)}%` }} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-muted">
                <span className="text-fg tabular-nums">{formatNumber(d.rho, "corr", { sign: true })}</span>
                <Badge tone={d.significant ? "accent" : "neutral"} variant={d.significant ? "soft" : "outline"}>
                  {d.significant ? "Clear signal" : "Could be chance"}
                </Badge>
                <Disclosure summary={<span className="text-caption text-fg-muted">The numbers</span>} className="w-full border-t-0 [&>summary]:py-1">
                  <p className="tabular-nums">
                    Rank correlation (Spearman) {formatNumber(d.rho, "corr")}, 95% interval {formatRange(d.lo, d.hi, "corr")}, {d.significant ? "significant" : "not significant"} after
                    correcting for testing many inputs at once.
                  </p>
                </Disclosure>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-1 grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <span className="hidden sm:block" />
        <div className="text-caption text-fg-muted">
          <div className="relative h-4 tabular-nums">
            <span className="absolute left-0">{formatNumber(-scale, "corr")}</span>
            <span className="absolute left-1/2 -translate-x-1/2">0</span>
            <span className="absolute right-0">{formatNumber(scale, "corr", { sign: true })}</span>
          </div>
          <p className="text-center">How strongly it went with {targetName} (-1 to +1, no unit)</p>
        </div>
      </div>
    </div>
  );
}
