import { isReliable, type PopulatedResult } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * One plain-language sentence translating `reliability` into a verdict a
 * scientist can act on, rendered above the drivers/reliability grid so it's
 * the first thing read. Two states, keyed off `isReliable(d)` - the SAME
 * predicate the dataset pill and KPI sub-copy use elsewhere (lib/api.ts) -
 * so this verdict never disagrees with the rest of the page: an amber
 * callout when the model isn't trusted to rank recipes yet, a green one
 * when it is. Renders nothing if the engine didn't return a `reliability`
 * block (older analyses) - degrade gracefully rather than fabricate a claim
 * we can't support.
 *
 * Styled like the Operations "needs attention" run card: a colored left
 * stripe over the existing --amber/--green tokens, not a new color.
 */
export function ReliabilityVerdict({ d }: { d: PopulatedResult }) {
  const rel = d.reliability;
  if (!rel || rel.spearman == null || rel.ci95 == null) return null;

  const { spearman, ci95, spearman_floor, clears_floor } = rel;
  const includesZero = ci95[0] <= 0 && ci95[1] >= 0;
  const reliable = isReliable(d);

  // How many recommended recipes are actually predicted to beat the incumbent,
  // using the conformal band - so a reliable ranking doesn't get overstated as
  // "act on these" when none of them clears the current best.
  const band = d.conformal_q ?? null;
  const beats = d.proposals.filter((p) => p.pred - (band ?? p.std) >= d.best).length;
  const nProps = d.proposals.length;
  // The verdict is only "green" when the model both ranks reliably (the same
  // isReliable() bar as everywhere else) AND is proposing something it
  // believes beats the current best.
  const strong = reliable && beats > 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 text-[13px] leading-relaxed",
        strong
          ? "border border-green/30 bg-green-soft text-green"
          : "border border-amber/30 bg-amber-soft text-amber",
      )}
    >
      {reliable ? (
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
          {includesZero ? ", which includes zero" : ""}) -{" "}
          {clears_floor
            ? "it clears the trust floor, but the 95% interval still includes zero, so the ranking isn't confirmed yet."
            : `below the ${spearman_floor.toFixed(2)} trust floor.`}{" "}
          The drivers below are within noise and the recommendations are exploration to gather signal, not optimized
          picks.
        </>
      )}
    </div>
  );
}
