import { describe, expect, it } from "vitest";
import { spreadSentences, trustNumbers, trustSentence, trustTone, uncheckedSentence } from "@/components/campaign/plan/copy";
import type { ReliabilityVerdict } from "@/lib/api";

const verdict = (over: Partial<ReliabilityVerdict>): ReliabilityVerdict => ({
  state: "reliable",
  label: "Reliable",
  rho: 0.65,
  ci: [0.41, 0.8],
  floor: 0.5,
  reason: "The model ranks held-out runs above the trust floor (0.50).",
  ...over,
});

describe("Plan trust verdict", () => {
  it("is one plain sentence per state, with a tone that is never the only signal", () => {
    expect(trustSentence(verdict({}))).toMatch(/^The model ranks past runs reliably/);
    expect(trustSentence(verdict({ state: "not-yet", label: "Not yet reliable" }))).toMatch(/rough guide\.$/);
    expect(trustSentence(verdict({ state: "insufficient", label: "Not enough data", rho: null }))).toMatch(/too few measured runs/);
    expect(trustTone(verdict({}))).toBe("good");
    expect(trustTone(verdict({ state: "not-yet" }))).toBe("warn");
    expect(trustTone(verdict({ state: "insufficient" }))).toBe("neutral");
  });

  it("keeps the numbers out of the sentence and puts them in trustNumbers", () => {
    expect(trustSentence(verdict({}))).not.toMatch(/0\.65|ρ/);
    expect(trustNumbers(verdict({}))).toBe("Rank agreement 0.65, 95% interval 0.41 to 0.80, trust floor 0.50.");
    expect(trustNumbers(verdict({ rho: null, ci: null, floor: null }))).toBeNull();
  });
});

describe("Plan spread and checks prose", () => {
  it("says the separation in plain words and never quotes the engine's metric or notice code", () => {
    const lines = spreadSentences(
      { requested: 5, returned: 4, near_duplicates_replaced: 1, min_separation: 0.05, metric: "max over continuous factors of |difference| / factor range" },
      { code: "fewer_distinct_candidates", requested: 5, returned: 4 },
    );
    const text = lines.join(" ");
    expect(text).toContain("at least 5% apart");
    expect(text).toContain("It replaced 1 near-duplicate proposal.");
    expect(text).toContain("shorter than requested");
    expect(text).not.toMatch(/max over|fewer_distinct_candidates|factor range|code/);
  });

  it("says a missing range plainly", () => {
    expect(uncheckedSentence(["DO_pct"])).toBe("The engine returns no range for DO_pct, so it is not checked at the edges.");
    expect(uncheckedSentence([])).toBe("");
  });
});
