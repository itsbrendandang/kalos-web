import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { campaignComparisons, isReliable, proposalIncumbent, type Campaign, type Diagnostics } from "@/lib/api";
import { AnalysisDiagnostics } from "@/components/dashboard/analysis-diagnostics";
import { CampaignProgress } from "@/components/dashboard/campaign-progress";

// Chart geometry is checked through its input; server rendering exercises the real copy.
vi.mock("@/components/charts", () => ({
  ProgressChart: ({ data }: { data: unknown }) => createElement("pre", null, JSON.stringify(data)),
}));

const noise: Diagnostics["noise"] = {
  n_recipes: 12, n_replicated: 8, replicate_aware: true,
  icc: 0.5, noise_sd: 1, signal_sd: 1, best_single: 10,
  best_reproducible: 6, scale: null,
};

describe("proposal incumbent", () => {
  it("uses the engine's reproducible incumbent rather than the single-run maximum", () => {
    expect(proposalIncumbent({ best: 10, noise })).toBe(6);
    expect(proposalIncumbent({ best: 10, noise: { ...noise, best_reproducible: 0 } })).toBe(0);
  });
  it("does not substitute a single-run best when the reproducible incumbent is unavailable", () => {
    expect(proposalIncumbent({ best: 10, noise: { ...noise, best_reproducible: null } })).toBeNull();
  });
  it("supports older engines and fits that are not replicate-aware", () => {
    expect(proposalIncumbent({ best: 10 })).toBe(10);
    expect(proposalIncumbent({ best: 10, noise: { ...noise, replicate_aware: false } })).toBe(10);
  });
  it("keeps producer-only diagnostics out of the reliability verdict", () => {
    expect(isReliable({ cv_spearman: 0.1, reliability: {
      spearman: 0.1, ci95: [-0.1, 0.3], spearman_floor: 0.2,
      clears_floor: false, ci_excludes_zero: false, unmodeled: [],
      producer_spearman: 0.9, producer_clears_floor: true, n_producers: 20, producer_threshold: 0,
    } })).toBe(false);
  });
});

type Active = Extract<Campaign, { has_campaign: true }>;
function campaign(history: Active["history"]): Active {
  const last = history.at(-1);
  return { has_campaign: true, target: "titer", features: [], n_base: last?.n_base ?? 0,
    best: last?.best ?? null, round: last?.round ?? 0, history, pending: [], n_awaiting: 0, n_measured: 0 };
}

describe("campaign round comparisons", () => {
  it("compares initial and immediately previous rounds using percentage changes and added runs", () => {
    const result = campaignComparisons(campaign([
      { round: 0, best: 10, n_base: 20 }, { round: 1, best: 12, n_base: 22 }, { round: 2, best: 15, n_base: 25 },
    ]));
    expect(result[0]).toEqual({ baseline_round: 0, current_round: 2, baseline_best: 10,
      current_best: 15, improvement: 50, n_runs_added: 5, comparison_type: "initial" });
    expect(result[1]).toMatchObject({ baseline_round: 1, improvement: 25, n_runs_added: 3, comparison_type: "previous" });
  });
  it("shows plateau and zero added runs honestly", () => {
    expect(campaignComparisons(campaign([{ round: 0, best: 4, n_base: 20 }, { round: 1, best: 4, n_base: 20 }]))[1])
      .toMatchObject({ improvement: 0, n_runs_added: 0 });
  });
  it.each([0, -2])("uses absolute change for nonpositive baseline %s", (best) => {
    expect(campaignComparisons(campaign([{ round: 0, best, n_base: 20 }, { round: 1, best: 4, n_base: 22 }]))[0].improvement).toBe(4 - best);
  });
  it("preserves a null previous round instead of searching for an earlier measured baseline", () => {
    const result = campaignComparisons(campaign([{ round: 0, best: 2, n_base: 20 }, { round: 1, best: null, n_base: 22 }, { round: 2, best: 4, n_base: 25 }]));
    expect(result[0].improvement).toBe(100);
    expect(result[1]).toMatchObject({ baseline_round: 1, baseline_best: null, improvement: null, n_runs_added: 3 });
  });
  it("preserves null initial and current measurements", () => {
    expect(campaignComparisons(campaign([{ round: 0, best: null, n_base: 20 }, { round: 1, best: 4, n_base: 22 }]))[0].improvement).toBeNull();
    expect(campaignComparisons(campaign([{ round: 0, best: 2, n_base: 20 }, { round: 1, best: null, n_base: 22 }])).every((c) => c.improvement === null)).toBe(true);
  });
  it("does not create comparisons for empty, one-point, or reseeded histories", () => {
    expect(campaignComparisons(campaign([]))).toEqual([]);
    expect(campaignComparisons(campaign([{ round: 0, best: 99, n_base: 10 }]))).toEqual([]);
    expect(campaignComparisons(campaign([{ round: 0, best: 1, n_base: 30 }, { round: 1, best: 2, n_base: 31 }]))[0].baseline_best).toBe(1);
  });
});

describe("diagnostic readout", () => {
  it("renders nothing for older-engine payloads", () => {
    expect(renderToStaticMarkup(createElement(AnalysisDiagnostics, { d: {} }))).toBe("");
  });
  it("reports present diagnostics and explains the transform and model relevance", () => {
    const html = renderToStaticMarkup(createElement(AnalysisDiagnostics, { d: {
      noise,
      alternative_scale: { scale: "log1p", offset: 2, cv_spearman: 0.6, cv_ci95: [0.4, 0.8], calibration: null, icc: 0.7, interpretation: "Evaluation only", reason: null },
      gp_shapes: { available: true, reason: null, swept_at: "median", n_features: 1,
        features: [{ name: "pH", relevance: 0.8, lengthscale: 1.2, shape: "interior_optimum", optimum_at: 6.5,
          peak_gain: 2, peak_separation_sd: 1.5, spearman_rho: 0.1, missed_by_spearman: true }], unmodeled: ["interactions"] },
    } }));
    expect(html).toContain("12 recipes");
    expect(html).toContain("best reproducible recipe: 6.00");
    expect(html).toContain("log(y + offset)");
    expect(html).toContain("not causal importance");
    expect(html).toContain("interior optimum");
    expect(html).toContain("Shape missed by Spearman");
    expect(html).toContain("interactions");
  });
  it("renders null estimates and the engine's unavailability reasons without fabricated values", () => {
    const html = renderToStaticMarkup(createElement(AnalysisDiagnostics, { d: {
      noise: { ...noise, icc: null, noise_sd: null, signal_sd: null, best_reproducible: null },
      alternative_scale: { scale: null, offset: null, cv_spearman: null, cv_ci95: null, calibration: null, icc: null, interpretation: null, reason: "transform not suggested" },
      gp_shapes: { available: false, reason: "too few recipes", swept_at: "median", n_features: 0, features: [], unmodeled: [] },
    } }));
    expect(html).toContain("ICC: n/a (not measured)");
    expect(html).toContain("transform not suggested");
    expect(html).toContain("too few recipes");
    expect(html).not.toContain("ICC: 0.00");
  });
});

describe("campaign progress readout", () => {
  it("keeps missing chart points and shows the engine sync status", () => {
    const c = campaign([{ round: 0, best: 2, n_base: 20 }, { round: 1, best: null, n_base: 22 }, { round: 2, best: 4, n_base: 25 }]);
    const html = renderToStaticMarkup(createElement(CampaignProgress, { campaign: { ...c, analysis_in_sync: false } }));
    expect(html).toContain("analysis is out of sync");
    expect(html).toContain("&quot;best&quot;:null");
    expect(html).toContain("a compared round has no measured best");
    expect(html).toContain("5 runs added");
  });
  it("explains a zero baseline and one-point history", () => {
    const html = renderToStaticMarkup(createElement(CampaignProgress, { campaign: campaign([{ round: 0, best: 0, n_base: 20 }, { round: 1, best: 4, n_base: 22 }]) }));
    expect(html).toContain("baseline is zero or negative");
    expect(html).not.toContain("4.00%");
    const initial = renderToStaticMarkup(createElement(CampaignProgress, { campaign: campaign([{ round: 0, best: 3, n_base: 20 }]) }));
    expect(initial).toContain("Round comparisons unavailable");
    expect(initial).not.toContain("Engine status");
  });
});
