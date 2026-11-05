import { describe, expect, it } from "vitest";
import { searchLimitSentence, spreadSentences, trustNumbers, trustSentence, trustTone, uncheckedSentence } from "@/components/campaign/plan/copy";
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
    expect(uncheckedSentence(["DO_pct"])).toBe("No range is reported for DO_pct, so it is not checked at the edges.");
    expect(uncheckedSentence([])).toBe("");
  });
});

describe("spreadSentences wording matches diversitySummary", () => {
  it("says Kalos, not the engine, and never shows the metric text or a notice code", () => {
    const text = spreadSentences({ requested: 5, returned: 5, near_duplicates_replaced: 0, min_separation: 0.05, metric: "max over continuous factors of |difference| / factor range" }, { code: "other_notice", requested: 5, returned: 5, min_separation: 0.05, message: "..." }).join(" ");
    expect(text).toContain("Kalos keeps proposals at least 5% apart");
    expect(text).toContain("The model sent a notice about this batch.");
    expect(text).not.toMatch(/engine|max over|factor range|other_notice/);
  });
});

describe("searchLimitSentence", () => {
  it("is null when the engine narrowed nothing", () => {
    expect(searchLimitSentence(null)).toBeNull();
    expect(searchLimitSentence([])).toBeNull();
  });

  it("states the narrowed range in plain words, without the engine's 'design box' term", () => {
    const s = searchLimitSentence([{ column: "pH", lower: 6.5, upper: 7.5, n_excluded: 1 }]);
    expect(s).toBe("The search was limited to a narrower range for 1 input: pH from 6.50 to 7.50 (1 run left out).");
    expect(s).not.toMatch(/design|box|space|engine/i);
  });
});
