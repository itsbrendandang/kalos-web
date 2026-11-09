import { describe, expect, it } from "vitest";
import type { Campaign, LatestResult, Promotion } from "@/lib/api";
import {
  buildCampaignOverview,
  formatOverviewTimestamp,
  initialStageNav,
  integrateStageNav,
  parseStageParam,
  planCanStart,
  reduceStageNav,
  resolveAttention,
  stageStatus,
  withStageParam,
  type OverviewInput,
  type OverviewStage,
} from "@/lib/campaign-overview";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import type { UploadRejection } from "@/components/campaign/plan-view";

function latest(overrides: Record<string, unknown> = {}): LatestResult {
  return {
    has_data: true,
    dataset: "good.csv",
    updated: 1_700_000_000,
    campaign_generation: "gen-a",
    n: 12,
    d: 2,
    target: "titer (g/L)",
    group_col: null,
    targets: ["titer (g/L)"],
    features: ["pH", "Temp"],
    cv_spearman: 0.42,
    cv_ci95: [0.1, 0.7],
    cv_n_groups: 8,
    best: 2.4,
    drivers: [],
    proposal_features: ["pH"],
    proposals: [{ vals: [1], pred: 2.8, std: 0.2, mode: "explore", reason: "range" }],
    oof: [],
    reliability: {
      spearman: 0.42,
      ci95: [0.1, 0.7],
      spearman_floor: 0.2,
      clears_floor: true,
      ci_excludes_zero: false,
      unmodeled: [],
    },
    ...overrides,
  } as LatestResult;
}

function campaign(overrides: Record<string, unknown> = {}): Campaign {
  return {
    has_campaign: true,
    target: "titer (g/L)",
    features: ["pH", "Temp"],
    n_base: 12,
    best: 2.4,
    round: 2,
    history: [
      { round: 0, best: 2, n_base: 9 },
      { round: 2, best: 2.4, n_base: 12 },
    ],
    pending: [],
    n_awaiting: 0,
    n_measured: 4,
    analysis_in_sync: true,
    ...overrides,
  } as Campaign;
}

function input(overrides: Partial<OverviewInput> = {}): OverviewInput {
  return {
    latest: { data: latest(), error: false, loading: false },
    campaign: { data: campaign(), error: false, loading: false },
    rejection: null,
    selectedCount: null,
    startedHere: false,
    startInFlight: false,
    illustrative: false,
    ...overrides,
  };
}

const rejection: UploadRejection = {
  name: "bad.csv",
  forDataset: "good.csv",
  code: "target_constant",
  error: "target does not vary",
};

describe("missing counts are not zero", () => {
  it("leaves out a count the payload did not send", () => {
    const data = campaign();
    delete (data as { n_awaiting?: number }).n_awaiting;
    delete (data as { pending?: unknown }).pending;
    const model = buildCampaignOverview(input({ campaign: { data, error: false, loading: false } }));
    expect(model.round.pending).toBeNull();
    expect(model.round.pending).not.toBe(0);
    expect(model.round.failed).toBeNull();
    expect(model.results.failed).toBeNull();
    expect(model.round.completed).toBe(4);
  });

  it("does not turn a missing count into the length of pending", () => {
    const emptyRows = campaign();
    delete (emptyRows as { n_awaiting?: number }).n_awaiting;
    delete (emptyRows as { n_measured?: number }).n_measured;
    const none = buildCampaignOverview(input({ campaign: { data: { ...emptyRows, pending: [] } as Campaign, error: false, loading: false } }));
    expect(none.round.pending).toBeNull();
    expect(none.round.completed).toBeNull();
    expect(none.results.panel).toBe("partial");

    const waiting = {
      id: "r1",
      recipe: {},
      pred: 1,
      std: 0.1,
      mode: "explore" as const,
      reason: "x",
      result: null,
      awaiting: true,
    };
    const two = buildCampaignOverview(
      input({
        campaign: {
          data: { ...emptyRows, pending: [waiting, { ...waiting, id: "r2" }] } as Campaign,
          error: false,
          loading: false,
        },
      }),
    );
    expect(two.round.pending).toBeNull();
    expect(two.round.completed).toBeNull();
    expect(two.results.awaiting.map((run) => run.id)).toEqual(["r1", "r2"]);
  });

  it("keeps a reported zero", () => {
    const model = buildCampaignOverview(input());
    expect(model.round.pending).toBe(0);
    expect(model.round.completed).toBe(4);
  });

  it("does not treat a proposal or a zero result as the measured best", () => {
    const data = campaign({ best: null });
    const fit = latest({ best: null, proposals: [{ vals: [1], pred: 9, std: 0.1, mode: "exploit", reason: "high" }] });
    const model = buildCampaignOverview(input({ campaign: { data, error: false, loading: false }, latest: { data: fit, error: false, loading: false } }));
    expect(model.bestMeasured.value).toBeNull();
    expect(model.bestMeasured.source).toBeNull();
  });
});

describe("baseline, promotion, and start stay separate", () => {
  it("does not invent a control or a control delta", () => {
    const model = buildCampaignOverview(input());
    expect(model.baseline.value).toBeNull();
    expect(model.baseline.replicateCount).toBeNull();
    expect(model.measuredChange.versusControl).toBeNull();
    expect(model.measuredChange.fromPreviousRound?.context).toBe("vs uploaded data");
  });

  it("labels the previous round with the same display round as the heading", () => {
    const model = buildCampaignOverview(
      input({
        campaign: {
          data: campaign({
            round: 2,
            history: [
              { round: 0, best: 1.6, n_base: 8 },
              { round: 1, best: 2, n_base: 10 },
              { round: 2, best: 2.4, n_base: 12 },
            ],
          }),
          error: false,
          loading: false,
        },
      }),
    );
    expect(model.round.display).toBe(3);
    expect(model.measuredChange.fromPreviousRound?.context).toBe("vs round 2");
    expect(model.measuredChange.fromPreviousRound?.delta).toBeCloseTo(0.4);
    expect(model.objective.direction).toBeNull();
    expect(model.interval.provenance).toBe("unavailable");
  });

  it("labels a reported half-width as retrospective and omits a guessed coverage", () => {
    const model = buildCampaignOverview(input({ latest: { data: latest({ conformal_q: 0.3 }), error: false, loading: false } }));
    expect(model.interval.halfWidth).toBe(0.3);
    expect(model.interval.coverageLabel).toBeNull();
    expect(model.interval.provenance).toBe("retrospective");
    expect(model.interval.note).toMatch(/not a model standard deviation/);
  });

  it("does not let a failed promotion change canStart", () => {
    const promotion: Promotion = { passed: false, failures: ["surrogate_spearman below floor"], metrics: { surrogate_spearman: 0.1 }, summary: "no", meaning: "not yet" };
    const model = buildCampaignOverview(input({ latest: { data: latest({ promotion }), error: false, loading: false } }));
    expect(model.promotion.verdict).toBe("not-eligible");
    expect(model.promotion.passedCount).toBeNull();
    expect(model.promotion.detail).toBe("Some checks unavailable");
    expect(model.start.canStart).toBeNull();
    expect(model.start.label).toBe("Review required");
    expect(model.start.blocks).not.toContain("rejected-upload");
    expect(model.start.reason).toMatch(/separate decision/);
    expect(resolveAttention(model)).toBe("promotion");
  });

  it("does not treat a non-boolean promotion.passed as a failed verdict", () => {
    const broken = buildCampaignOverview(
      input({
        latest: {
          data: latest({ promotion: { passed: "no", failures: ["ece"], metrics: {}, summary: "no", meaning: "no" } }),
          error: false,
          loading: false,
        },
      }),
    );
    expect(broken.promotion.passed).toBeNull();
    expect(broken.promotion.verdict).toBe("not-evaluated");
    expect(broken.promotion.line).toBeNull();

    const failed = buildCampaignOverview(
      input({
        latest: {
          data: latest({ promotion: { passed: false, failures: ["ece unmeasured"], metrics: {}, summary: "no", meaning: "no" } }),
          error: false,
          loading: false,
        },
      }),
    );
    expect(failed.promotion.verdict).toBe("not-eligible");
    expect(failed.promotion.line).toMatch(/Not cleared to promote/);
  });

  it("says the batch is already started, and keeps an applied constraint applied when the floor is absent", () => {
    const started = buildCampaignOverview(
      input({
        campaign: {
          data: campaign({
            analysis_in_sync: false,
            n_awaiting: 1,
            pending: [{ id: "r1", recipe: {}, pred: 1, std: 0.1, mode: "explore", reason: "x", result: null, awaiting: true }],
          }),
          error: false,
          loading: false,
        },
      }),
    );
    expect(stageStatus(started, "experiments")).toBe("Already started");

    const constrained = buildCampaignOverview(
      input({
        latest: {
          data: latest({ constraint: { column: "pH", floor: null, n_rows_with_value: 4, applied: true, reason: "floor missing" } }),
          error: false,
          loading: false,
        },
      }),
    );
    expect(constrained.conditions.constraintNote).toMatch(/^Constrained by pH/);
    expect(constrained.conditions.constraintNote).not.toMatch(/not applied/);
  });

  it("matches plan canStart for a known selection and ignores promotion", () => {
    const open = planCanStart({ selectedCount: 2, rejectedUpload: false, previouslyStarted: false, inFlight: false, proposalCount: 4 });
    expect(open).toMatchObject({ canStart: true, label: "Ready to review" });
    const blocked = planCanStart({ selectedCount: 2, rejectedUpload: true, previouslyStarted: false, inFlight: false, proposalCount: 4 });
    expect(blocked.canStart).toBe(false);
    expect(blocked.label).toBe("Not available");
    const started = planCanStart({ selectedCount: 2, rejectedUpload: false, previouslyStarted: true, inFlight: false, proposalCount: 4 });
    expect(started.label).toBe("Already started");
    const flight = planCanStart({ selectedCount: 2, rejectedUpload: false, previouslyStarted: false, inFlight: true, proposalCount: 4 });
    expect(flight.canStart).toBe(false);
    const empty = planCanStart({ selectedCount: 0, rejectedUpload: false, previouslyStarted: false, inFlight: false, proposalCount: 4 });
    expect(empty).toMatchObject({ canStart: false, label: "Review required" });
  });
});

describe("resource states", () => {
  it("is idle before a request and loading while the first request is out", () => {
    const idle = buildCampaignOverview(
      input({
        latest: { data: null, error: false, loading: false },
        campaign: { data: null, error: false, loading: false },
      }),
    );
    expect(idle.results.fetch).toBe("idle");
    expect(idle.settled).toBe(false);
    expect(idle.identity).toBeNull();

    const loading = buildCampaignOverview(
      input({
        latest: { data: null, error: false, loading: true },
        campaign: { data: null, error: false, loading: true },
      }),
    );
    expect(loading.conditions.fetch).toBe("loading");
    expect(loading.fit.fetch).toBe("loading");
    expect(loading.gates.panel).toBe("loading");
  });

  it("is ready, partial, empty, error, stale, and blocked without inventing passes", () => {
    const ready = buildCampaignOverview(input());
    expect(ready.fit.fetch).toBe("ready");
    expect(ready.ranking.state).toBe("not-yet");
    expect(ready.results.panel).toBe("ready");
    expect(ready.conditions.panel).toBe("partial");
    expect(ready.conditions.missing).toContain("baseline");
    expect(ready.promotion.verdict).toBe("not-evaluated");
    expect(ready.gates.panel).toBe("empty");

    const empty = buildCampaignOverview(
      input({
        latest: { data: { has_data: false }, error: false, loading: false },
        campaign: { data: { has_campaign: false }, error: false, loading: false },
      }),
    );
    expect(empty.identity).toBe("none");
    expect(empty.conditions.panel).toBe("empty");
    expect(empty.results.panel).toBe("empty");
    expect(empty.fit.panel).toBe("empty");
    expect(empty.bestMeasured.value).toBeNull();
    expect(resolveAttention(empty)).toBe("conditions");

    const error = buildCampaignOverview(
      input({
        latest: { data: null, error: true, loading: false },
        campaign: { data: null, error: true, loading: false },
      }),
    );
    expect(error.results.fetch).toBe("error");
    expect(error.fit.fetch).toBe("error");
    expect(error.results.panel).toBe("error");
    expect(resolveAttention(error)).toBe("conditions");

    const stale = buildCampaignOverview(input({ campaign: { data: campaign(), error: true, loading: false } }));
    expect(stale.results.fetch).toBe("stale");
    expect(stale.bestMeasured.value).toBe(2.4);
    expect(stale.staleResources).toContain("campaign");

    const blocked = buildCampaignOverview(input({ rejection }));
    expect(blocked.conditions.panel).toBe("blocked");
    expect(blocked.start.canStart).toBe(false);
    expect(blocked.start.blocks).toContain("rejected-upload");
    expect(resolveAttention(blocked)).toBe("conditions");
  });

  it("sends pending runs to results ahead of a failed promotion", () => {
    const promotion: Promotion = { passed: false, failures: ["ece unmeasured"], metrics: {}, summary: "no", meaning: "unmeasured" };
    const model = buildCampaignOverview(
      input({
        latest: { data: latest({ promotion }), error: false, loading: false },
        campaign: { data: campaign({ n_awaiting: 3, pending: [{ id: "r1", recipe: {}, pred: 1, std: 0.1, mode: "explore", reason: "x", result: null, awaiting: true }] }), error: false, loading: false },
      }),
    );
    expect(resolveAttention(model)).toBe("results");
    expect(model.results.awaiting.map((run) => run.id)).toEqual(["r1"]);
    expect(model.start.label).not.toBe("Already started");
    expect(model.start.canStart).toBeNull();
  });

  it("treats out-of-sync pending runs as already started, still without reading promotion", () => {
    const model = buildCampaignOverview(
      input({
        latest: { data: latest({ promotion: { passed: false, failures: ["brier"], metrics: {}, summary: "no", meaning: "no" } }), error: false, loading: false },
        campaign: { data: campaign({ analysis_in_sync: false, pending: [{ id: "r1", recipe: {}, pred: 1, std: 0.1, mode: "explore", reason: "x", result: null, awaiting: true }], n_awaiting: 1 }), error: false, loading: false },
      }),
    );
    expect(model.start.label).toBe("Already started");
    expect(model.start.canStart).toBe(false);
    expect(resolveAttention(model)).toBe("results");
  });

  it("uses the reliability helper instead of a cutoff copied from an illustration", () => {
    const model = buildCampaignOverview(input());
    expect(model.ranking.label).toBe("Not yet reliable");
    expect(model.ranking.rho).toBe(0.42);
    expect(model.ranking.groupCount).toBe(8);
  });

  it("does not treat illustrative campaign numbers as a live analysis", () => {
    const model = buildCampaignOverview(
      input({
        illustrative: true,
        campaign: { data: DEMO_CAMPAIGN, error: false, loading: false },
        latest: { data: latest(), error: false, loading: false },
      }),
    );
    expect(model.illustrative).toBe(true);
    expect(model.identity).toBe("demo");
    expect(model.hasAnalysis).toBe(false);
    expect(model.bestMeasured.value).toBe(DEMO_CAMPAIGN.best);
    expect(model.ranking.state).toBe("not-evaluated");
    expect(model.draft.proposals).toBeNull();
  });
});

describe("stage URL reducer", () => {
  it("parses the five stages and rejects anything else", () => {
    expect(parseStageParam(null)).toBe("absent");
    expect(parseStageParam("results")).toBe("results");
    expect(parseStageParam("nope")).toBe("invalid");
    expect(parseStageParam("")).toBe("absent");
  });

  it("keeps other query parameters when it writes stage", () => {
    expect(withStageParam("/", new URLSearchParams("org=acme&stage=learning"), "results")).toBe("/?org=acme&stage=results");
  });

  it("lets a valid first URL win, replaces an invalid one, and pushes a click", () => {
    const deep = integrateStageNav(initialStageNav, { active: true, campaignKey: "dataset:good", param: "learning", attention: "results", settled: true });
    expect(deep.state.stage).toBe("learning");
    expect(deep.effect).toBeNull();

    const invalid = integrateStageNav(initialStageNav, { active: true, campaignKey: "dataset:good", param: "invalid", attention: "results", settled: true });
    expect(invalid.state.stage).toBe("results");
    expect(invalid.effect).toEqual({ op: "replace", stage: "results" });

    const absent = integrateStageNav(initialStageNav, { active: true, campaignKey: "dataset:good", param: "absent", attention: "experiments", settled: true });
    expect(absent.effect).toEqual({ op: "replace", stage: "experiments" });

    const clicked = reduceStageNav(absent.state, { type: "select", stage: "promotion" });
    expect(clicked.effect).toEqual({ op: "push", stage: "promotion" });
  });

  it("does not steal a pinned stage when attention changes, and Back follows the URL", () => {
    const pinned = reduceStageNav(
      { campaignKey: "dataset:good", stage: "results", pinned: true },
      { type: "attention", stage: "promotion" },
    );
    expect(pinned.state.stage).toBe("results");
    expect(pinned.effect).toBeNull();

    const back = reduceStageNav(pinned.state, { type: "url", campaignKey: "dataset:good", param: "experiments" });
    expect(back.state.stage).toBe("experiments");
    expect(back.effect).toBeNull();
  });

  it("resets to the new campaign default instead of keeping the previous tab", () => {
    const previous = { campaignKey: "dataset:good", stage: "promotion" as OverviewStage, pinned: true };
    const next = integrateStageNav(previous, { active: true, campaignKey: "dataset:next", param: "promotion", attention: "results", settled: true });
    expect(next.state.campaignKey).toBe("dataset:next");
    expect(next.state.stage).toBe("results");
    expect(next.effect).toEqual({ op: "replace", stage: "results" });
  });

  it("does not rewrite the URL while the home is inactive", () => {
    const held = integrateStageNav(initialStageNav, { active: false, campaignKey: null, param: "invalid", attention: "results", settled: true });
    expect(held.effect).toBeNull();
    expect(held.state).toBe(initialStageNav);
  });
});

describe("timestamp", () => {
  it("prints a zone label and does not treat seconds as milliseconds", () => {
    const label = formatOverviewTimestamp(1_700_000_000, "UTC");
    expect(label).toMatch(/UTC/);
    expect(label).toMatch(/2023/);
  });
});
