import { describe, expect, it } from "vitest";
import type { Proposal } from "@/lib/api";
import { batchVerdict, bandLabel, proposalVerdict } from "@/lib/batch-verdict";

function proposal(pred: number, std = 1): Proposal {
  return { vals: [], pred, std, mode: "exploit", reason: "test" };
}

describe("batchVerdict", () => {
  it("separates 'predicts higher' from 'clears the band'", () => {
    // The case both headline banners used to describe wrongly: every proposal
    // predicts above best, none of them clears best once the band is applied.
    const v = batchVerdict([proposal(58.7), proposal(58.1)], 52.0, 9.18);
    expect(v.nAbove).toBe(2);
    expect(v.beats).toBe(0);
    expect(v.total).toBe(2);
  });

  it("counts a proposal that clears best at the low end of the band", () => {
    const v = batchVerdict([proposal(62.0), proposal(58.7)], 52.0, 9.18);
    expect(v.beats).toBe(1); // 62.0 - 9.18 = 52.82 >= 52.0; 58.7 - 9.18 does not
    expect(v.nAbove).toBe(2);
  });

  it("counts nothing above when every prediction is below best", () => {
    const v = batchVerdict([proposal(40), proposal(45)], 52.0, 9.18);
    expect(v.nAbove).toBe(0);
    expect(v.beats).toBe(0);
  });

  it("beats is never greater than nAbove", () => {
    // The band only ever makes the test stricter, so this invariant is what
    // keeps the two sentences from contradicting each other.
    const props = [proposal(58.7), proposal(62), proposal(40), proposal(52.001)];
    for (const band of [null, 0, 1, 9.18, 100]) {
      const v = batchVerdict(props, 52.0, band);
      expect(v.beats).toBeLessThanOrEqual(v.nAbove);
    }
  });

  it("falls back to each proposal's own std when there is no shared band", () => {
    // pred 60 with std 2 clears 52; pred 60 with std 20 does not.
    const v = batchVerdict([proposal(60, 2), proposal(60, 20)], 52.0, null);
    expect(v.beats).toBe(1);
    expect(v.band).toBeNull();
  });

  it("handles an empty batch", () => {
    const v = batchVerdict([], 52.0, 9.18);
    expect(v).toMatchObject({ nAbove: 0, beats: 0, total: 0 });
  });
});

describe("proposalVerdict", () => {
  it("only says 'beats' when the whole band clears best", () => {
    expect(proposalVerdict(62.0, 9.18, 52.0)).toBe("beats"); // 52.82 >= 52.0
    expect(proposalVerdict(58.7, 9.18, 52.0)).toBe("coin-flip"); // 49.52 < 52.0
  });

  it("only says 'below' when the whole band sits under best", () => {
    expect(proposalVerdict(40.0, 9.18, 52.0)).toBe("below"); // 49.18 <= 52.0
    expect(proposalVerdict(45.0, 9.18, 52.0)).toBe("coin-flip"); // 54.18 > 52.0
  });

  it("is the boundary-inclusive test the copy claims", () => {
    expect(proposalVerdict(61.18, 9.18, 52.0)).toBe("beats"); // exactly 52.0
    expect(proposalVerdict(42.82, 9.18, 52.0)).toBe("below"); // exactly 52.0
  });

  it("agrees with the band that gets displayed", () => {
    // The finding-8 regression, with the row that actually contradicted itself:
    // `58.74 ± 3.10 (+6.75 ~best)` against best 51.99. The printed band was the
    // GP std (3.10), but the verdict came from the conformal band (9.18). At the
    // band the reader was SHOWN, the interval [55.64, 61.84] clears best
    // outright - so "~best" looked flatly wrong. Whichever band is displayed
    // must be the one the verdict used.
    const pred = 58.74;
    const best = 51.99;
    expect(proposalVerdict(pred, 3.1, best)).toBe("beats"); // what the shown ±3.10 implies
    expect(proposalVerdict(pred, 9.18, best)).toBe("coin-flip"); // what the verdict used
  });

  it("widening the band can only weaken the claim", () => {
    let sawCoinFlip = false;
    for (const band of [0.5, 1, 3.18, 8.99, 50]) {
      const v = proposalVerdict(57.49, band, 52.0);
      if (v === "coin-flip") sawCoinFlip = true;
      // once uncertainty swamps the gap it must never go back to a hard call
      if (sawCoinFlip) expect(v).toBe("coin-flip");
    }
  });
});

describe("bandLabel", () => {
  it("quotes a shared conformal band", () => {
    expect(bandLabel(9.1752)).toBe("±9.18");
  });

  it("stays generic when there is no single band to quote", () => {
    // Per-proposal std varies, so naming one number would be a false precision.
    expect(bandLabel(null)).toBe("their uncertainty");
  });
});
