import { describe, expect, it } from "vitest";
import type { Campaign, CampaignRun, EngineNextAction, EngineStage } from "@/lib/api";
import { bestDeltaFromPreviousRound, campaignStage, displayRound, type StepState } from "@/lib/campaign-stage";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { breadcrumbFor, navKeyFor, titleFor } from "@/lib/routes";
import type { ActiveCampaign } from "@/lib/workbench";

const run = (id: string, result: number | null): CampaignRun => ({
  id,
  recipe: { pH: 7 },
  pred: 5,
  std: 0.3,
  mode: "exploit",
  reason: "",
  result,
  awaiting: result == null,
});

const campaign = (pending: CampaignRun[], round = 0): ActiveCampaign => ({
  has_campaign: true,
  target: "titer",
  features: ["pH"],
  n_base: 30,
  best: 5,
  round,
  history: [{ round: 0, best: 5, n_base: 30 }],
  pending,
  n_awaiting: pending.filter((r) => r.awaiting).length,
  n_measured: pending.filter((r) => !r.awaiting).length,
});

const NONE: Campaign = { has_campaign: false };
const states = (s: ReturnType<typeof campaignStage>): StepState[] => s.steps.map((x) => x.state);

describe("campaignStage", () => {
  it("no analysis: Setup is current, next is the upload", () => {
    const s = campaignStage({ has_data: false }, NONE);
    expect(s.round).toBeNull();
    expect(states(s)).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(s.next).toMatchObject({ stage: "setup", action: "Upload a run sheet", href: "/campaign/setup" });
  });

  it("analysis but no runs started: Plan is current for round 1", () => {
    const s = campaignStage({ has_data: true, proposals: [1, 2, 3, 4, 5] }, campaign([]));
    expect(s.round).toBe(1);
    expect(states(s)).toEqual(["done", "current", "upcoming", "upcoming", "upcoming"]);
    expect(s.steps[0].detail).toBe("Run sheet analyzed");
    expect(s.steps[1].detail).toBe("5 recipes proposed");
    expect(s.next).toMatchObject({ stage: "plan", action: "Review and start round 1", href: "/campaign/plan" });
  });

  it("an analysis without a seeded campaign still points at Plan", () => {
    const s = campaignStage({ has_data: true }, NONE);
    expect(s.round).toBe(1);
    expect(s.next.stage).toBe("plan");
  });

  it("runs awaiting results: Plan done, Run current, next is Record N results", () => {
    const s = campaignStage({ has_data: true }, campaign([run("a", null), run("b", null), run("c", null)], 2));
    expect(s.round).toBe(3);
    expect(states(s)).toEqual(["done", "done", "current", "upcoming", "upcoming"]);
    expect(s.steps[1].detail).toBe("3 runs started");
    expect(s.next).toMatchObject({ stage: "record", action: "Record 3 results", href: "/campaign/record" });
  });

  it("partial recording keeps Run current and shows progress on Record", () => {
    const s = campaignStage({ has_data: true }, campaign([run("a", 5.1), run("b", null)]));
    expect(states(s)).toEqual(["done", "done", "current", "upcoming", "upcoming"]);
    expect(s.steps[3].detail).toBe("1 of 2 recorded");
    expect(s.next.action).toBe("Record 1 result");
    expect(s).toMatchObject({ started: 2, awaiting: 1, measured: 1 });
  });

  it("all measured: Learn is current, every earlier stage says why it is done", () => {
    const s = campaignStage({ has_data: true }, campaign([run("a", 5.1), run("b", 4.2)], 1));
    expect(states(s)).toEqual(["done", "done", "done", "done", "current"]);
    expect(s.steps.filter((x) => x.state === "done").every((x) => x.detail.length > 0)).toBe(true);
    expect(s.next).toMatchObject({ stage: "learn", action: "Learn from round 2", href: "/campaign/learn" });
  });

  it("started runs win over a missing analysis (no fake upload prompt)", () => {
    expect(campaignStage({ has_data: false }, campaign([run("a", null)])).next.stage).toBe("record");
  });

  it("exactly one stage is current, with every done stage before it", () => {
    const cases = [campaign([]), campaign([run("a", null)]), campaign([run("a", 1)]), DEMO_CAMPAIGN];
    for (const st of [campaignStage({ has_data: false }, NONE), ...cases.map((c) => campaignStage({ has_data: true }, c))]) {
      const at = states(st).indexOf("current");
      expect(states(st).filter((x) => x === "current")).toHaveLength(1);
      expect(states(st).slice(0, at).every((x) => x === "done")).toBe(true);
      expect(states(st).slice(at + 1).every((x) => x === "upcoming")).toBe(true);
    }
  });

  it("the demo campaign reads as round 4 with 3 results to record", () => {
    const s = campaignStage({ has_data: true }, DEMO_CAMPAIGN);
    expect(s.round).toBe(4);
    expect(s.next.action).toBe("Record 3 results");
  });
});

describe("bestDeltaFromPreviousRound", () => {
  it("compares the current round's measured best with the previous round's", () => {
    expect(bestDeltaFromPreviousRound(DEMO_CAMPAIGN)?.previousRound).toBe(2);
    expect(bestDeltaFromPreviousRound(DEMO_CAMPAIGN)?.delta).toBeCloseTo(0.22);
  });

  it("is null before any re-analysis, or when a best is missing", () => {
    expect(bestDeltaFromPreviousRound(campaign([]))).toBeNull();
    const gap: ActiveCampaign = {
      ...campaign([], 1),
      history: [
        { round: 0, best: null, n_base: 3 },
        { round: 1, best: 5, n_base: 5 },
      ],
    };
    expect(bestDeltaFromPreviousRound(gap)).toBeNull();
  });
});

describe("routes", () => {
  it("maps every page to its sidebar section", () => {
    expect(navKeyFor("/")).toBe("campaign");
    expect(navKeyFor("/campaign/record")).toBe("campaign");
    expect(navKeyFor("/library/plate")).toBe("library");
    expect(navKeyFor("/projects/p-cho/report")).toBe("projects");
    expect(navKeyFor("/settings")).toBe("settings");
  });

  it("builds a section > page breadcrumb", () => {
    expect(breadcrumbFor("/campaign/plan").map((r) => r.label)).toEqual(["Campaign", "Plan"]);
    expect(breadcrumbFor("/library").map((r) => r.label)).toEqual(["Library"]);
    expect(breadcrumbFor("/projects").map((r) => r.label)).toEqual(["Projects"]);
  });

  it("titles every tab", () => {
    expect(titleFor("/")).toBe("Overview");
    expect(titleFor("/campaign/learn")).toBe("Learn");
    expect(titleFor("/library/scale-up")).toBe("Scale-up readout");
    expect(titleFor("/data")).toBe("Data");
    expect(titleFor("/projects/p-cho/report")).toBe("Report");
  });
});

describe("displayRound", () => {
  it("shows the engine's 0-based round as a 1-based round", () => {
    expect([displayRound(0), displayRound(2)]).toEqual([1, 3]);
  });
});

describe("engine stage", () => {
  const engineStage: EngineStage = {
    round: 7,
    current: "learn",
    started: 4,
    steps: [
      { key: "setup", state: "done", detail: "engine setup" },
      { key: "plan", state: "done", detail: "engine plan" },
      { key: "run", state: "done", detail: "engine run" },
      { key: "record", state: "done", detail: "engine record" },
      { key: "learn", state: "current", detail: "engine learn" },
    ],
  };
  const engineNext: EngineNextAction = { stage: "learn", action: "Engine action", reason: "Engine reason." };

  it("engine stage wins when present", () => {
    const s = campaignStage({ has_data: true }, { ...campaign([run("a", null)]), stage: engineStage, next_action: engineNext });
    expect(s.round).toBe(7);
    expect(s.started).toBe(4);
    expect(s.steps.map((x) => x.detail)).toEqual(["engine setup", "engine plan", "engine run", "engine record", "engine learn"]);
    expect(s.steps[4]).toMatchObject({ key: "learn", label: "Learn", href: "/campaign/learn", state: "current" });
    expect(s.next).toEqual({ stage: "learn", action: "Engine action", reason: "Engine reason.", href: "/campaign/learn" });
  });

  it("falls back when stage absent", () => {
    const s = campaignStage({ has_data: true }, campaign([]));
    expect(s.next.action).toBe("Review and start round 1");
  });

  const step = (key: EngineStage["steps"][number]["key"], state: EngineStage["steps"][number]["state"], detail = "") => ({ key, state, detail });
  const parity: [string, Parameters<typeof campaignStage>[0], Campaign, EngineStage, EngineNextAction][] = [
    [
      "no analysis",
      { has_data: false },
      NONE,
      { round: null, current: "setup", started: 0, steps: [step("setup", "current", "No run sheet yet"), step("plan", "upcoming"), step("run", "upcoming"), step("record", "upcoming"), step("learn", "upcoming")] },
      { stage: "setup", action: "Upload a run sheet", reason: "Kalos fits a model to the runs you already have, then proposes the first batch." },
    ],
    [
      "analysis, no runs",
      { has_data: true },
      campaign([]),
      { round: 1, current: "plan", started: 0, steps: [step("setup", "done", "Run sheet analyzed"), step("plan", "current", "Batch ready to review"), step("run", "upcoming"), step("record", "upcoming"), step("learn", "upcoming")] },
      { stage: "plan", action: "Review and start round 1", reason: "Review the proposed batch, untick any recipe you will not run, then start the rest." },
    ],
    [
      "started with awaiting",
      { has_data: true },
      campaign([run("a", 1), run("b", null)]),
      { round: 1, current: "run", started: 2, steps: [step("setup", "done", "Run sheet analyzed"), step("plan", "done", "2 runs started"), step("run", "current", "1 awaiting results"), step("record", "upcoming", "1 of 2 recorded"), step("learn", "upcoming")] },
      { stage: "record", action: "Record 1 result", reason: "1 of 2 results are in. Enter the rest as they come back from the lab." },
    ],
    [
      "all measured",
      { has_data: true },
      campaign([run("a", 1), run("b", 2)]),
      { round: 1, current: "learn", started: 2, steps: [step("setup", "done", "Run sheet analyzed"), step("plan", "done", "2 runs started"), step("run", "done", "All 2 back"), step("record", "done", "2 results recorded"), step("learn", "current", "Ready to update the model")] },
      { stage: "learn", action: "Learn from round 1", reason: "Every run in round 1 has a result. See what changed, then plan round 2." },
    ],
  ];

  it.each(parity)("engine-shaped %s equals the local derivation", (_name, latest, c, stage, next) => {
    const local = campaignStage(latest, c);
    const engine = campaignStage(latest, { ...c, stage, next_action: next });
    expect(engine.steps).toEqual(local.steps);
    expect(engine.next).toEqual(local.next);
    expect(engine.round).toBe(local.round);
  });
});
