// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReliabilityScorecard } from "@/components/viz/charts/reliability-scorecard";
import {
  describeScorecard,
  promotionChecklist,
  scorecardTable,
  sourceFooter,
  toScorecard,
  topkText,
  type ScorecardInput,
} from "@/lib/viz-data/reliability-scorecard";

afterEach(cleanup);

const src = { label: "Analysis of good.csv", field: "cv_spearman", basis: "derived" as const, engineVersion: "0.1.0" };

const rel = {
  spearman: 0.706,
  ci95: [0.585, 0.794] as [number, number],
  spearman_floor: 0.2,
  clears_floor: true,
  ci_excludes_zero: true,
  unmodeled: [],
  producer_spearman: 0.934,
  producer_clears_floor: true,
  n_producers: 95,
  producer_threshold: 0,
};

// Live E2E analysis, trimmed.
const reliable: ScorecardInput = {
  n: 165,
  cv_spearman: 0.706,
  cv_ci95: [0.585, 0.794],
  cv_n_groups: 165,
  cv_n_repeats: 2,
  cv_spearman_per_repeat: [0.706, 0.697],
  reliability: rel,
  cv_logo: { spearman: null, n_groups: null, n_oof: null, reason: "no declared/detected group column" },
  cv_topk: { overlap: 0.8, k: 5, n: 165, evaluable: true, reason: null },
  cv_group_mean_baseline: { spearman: null, n_evaluable: 0, n_groups_used: 0, interpretation: null, reason: "only 0 recipes have 2+ rows" },
  promotion: {
    passed: true,
    failures: [],
    metrics: { surrogate_spearman: 0.7059, feasibility_auc: 0.6666, ece: 0.1336, brier: 0.2342 },
    summary: "ALL GATES PASSED",
    meaning: "passed=false means not yet shown fit to promote.",
    not_judged: ["group-mean floor: only 0 recipes have 2+ rows; need at least 5"],
  },
};

// Live Smoke (kaggle) analysis: below the floor, CI spans zero, three gates unmeasured.
const weak: ScorecardInput = {
  ...reliable,
  n: 715,
  cv_spearman: 0.045,
  cv_ci95: [-0.027, 0.122],
  cv_spearman_per_repeat: [0.045, 0.043],
  reliability: { ...rel, spearman: 0.045, ci95: [-0.027, 0.122], clears_floor: false, ci_excludes_zero: false, producer_spearman: 0.045, producer_clears_floor: false, n_producers: 715 },
  cv_topk: { overlap: 0, k: 5, n: 715, evaluable: true, reason: null },
  promotion: {
    passed: false,
    failures: ["surrogate_spearman=0.045 < min 0.2", "feasibility_auc missing/NaN (unmeasured)", "ece missing/NaN (unmeasured)", "brier missing/NaN (unmeasured)"],
    metrics: { surrogate_spearman: 0.0451 },
    summary: "GATES FAILED",
    meaning: "not yet shown fit",
  },
};

describe("toScorecard", () => {
  it("plots the model row with its engine CI and per-repeat ticks, and lists unscored rows with the engine's reason", () => {
    const s = toScorecard(reliable);
    expect(s.verdict.label).toBe("Reliable");
    expect(s.rows.map((r) => r.key)).toEqual(["cv", "producers"]);
    expect(s.rows[0]).toMatchObject({ rho: 0.706, ci: [0.585, 0.794], repeats: [0.706, 0.697], note: "2 repeats" });
    expect(s.rows[1]).toMatchObject({ rho: 0.934, ci: null, note: "95 runs above 0.00, clears the floor" });
    expect(s.unscored.map((r) => [r.key, r.state])).toEqual([
      ["group-mean", { kind: "not-scored", reason: "only 0 recipes have 2+ rows" }],
      ["logo", { kind: "not-scored", reason: "no declared/detected group column" }],
    ]);
    expect(s.floor).toBe(0.2);
    expect(s.domain).toEqual([-0.05, 1]);
    expect(s.topk).toEqual({ hits: 4, k: 5, n: 165 });
    expect(s.repeatCaption).toBeNull();
  });

  it("extends the axis below zero when the CI does, and keeps the floor from the engine", () => {
    const s = toScorecard(weak);
    expect(s.verdict.label).toBe("Not yet reliable");
    expect(s.domain[0]).toBeCloseTo(-0.077, 10);
    expect(s.domain[1]).toBe(1);
    expect(toScorecard({ ...weak, reliability: { ...weak.reliability!, spearman_floor: 0.3 } }).floor).toBe(0.3);
  });

  it("hides every row behind the verdict when rho was not measured", () => {
    const s = toScorecard({ ...reliable, cv_spearman: null, cv_ci95: null, reliability: undefined });
    expect(s.verdict.state).toBe("insufficient");
    expect(s.rows).toEqual([]);
    expect(s.unscored).toEqual([]);
  });

  it("shows only the model row when every optional field is absent, with the single-partition caption", () => {
    const s = toScorecard({ n: 40, cv_spearman: 0.88, cv_ci95: [0.72, 0.932], cv_n_repeats: 1, cv_spearman_per_repeat: [0.88] });
    expect(s.rows.map((r) => r.key)).toEqual(["cv"]);
    expect(s.rows[0].repeats).toEqual([]);
    expect(s.repeatCaption).toBe("1 partition only; the interval reflects group resampling.");
    expect(s.topk).toBeNull();
    expect(s.promotion).toBeNull();
    expect(s.baseline).toBeNull();
  });

  it("raises the baseline callout only when the model does not beat a scored baseline", () => {
    const gm = { spearman: 0.9, n_evaluable: 30, n_groups_used: 10, interpretation: "most signal is recipe identity", reason: null };
    const s = toScorecard({ ...reliable, cv_group_mean_baseline: gm });
    expect(s.baseline).toEqual({ text: "Group-mean baseline ρ 0.90 (30 rows, 10 groups): most signal is recipe identity", prominent: true });
    expect(s.rows.find((r) => r.key === "group-mean")?.note).toBe("the model does not beat it");
    expect(toScorecard({ ...reliable, cv_group_mean_baseline: { ...gm, spearman: 0.2 } }).baseline?.prominent).toBe(false);
  });

  it("states an unevaluable top-k with the engine's reason", () => {
    const s = toScorecard({ ...reliable, cv_topk: { overlap: null, k: 5, n: 3, evaluable: false, reason: "fewer than 5 evaluable rows" } });
    expect(s.topk).toEqual({ kind: "not-scored", reason: "fewer than 5 evaluable rows" });
    expect(topkText(s.topk)).toBe("Not scored: fewer than 5 evaluable rows");
    expect(topkText(toScorecard(reliable).topk)).toBe("4 of the true top 5 caught by the model's top 5 (n = 165)");
  });
});

describe("promotionChecklist", () => {
  it("marks a gate passed only when the engine reported its metric and named no failure", () => {
    const c = promotionChecklist(reliable.promotion)!;
    expect(c.gates.map((g) => [g.key, g.status])).toEqual([
      ["surrogate_spearman", "passed"],
      ["feasibility_auc", "passed"],
      ["ece", "passed"],
      ["brier", "passed"],
      ["group-mean floor: only 0 recipes have 2+ rows; need at least 5", "not-judged"],
    ]);
    expect(c.gates[4]).toMatchObject({ label: "group-mean floor", engine: "only 0 recipes have 2+ rows; need at least 5" });
    expect([c.nPassed, c.judged]).toEqual([4, 4]);
  });

  it("splits measured misses from unmeasured gates (neutral, not bad)", () => {
    const c = promotionChecklist(weak.promotion)!;
    expect(c.gates.map((g) => [g.key, g.status, g.value])).toEqual([
      ["surrogate_spearman", "missed", 0.0451],
      ["feasibility_auc", "unmeasured", null],
      ["ece", "unmeasured", null],
      ["brier", "unmeasured", null],
    ]);
    expect(c.gates[0].engine).toBe("surrogate_spearman=0.045 < min 0.2");
    expect([c.nPassed, c.judged]).toEqual([0, 4]);
  });

  it("keeps failures it cannot attribute, verbatim", () => {
    const c = promotionChecklist({ passed: false, failures: ["something odd (unmeasured)"], metrics: {}, summary: "", meaning: "" })!;
    expect(c.gates).toEqual([{ key: "something", label: "something", status: "unmeasured", value: null, engine: "something odd (unmeasured)" }]);
  });
});

describe("scorecard text", () => {
  it("describes rows, floor, unscored rows, top-k and promotion", () => {
    expect(describeScorecard(toScorecard(weak))).toBe(
      "Model reliability: Not yet reliable. Model, grouped CV: ρ 0.05 [\u22120.03, 0.12] 95% CI, per repeat 0.05, 0.04 (2 repeats). Producers only: ρ 0.05 (715 runs above 0.00, below the floor). Trust floor 0.20. Group-mean baseline: Not scored, only 0 recipes have 2+ rows. Next unseen group (LOGO): Not scored, no declared/detected group column. Top-k: 0 of the true top 5 caught by the model's top 5 (n = 715). Promotion gates not passed: 0 of 4 passed.",
    );
  });

  it("tables every row, unscored ones with their state and reason", () => {
    const t = scorecardTable(toScorecard(reliable));
    expect(t.columns).toEqual(["Check", "ρ", "95% CI", "Per repeat", "Note"]);
    expect(t.rows[0]).toEqual(["Model, grouped CV", "0.71", "[0.59, 0.79]", "0.71, 0.70", "2 repeats"]);
    expect(t.rows[2]).toEqual(["Group-mean baseline", "Not scored", "n/a", "n/a", "only 0 recipes have 2+ rows"]);
    expect(t.rows.at(-1)).toEqual(["Trust floor (engine)", "0.20", "n/a", "n/a", ""]);
  });

  it("builds the footer line from the source", () => {
    expect(sourceFooter(src, 165, "grouped cross-validation")).toBe("From: Analysis of good.csv · n = 165 · grouped cross-validation · engine 0.1.0");
    expect(sourceFooter({ label: "Engine analysis" }, null, null)).toBe("From: Engine analysis");
  });
});

describe("ReliabilityScorecard", () => {
  it("draws the dotted engine floor, the CI bar and one tick per repeat, with keyboard tooltips", () => {
    const { container } = render(<ReliabilityScorecard data={toScorecard(reliable)} source={src} width={900} />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toMatch(/^Model reliability: Reliable\./);
    expect(svg.textContent).toMatch(/trust floor 0\.20/);
    expect(svg.querySelector('line[stroke-dasharray="1 3"]')).toBeTruthy();
    const marks = screen.getAllByRole("button", { name: /ρ/ });
    expect(marks).toHaveLength(2);
    fireEvent.focus(marks[0]);
    expect(screen.getByRole("tooltip").textContent).toMatch(/ρ 0\.71 \[0\.59, 0\.79\] 95% CI/);
    expect(container.textContent).toMatch(/Next unseen group \(LOGO\)Not scored: no declared\/detected group column/);
    expect(container.textContent).toMatch(/4 of the true top 5 caught/);
  });

  it("replaces the chart with the verdict reason when rho was not measured", () => {
    render(<ReliabilityScorecard data={toScorecard({ n: 4, cv_spearman: null })} source={src} width={900} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/not enough held-out runs/)).toBeTruthy();
  });
});
