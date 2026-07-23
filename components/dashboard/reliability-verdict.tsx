import type { PopulatedResult } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * One plain-language sentence translating `reliability` into a verdict a
 * scientist can act on, rendered above the drivers/reliability grid so it's
 * the first thing read. Two states, keyed off `clears_floor` (the same
 * floor `isReliable` checks): an amber callout when the model isn't trusted
 * to rank recipes yet, a green one when it is. Renders nothing if the
 * engine didn't return a `reliability` block (older analyses) - degrade
 * gracefully rather than fabricate a claim we can't support.
 *
 * Styled like the Operations "needs attention" run card: a colored left
 * stripe over the existing --amber/--green tokens, not a new color.
 */
export function ReliabilityVerdict({ d }: { d: PopulatedResult }) {
  const rel = d.reliability;
  if (!rel || rel.spearman == null || rel.ci95 == null) return null;

  const { spearman, ci95, spearman_floor, clears_floor } = rel;
  const includesZero = ci95[0] <= 0 && ci95[1] >= 0;

  // How many recommended recipes are actually predicted to beat the incumbent,
  // using the conformal band - so a reliable ranking doesn't get overstated as
  // "act on these" when none of them clears the current best.
  const band = d.conformal_q ?? null;
  const beats = d.proposals.filter((p) => p.pred - (band ?? p.std) >= d.best).length;
  const nProps = d.proposals.length;
  // The verdict is only "green" when the model both ranks reliably AND is
  // proposing something it believes beats the current best.
  const strong = clears_floor && beats > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 text-[13px] leading-relaxed",
        strong
          ? "border-l-4 border-green/30 border-l-green bg-green-soft text-green"
          : "border-l-4 border-amber/30 border-l-amber bg-amber-soft text-amber",
      )}
    >
      {clears_floor ? (
        <>
          The model ranks recipes reliably (rank agreement {spearman.toFixed(2)}, floor {spearman_floor.toFixed(2)}) -
          drivers are trustworthy.{" "}
          {beats > 0 ? (
            <>
              {beats} of {nProps} recommendations {beats === 1 ? "is" : "are"} predicted to beat your current best; the
              wide ± bands mean read the order as a guide, not a guarantee.
            </>
          ) : (
            <>
              But none of the recommended recipes is predicted to beat your current best - they are exploration around
              it, not confident bets.
            </>
          )}
        </>
      ) : (
        <>
          This model can&rsquo;t reliably rank recipes yet. Held-out rank agreement is {spearman.toFixed(2)} (95%
          range {ci95[0].toFixed(2)} to {ci95[1].toFixed(2)}
          {includesZero ? ", which includes zero" : ""}) - below the {spearman_floor.toFixed(2)} trust floor. The
          drivers below are within noise and the recommendations are exploration to gather signal, not optimized
          picks.
        </>
      )}
    </div>
  );
}
