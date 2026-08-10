import { describe, expect, it } from "vitest";

import {
  ICC_NOISE_DOMINATED,
  ICC_SIGNAL_DOMINATED,
  hasNoiseSignal,
  noiseHeadline,
  noiseQuality,
  reproducibilityGap,
  unreplicatedCount,
  type NoiseReport,
} from "@/lib/noise";

/**
 * The engine has always returned this block and the portal never showed it, so a
 * scientist's only visible "best" was `best_single` - the single highest reading,
 * which rewards whichever well caught a noise spike. These helpers exist to put
 * the shippable number beside it and to say what the split means for the next
 * batch, so the tests below are mostly about not overstating: absent values must
 * stay absent, and an unestimable statistic must not become a zero.
 */

const base: NoiseReport = {
  n_recipes: 20,
  n_replicated: 20,
  replicate_aware: true,
  icc: 0.901,
  noise_sd: 0.6256,
  signal_sd: 1.8895,
  best_single: 6.366,
  best_reproducible: 5.7593,
};

describe("noiseQuality", () => {
  it("classifies a signal-dominated sheet", () => {
    expect(noiseQuality(0.9)).toBe("signal-dominated");
    expect(noiseQuality(ICC_SIGNAL_DOMINATED)).toBe("signal-dominated");
  });

  it("classifies the middle band as mixed", () => {
    expect(noiseQuality(0.6)).toBe("mixed");
    expect(noiseQuality(ICC_NOISE_DOMINATED)).toBe("mixed");
  });

  it("classifies a noise-dominated sheet", () => {
    // Below 0.5 more than half the spread is measurement noise, which is where
    // optimizing single measurements stops being defensible.
    expect(noiseQuality(0.3)).toBe("noise-dominated");
  });

  it("returns unknown rather than guessing when the ICC is absent", () => {
    expect(noiseQuality(null)).toBe("unknown");
    expect(noiseQuality(undefined)).toBe("unknown");
    expect(noiseQuality(Number.NaN)).toBe("unknown");
  });
});

describe("reproducibilityGap", () => {
  it("quantifies how much apparent titer is measurement luck", () => {
    // The real numbers from a replicated 20-recipe sheet: chasing best_single
    // means chasing 0.61 g/L that does not reproduce.
    const gap = reproducibilityGap(base);
    expect(gap).not.toBeNull();
    expect(gap!.abs).toBeCloseTo(0.6067, 3);
    expect(gap!.pct).toBeCloseTo(10.53, 1);
  });

  it("returns null when either side is missing, never treating absent as zero", () => {
    expect(reproducibilityGap({ best_single: 5, best_reproducible: null })).toBeNull();
    expect(reproducibilityGap({ best_single: null, best_reproducible: 5 })).toBeNull();
    expect(reproducibilityGap(null)).toBeNull();
    expect(reproducibilityGap(undefined)).toBeNull();
  });

  it("omits the percentage when the reproducible best is not positive", () => {
    // A percentage of zero or a negative baseline is not meaningful, so the
    // absolute gap is still reported and the percentage is withheld.
    const gap = reproducibilityGap({ best_single: 0.4, best_reproducible: 0 });
    expect(gap!.abs).toBeCloseTo(0.4, 6);
    expect(gap!.pct).toBeNull();
  });
});

describe("unreplicatedCount", () => {
  it("counts recipes run only once", () => {
    expect(unreplicatedCount({ n_recipes: 20, n_replicated: 12 })).toBe(8);
    expect(unreplicatedCount({ n_recipes: 20, n_replicated: 20 })).toBe(0);
  });

  it("never returns a negative count", () => {
    expect(unreplicatedCount({ n_recipes: 3, n_replicated: 5 })).toBe(0);
  });

  it("returns null when the block is absent", () => {
    expect(unreplicatedCount(null)).toBeNull();
  });
});

describe("noiseHeadline", () => {
  it("tells a noise-dominated sheet to buy replicates, not recipes", () => {
    const text = noiseHeadline({ ...base, icc: 0.31 });
    expect(text).toContain("31%");
    expect(text).toMatch(/replicates, not new recipes/);
  });

  it("tells a signal-dominated sheet the ranking is trustworthy", () => {
    const text = noiseHeadline(base);
    expect(text).toContain("90%");
    expect(text).toMatch(/trustworthy/);
  });

  it("names the unreplicated remainder when there is one", () => {
    const text = noiseHeadline({ ...base, n_recipes: 20, n_replicated: 14 });
    expect(text).toContain("6 recipes");
  });

  it("says plainly that a sheet with no replicates cannot separate noise", () => {
    // The most important case: with nothing replicated, a high reading could be
    // luck and the UI must not let that pass unremarked.
    const text = noiseHeadline({ ...base, n_replicated: 0, icc: null });
    expect(text).toMatch(/no recipe on this sheet was run twice/i);
    expect(text).toMatch(/could be luck/i);
  });

  it("returns null when there is no block at all", () => {
    expect(noiseHeadline(null)).toBeNull();
    expect(noiseHeadline(undefined)).toBeNull();
  });
});

describe("hasNoiseSignal", () => {
  it("is false for an absent block, so an older engine renders nothing", () => {
    expect(hasNoiseSignal(null)).toBe(false);
    expect(hasNoiseSignal(undefined)).toBe(false);
  });

  it("is false when nothing was estimable and nothing was replicated", () => {
    expect(
      hasNoiseSignal({
        n_recipes: 8,
        n_replicated: 0,
        replicate_aware: false,
        icc: null,
        noise_sd: null,
        signal_sd: null,
        best_single: null,
        best_reproducible: null,
      }),
    ).toBe(false);
  });

  it("is true as soon as any one statistic came back", () => {
    expect(hasNoiseSignal({ ...base, icc: null, noise_sd: null, signal_sd: null })).toBe(true);
  });
});
