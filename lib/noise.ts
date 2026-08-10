/**
 * The signal-to-noise read on an analysis: how much of the titer spread is real
 * recipe-to-recipe signal, and how much is assay noise.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. The engine returns two different "best"
 * numbers. `best_single` is the single highest measurement on the sheet, so it
 * rewards whichever well happened to catch a noise spike. `best_reproducible` is
 * the best replicate-averaged recipe, which is the titer a client could actually
 * ship. On a realistic replicated sheet those differ by around 10 percent, and
 * until now the portal showed neither, so a scientist optimizing against the
 * number they could see was chasing measurement luck.
 *
 * `icc` is the intraclass correlation: the fraction of variance that is real
 * signal rather than noise. It answers the question a scientist has to answer
 * before designing the next batch - spend it on replicates of what you have, or
 * on new recipes? The engine's own BENCHMARK.md calls this the most important
 * lever in the repo.
 *
 * Everything here is pure, so it is unit-tested without a DOM. Every field is
 * optional because an older engine build will not send the block at all, and an
 * engine that cannot estimate a statistic sends null rather than a fabricated
 * number - so absence must render as absence, never as zero.
 */

/** The engine's `noise` block from `POST /api/run` (kalos/portal/analysis.py). */
export type NoiseReport = {
  /** Distinct recipes on the sheet, after grouping identical feature rows. */
  n_recipes: number;
  /** How many of those recipes were run more than once. */
  n_replicated: number;
  /** True when the proposed batch was fit on the replicate-averaged objective
   *  with the measured noise floor handed to the GP. */
  replicate_aware: boolean;
  /** Fraction of variance that is real signal. Null when it cannot be estimated. */
  icc: number | null;
  /** Assay noise standard deviation, in the target's units. */
  noise_sd: number | null;
  /** Recipe-to-recipe signal standard deviation, in the target's units. */
  signal_sd: number | null;
  /** Best single measurement. Rewards a noise spike. */
  best_single: number | null;
  /** Best replicate-averaged recipe. The shippable number. */
  best_reproducible: number | null;
};

export type NoiseQuality = "signal-dominated" | "mixed" | "noise-dominated" | "unknown";

/**
 * Thresholds for reading an ICC. These are conventions, not derived constants,
 * and they are deliberately coarse because the ICC itself is estimated from a
 * handful of replicated recipes: presenting a hard cut at 0.7 would imply a
 * precision the estimate does not have.
 *
 * 0.5 is the meaningful boundary - below it, more than half the spread in the
 * target is measurement noise rather than recipe effect, which is the point
 * where optimizing single measurements stops being defensible.
 */
export const ICC_SIGNAL_DOMINATED = 0.7;
export const ICC_NOISE_DOMINATED = 0.5;

export function noiseQuality(icc: number | null | undefined): NoiseQuality {
  if (icc == null || !Number.isFinite(icc)) return "unknown";
  if (icc >= ICC_SIGNAL_DOMINATED) return "signal-dominated";
  if (icc >= ICC_NOISE_DOMINATED) return "mixed";
  return "noise-dominated";
}

/**
 * The gap between the best single measurement and the best reproducible recipe,
 * as an absolute difference and as a share of the reproducible value.
 *
 * This is the number that changes behaviour: it is how much apparent titer
 * evaporates when you stop counting measurement luck. Returns null when either
 * side is missing rather than treating an absent value as zero, and returns a
 * null `pct` when the reproducible best is zero or negative, since a percentage
 * of that is not meaningful.
 */
export function reproducibilityGap(
  noise: Pick<NoiseReport, "best_single" | "best_reproducible"> | null | undefined,
): { abs: number; pct: number | null } | null {
  const single = noise?.best_single;
  const repro = noise?.best_reproducible;
  if (single == null || repro == null) return null;
  if (!Number.isFinite(single) || !Number.isFinite(repro)) return null;
  const abs = single - repro;
  const pct = repro > 0 ? (abs / repro) * 100 : null;
  return { abs, pct };
}

/** How many recipes have no replicate at all. */
export function unreplicatedCount(
  noise: Pick<NoiseReport, "n_recipes" | "n_replicated"> | null | undefined,
): number | null {
  if (!noise) return null;
  const { n_recipes, n_replicated } = noise;
  if (!Number.isFinite(n_recipes) || !Number.isFinite(n_replicated)) return null;
  return Math.max(0, n_recipes - n_replicated);
}

/**
 * The one sentence a scientist should read first, and the action it implies.
 *
 * Deliberately prescriptive about the NEXT BATCH, because that is the decision
 * this block exists to inform. A noise-dominated sheet does not need more
 * recipes, it needs replicates; the reverse is also true and is the more common
 * mistake in a small-data campaign.
 */
export function noiseHeadline(noise: NoiseReport | null | undefined): string | null {
  if (!noise) return null;
  const quality = noiseQuality(noise.icc);
  const unreplicated = unreplicatedCount(noise);

  if (quality === "unknown") {
    if (noise.n_replicated === 0) {
      return `No recipe on this sheet was run twice, so assay noise cannot be separated from real recipe effect. A single high measurement here could be luck.`;
    }
    return `Not enough replicated recipes to estimate the signal-to-noise split on this sheet.`;
  }

  const iccPct = `${Math.round((noise.icc as number) * 100)}%`;
  if (quality === "noise-dominated") {
    return `Only ${iccPct} of the spread in this target is real recipe effect - most of it is assay noise. Spend the next batch on replicates, not new recipes.`;
  }
  if (quality === "mixed") {
    return `About ${iccPct} of the spread is real recipe effect. Replicating the leading recipes would sharpen the ranking before you explore further.`;
  }
  const tail =
    unreplicated && unreplicated > 0
      ? ` ${unreplicated} recipe${unreplicated === 1 ? "" : "s"} still ${unreplicated === 1 ? "has" : "have"} no replicate.`
      : "";
  return `${iccPct} of the spread in this target is real recipe effect, so the ranking is trustworthy.${tail}`;
}

/** Whether there is anything worth rendering. */
export function hasNoiseSignal(noise: NoiseReport | null | undefined): boolean {
  if (!noise) return false;
  return (
    noise.icc != null ||
    noise.best_reproducible != null ||
    noise.noise_sd != null ||
    noise.n_replicated > 0
  );
}
