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

// Rendered text with tags collapsed, so label/value pairs in a <dl> read as one string.
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

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
    expect(campaignComparisons(campaign([{ round: 0, best: 4, n_base: 20 }, { round: 1, best: 4, n_base: 20 }]))[0])
      .toMatchObject({ improvement: 0, n_runs_added: 0 });
  });
  it("gives one comparison at round 1, where the previous round is the initial one", () => {
    expect(campaignComparisons(campaign([{ round: 0, best: 4, n_base: 20 }, { round: 1, best: 5, n_base: 23 }]))
      .map((c) => c.comparison_type)).toEqual(["initial"]);
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
    const t = text(html);
    expect(t).toContain("12 recipes");
    expect(t).toContain("Best reproducible recipe 6.00");
    expect(t).toContain("log(y + 2)");
    expect(t).toContain("Evaluation only");
    expect(t).toContain("not causation");
    expect(t).toContain("interior peak rank misses it");
    expect(t).toContain("pH interior peak rank misses it 0.80 6.50 2.00 1.50 0.10");
    expect(t).toContain("interactions");
    expect(t).not.toContain("Not measured means");
  });
  it("renders null estimates and the engine's unavailability reasons without fabricated values", () => {
    const html = renderToStaticMarkup(createElement(AnalysisDiagnostics, { d: {
      noise: { ...noise, icc: null, noise_sd: null, signal_sd: null, best_reproducible: null },
      alternative_scale: { scale: null, offset: null, cv_spearman: null, cv_ci95: null, calibration: null, icc: null, interpretation: null, reason: "transform not suggested" },
      gp_shapes: { available: false, reason: "too few recipes", swept_at: "median", n_features: 0, features: [], unmodeled: [] },
    } }));
    const t = text(html);
    expect(t).toContain("ICC not measured");
    expect(t).toContain("Best reproducible recipe not measured");
    expect(t).toContain("not zero noise");
    expect(t).toContain("Not run: transform not suggested.");
    expect(t).toContain("Unavailable: too few recipes.");
    expect(t).not.toContain("ICC 0.00");
  });
  it("does not repeat the variance check's reason in the log-scale box", () => {
    const reason = "only 0 replicated recipe(s)";
    const scale = { variance_mean_rho: null, homoscedastic: null, icc_raw: null, icc_log: null, icc_gain: null, log_offset: null, suggests_transform: false, reason };
    const t = text(renderToStaticMarkup(createElement(AnalysisDiagnostics, { d: {
      noise: { ...noise, scale },
      alternative_scale: { scale: null, offset: null, cv_spearman: null, cv_ci95: null, calibration: null, icc: null, interpretation: null, reason },
    } })));
    expect(t).toContain(`Variance check not run: ${reason}.`);
    expect(t).toContain("Not run, for the same reason as the variance check.");
    expect(t.split(reason)).toHaveLength(2);
  });
  it("prints a tiny log offset and near-one ICCs without rounding them away", () => {
    const reason = "variance rises with the mean";
    const scale = { variance_mean_rho: 0.98, homoscedastic: false, icc_raw: 0.936, icc_log: 0.997, icc_gain: 0.061, log_offset: 0.0003, suggests_transform: true, reason };
    const t = text(renderToStaticMarkup(createElement(AnalysisDiagnostics, { d: {
      noise: { ...noise, scale },
      alternative_scale: { scale: "log1p", offset: 0.0003, cv_spearman: 0.18, cv_ci95: [-0.09, 0.45], calibration: null, icc: 0.997, interpretation: null, reason },
    } })));
    expect(t).toContain("log(y + 0.0003)");
    expect(t).toContain("ICC raw → log 0.936 → 0.997");
    expect(t).toContain("ICC 0.997");
    expect(t).not.toContain("→ 1.00");
    expect(t).toContain("stay on the raw scale");
    expect(t.split(reason)).toHaveLength(2);
  });
  it("marks optimum and peak columns as not applicable for non-interior shapes", () => {
    const t = text(renderToStaticMarkup(createElement(AnalysisDiagnostics, { d: {
      gp_shapes: { available: true, reason: null, swept_at: "incumbent", n_features: 1,
        features: [{ name: "DO", relevance: 0.2, lengthscale: 2, shape: "monotonic_up", optimum_at: null,
          peak_gain: null, peak_separation_sd: null, spearman_rho: 0.4, missed_by_spearman: false }], unmodeled: [] },
    } })));
    expect(t).toContain("DO rises 0.20 - - - 0.40");
    expect(t).toContain("apply only to interior shapes");
    expect(t).not.toContain("not measured");
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
    expect(initial).toContain("Round comparisons start after the first re-analyze.");
    expect(initial).toContain("over 1 recorded round.");
    expect(initial).not.toContain("Engine status");
  });
});
